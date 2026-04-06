# Chronicle — Implementation Plan

This document is the authoritative implementation plan for the Chronicle MVP. It incorporates all decisions from the initial idea, functional requirements (FR doc), and planning discussions, with gaps resolved.

**Companion documents:**
- `docs/intial-idea.md` — Original concept and motivation
- `docs/functional-requirements.md` — Complete functional requirements (FR-1 through FR-14)

---

## 1. Technology Stack

[STATUS]: Done

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Language | TypeScript (Node.js) | Native fit for agent ecosystems, minimal deps |
| Database | SQLite via `better-sqlite3` | Synchronous, fast, zero-config, single-file |
| CLI framework | `commander` | Lightweight, standard Node.js CLI library |
| UUID generation | `crypto.randomUUID()` | Built-in Node.js, no dependency |
| Token estimation | `Math.ceil(text.length / 4)` | Heuristic, no tokenizer dependency |
| Build | `tsup` (bundles to dist/) | Compiles TS to JS for distribution, handles CJS/ESM |
| Packaging | `npm install -g chronicle-memory` | Global CLI, works in any repo |

**Runtime dependencies (2 only):** `better-sqlite3`, `commander`
**Dev dependencies:** `typescript`, `tsup`, `vitest`, `@types/better-sqlite3`

---

## 2. Architecture

[STATUS]: Defined

```
┌─────────────────────────────────────────────────────────┐
│  Coding Agent (Claude Code / GH Copilot)                │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ SessionStart  │  │ Skills       │  │ Custom        │ │
│  │ Hook          │  │ /create-     │  │ Instructions  │ │
│  │ (inject       │  │  memory      │  │ (retrieval    │ │
│  │  catalog)     │  │ /update-     │  │  decision     │ │
│  │               │  │  memory      │  │  logic)       │ │
│  │               │  │ /recall      │  │               │ │
│  │               │  │ /list-       │  │               │ │
│  │               │  │  memories    │  │               │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────────┘ │
│         │                  │                             │
│         ▼                  ▼                             │
│  ┌─────────────────────────────────────┐                │
│  │  chronicle CLI  (global binary)     │                │
│  │  chronicle init / create / update / │                │
│  │  get / list / delete / supersede /  │                │
│  │  search / hook                      │                │
│  └──────────────┬──────────────────────┘                │
└─────────────────┼───────────────────────────────────────┘
                  │
                  ▼
        ┌─────────────────┐
        │  .chronicle/     │
        │  ├─ chronicle.db │  ← SQLite (WAL mode)
        │  └─ config.json  │  ← Per-project config
        └─────────────────┘
        (version-controlled)
```

**Key architectural decision:** Hook scripts do NOT reference compiled JS file paths. Instead, the hook config calls `chronicle hook session-start` — a CLI subcommand. This works regardless of whether Chronicle is installed globally or locally, and avoids path resolution issues across platforms.

---

## 3. SQLite Schema

[STATUS]: Done

```sql
-- Default journal mode (rollback journal) — simpler Git story than WAL,
-- single .db file always contains latest state.

CREATE TABLE IF NOT EXISTS memories (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  description       TEXT NOT NULL,
  summary           TEXT NOT NULL,
  session_agent     TEXT,
  parent_ids        TEXT DEFAULT '[]',
  superseded_by_id  TEXT,
  token_count       INTEGER,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memories_active
  ON memories(superseded_by_id, created_at DESC);

-- Schema version tracking for future migrations
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
INSERT OR IGNORE INTO schema_version (version, applied_at)
  VALUES (1, datetime('now'));
```

**Design notes:**
- `parent_ids`: JSON array. When session loads memories A+B, creates C → `C.parent_ids = ["a-id", "b-id"]`
- `superseded_by_id`: Forward pointer. `chronicle list` filters these out by default.
- `token_count`: Pre-computed via `Math.ceil(summary.length / 4)`. No tokenizer needed. Used as an **estimate** with documented safety margin — not a precise token measurement.
- `created_at` / `updated_at`: Stored as **UTC ISO 8601** strings (e.g., `2025-04-05T12:30:00.000Z`). All timestamps generated via `new Date().toISOString()`.
- `schema_version`: Enables `chronicle init` to detect existing installations and apply migrations (FR-1.6).
- All `CREATE` statements use `IF NOT EXISTS` for idempotency.

---

## 4. CLI Commands

[STATUS]: Done

### 4.1 `chronicle init`

Initializes Chronicle in the current repository. **Idempotent** — safe to re-run (FR-1.6).

```
chronicle init [--agent claude-code] [--agent copilot]
```

**Behavior:**
0. Walk up from cwd to find the nearest Git repo root (look for `.git/`). If no Git repo is found, exit with error: "Not inside a Git repository." All generated paths (`.chronicle/`, `.claude/`, `.github/`, `.gitignore`) are relative to this root.
1. Check if `.chronicle/` exists:
   - If no: create directory, DB, config with defaults
   - If yes: verify DB integrity, apply pending schema migrations, regenerate integration artifacts
2. Add `.gitignore` entries for SQLite transient files (FR-1.7):
   ```
   # Chronicle transient files
   .chronicle/chronicle.db-journal
   ```
3. Based on `--agent` flags (default: `claude-code`). Can be specified multiple times to target multiple agents:
   - **claude-code**: Create `.claude/skills/` (5 skills), configure hooks, append to `CLAUDE.md`
   - **copilot**: Create `.github/skills/` (5 skills), configure hooks, append to `.github/copilot-instructions.md`
4. **Managed artifact policy:**
   - **Markdown instruction files** (`CLAUDE.md`, `copilot-instructions.md`): Use `<!-- chronicle:start -->` / `<!-- chronicle:end -->` marker blocks. Re-init replaces the block content, preserving user content outside markers (FR-1.4).
   - **Chronicle-owned files** (SKILL.md files, hook JSON): Fully owned by Chronicle. Re-init **overwrites** these files. A generated header comment notes they are Chronicle-managed. User edits to these files may be lost on re-init.
   - **JSON config files** (`.claude/settings.json`): Structurally merged — Chronicle’s hook entry is added/updated without removing other existing hooks.
5. Print summary of what was created/updated.

**Exit codes:**
- `0`: Success
- `1`: User error (with structured JSON error on stderr)
- `2`: System error (database integrity, SQLite, filesystem)

### 4.2 `chronicle create`

```
chronicle create \
  --title "Auth module implementation" \
  --description "Implemented JWT auth with refresh tokens..." \
  --summary "## Goals\n..." \
  --parent-ids '["uuid-1","uuid-2"]' \
  --agent "claude-code"
```

**Stdin mode** (for large payloads — FR-2.9):
```
echo '{"title":"...","description":"...","summary":"...","parentIds":["uuid-1"],"agent":"claude-code"}' | chronicle create --stdin
```

**Behavior:**
1. Parse input from args or stdin JSON
2. Validate required fields (title, description, summary)
3. Compute `token_count = Math.ceil(summary.length / 4)`
4. Check `token_count <= config.maxSummaryTokens` — reject with error if exceeded (FR-2.8)
5. Generate UUID via `crypto.randomUUID()`
6. Insert into SQLite
7. Output JSON: `{ "id": "uuid", "token_count": 500, "created_at": "..." }`

### 4.3 `chronicle update <id>`

```
chronicle update <id> [--title "..."] [--description "..."] [--summary "..."]
```

Also supports `--stdin` for JSON input. Partial updates — only provided fields overwrite. Re-computes `token_count` if summary changed. Updates `updated_at`.

### 4.4 `chronicle get <id>`

```
chronicle get <id>
```

Returns full memory entry as JSON (all fields). Exit code 1 if not found.

### 4.5 `chronicle list`

```
chronicle list [--format json|table] [--include-superseded] [--limit N] [--offset N]
```

**Defaults:** format=json, limit=`config.maxCatalogEntries` (20), exclude superseded, order by `created_at DESC`.

**Output fields:** `id`, `title`, `description`, `token_count`, `created_at`.

### 4.6 `chronicle delete <id>`

```
chronicle delete <id> [--force]
```

Hard-deletes. Without `--force`, outputs a confirmation prompt (interactive TTY detection). In non-interactive (piped) mode, requires `--force`.

**Referential integrity:** If the memory is referenced as a `parent_id` by other memories, or is the target of another memory's `superseded_by_id`, warn the user and require `--force` to proceed.

### 4.7 `chronicle supersede <old_id> <new_id>`

```
chronicle supersede <old_id> <new_id>
```

Sets `old.superseded_by_id = new_id`. Validates both IDs exist. Returns confirmation JSON.

**Referential integrity rules:**
- Cannot supersede a memory with itself (reject with error)
- Cannot create a supersession cycle (if `new_id` is already superseded by `old_id`, directly or transitively, reject)
- If `old_id` is already superseded, warn but allow (re-pointing)

### 4.8 `chronicle hook session-start`

This is what the agent hooks call.

```
chronicle hook session-start
```

**Behavior:**
1. Locate `.chronicle/` in cwd (walk up to find repo root if needed)
2. Read config
3. Run `listActiveMemories(limit=config.maxCatalogEntries)`
4. Output SessionStart JSON to stdout:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "[Chronicle Memory Catalog] (showing 5 of 12 active memories)\n- [id] Title — Description (~N tokens)\n...\n\nOlder entries exist. Run `chronicle list --offset 5 --limit 20` to browse more.\n\n[Instructions: ...]"
  }
}
```

5. **If no `.chronicle/` found** (uninitialized repo):
   - Exit 0
   - Output empty JSON with no `additionalContext` — Chronicle is invisible to the agent (FR-13.1)
6. **If `.chronicle/` exists but zero active memories**:
   - Exit 0
   - Inject brief message: "Chronicle is initialized but has no memories yet. Use /create-memory to save session knowledge." (FR-3.10)
7. **Always exits 0** — never blocks the agent session (FR-13.1, FR-13.5)

---

## 5. Error Handling Pattern (FR-13)

[STATUS]: In Progress

All CLI commands follow a consistent error pattern:

**Stdout:** Success output (JSON for machine consumption, table for human)
**Stderr:** Error messages
**Exit codes:**
- `0`: Success (or graceful "nothing to do")
- `1`: User error (missing args, validation failure, not found)
- `2`: System error (DB corrupt, filesystem permission)

**Error JSON format** (on stderr when `--format json`):
```json
{ "error": true, "code": "MEMORY_NOT_FOUND", "message": "No memory with id 'abc-123'" }
```

**Hook commands (`chronicle hook *`) always exit 0** — errors are reported via `additionalContext` as warnings, never by crashing.

---

## 6. Repo Directory Structure Created by `chronicle init`

[STATUS]: Done

```
<repo-root>/
├── .chronicle/
│   ├── chronicle.db            ← SQLite database (committed to git)
│   └── config.json             ← Project config (committed to git)
│
├── .claude/                    ← (if --agent includes claude-code)
│   ├── skills/
│   │   ├── create-memory/
│   │   │   └── SKILL.md
│   │   ├── create-memory-from/
│   │   │   └── SKILL.md
│   │   ├── update-memory/
│   │   │   └── SKILL.md
│   │   ├── list-memories/
│   │   │   └── SKILL.md
│   │   └── recall/
│   │       └── SKILL.md
│   └── settings.json           ← Hook config (merged, not overwritten)
│
├── .github/                    ← (if --agent includes copilot)
│   ├── skills/
│   │   ├── create-memory/
│   │   │   └── SKILL.md
│   │   ├── create-memory-from/
│   │   │   └── SKILL.md
│   │   ├── update-memory/
│   │   │   └── SKILL.md
│   │   ├── list-memories/
│   │   │   └── SKILL.md
│   │   └── recall/
│   │       └── SKILL.md
│   └── hooks/
│       └── chronicle.json      ← Hook config (Chronicle-managed, overwritten)
│
├── CLAUDE.md                   ← Chronicle section appended (if claude-code)
├── .github/copilot-instructions.md  ← Chronicle section appended (if copilot)
└── .gitignore                  ← Chronicle transient files added
```

---

## 7. Agent Integration — Hook Configuration

[STATUS]: In Progress

### Claude Code

The SessionStart hook is added to `.claude/settings.json` (merged with existing hooks if present):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "chronicle hook session-start",
            "timeout": 5000
          }
        ]
      }
    ]
  }
}
```

### GitHub Copilot (VS Code Local Agent Mode)

The SessionStart hook is added to `.github/hooks/chronicle.json`:

```json
{
  "hooks": [
      {
      "event": "SessionStart",
        "command": "chronicle hook session-start",
        "timeout": 5000
      }
    ]
}
```

> **Note:** This targets VS Code local agent mode only. GitHub/Copilot cloud repository hooks use a different schema and are out of scope for MVP. The exact VS Code hook schema should be validated against current Copilot documentation during implementation.

**Both agents use the same `chronicle hook session-start` CLI subcommand** — cross-platform, no path issues, works with global install.

---

## 8. Agent Integration — Skills

[STATUS]: Done

Five SKILL.md files are generated per agent. They share identical content; only the directory differs (`.claude/skills/` vs `.github/skills/`).

**Copilot SKILL.md frontmatter:** Copilot / VS Code skills require YAML frontmatter (`name`, `description`) at the top of each SKILL.md for slash-command discovery. Claude Code skills do not require this. The `init` command generates the appropriate format per agent.

**Config-aware templates:** Skill prompts must instruct the agent to read `.chronicle/config.json` for budget and limit values (e.g., `maxMemorySummaryTokens`, `maxMemoriesToPull`) rather than hardcoding numbers. This ensures config changes are reflected without re-init.

### `/create-memory`

The most critical skill — its prompt quality directly determines memory quality (FR-9.8).

**Key prompt design elements:**
- Instructs the agent to analyze the ENTIRE conversation
- Explicit guidance on writing descriptions as retrieval signals (FR-2.4): *"Think: if a future agent reads only this description, would it know whether this memory is relevant to its task?"*
- Structured summary format with the 6 sections
- Instruction to identify parent_ids from loaded memories
- Instruction to use `--stdin` mode for the CLI call (pipe JSON to avoid shell limits)
- Instruct the agent to read `maxMemorySummaryTokens` from `.chronicle/config.json` for the summary size limit

### `/create-memory-from`

For brownfield adoption — creating memories from existing project artifacts (FR-2.10).

**Key prompt design elements:**
- Instructs the agent to read the provided file paths or pasted text (not the conversation)
- Same structured summary format and description quality standards as `/create-memory`
- Same `--stdin` mode for CLI invocation
- `parent_ids` are conditional on session state: if the current session has loaded Chronicle memories, they should be recorded as parents even though the source material is external files (FR-2.5)
- Example usage: `/create-memory-from @docs/architecture.md @docs/api-design.md`

### `/update-memory`

- Loads existing memory first via `chronicle get`
- Compares with current session, generates updated fields
- Preserves still-accurate information

### `/list-memories`

- Runs `chronicle list --format table`
- Presents results to user

### `/recall`

- Runs `chronicle get <id>`
- Injects full memory content into conversation

---

## 9. Agent Integration — Custom Instructions

[STATUS]: Done

Appended to `CLAUDE.md` and `.github/copilot-instructions.md` between marker comments:

```markdown
<!-- chronicle:start -->
## Chronicle Memory System

This project uses Chronicle for persistent, version-controlled memory across coding sessions.
Chronicle is separate from your built-in memory systems — it stores structured project knowledge
in a local SQLite database within the repository.

### On Session Start
A memory catalog has been injected into this session's context. When you see the user's first message:
1. Review the Chronicle memory catalog (titles and descriptions)
2. Determine which memories (if any) are relevant to the user's request
3. If relevant memories exist, run `chronicle get <id>` to load full content
4. Respect budget limits: max {maxMemoriesToPull} memories, max {maxRetrievalTokenBudget} total tokens
5. If loading more than {requireConfirmationAbove} memories, ask the user first and show token estimates

### On Memory Conflicts
If loaded memories contradict each other, prefer the most recently created one.
Flag the conflict to the user so they can resolve it (e.g., via /create-memory + supersede).

### Verify Before Trusting
After loading a memory, if it references specific files, implementations, or configurations,
spot-check that those artifacts still exist and match what the memory describes before relying
on its claims. The codebase may have changed since the memory was created.

### Available Commands
- `chronicle list` — View all memory titles and descriptions
- `chronicle get <id>` — Load a full memory
- Use `/create-memory` to save session knowledge
- Use `/update-memory <id>` to update an existing memory
- `chronicle supersede <old_id> <new_id>` — Mark a memory as replaced
<!-- chronicle:end -->
```

**Key additions vs megaplan:**
- Explicit statement that Chronicle is separate from built-in agent memory (FR-9.9)
- Marker comments for idempotent re-initialization (FR-1.6)

---

## 10. Configuration

[STATUS]: Done

**File:** `.chronicle/config.json`

```json
{
  "maxMemoriesToPull": 5,
  "maxMemorySummaryTokens": 2000,
  "maxRetrievalTokenBudget": 5000,
  "requireConfirmationAbove": 3,
  "maxCatalogEntries": 20,
  "chronicleVersion": "1.0.0"
}
```

| Key | Type | Default | FR | Purpose |
|-----|------|---------|-----|--------|
| `maxMemoriesToPull` | number | 5 | FR-3.6, FR-11.3 | Max memories an agent should load per session |
| `maxMemorySummaryTokens` | number | 2000 | FR-2.8 | Hard cap on a single memory's summary size (enforced by CLI on create/update) |
| `maxRetrievalTokenBudget` | number | 5000 | FR-3.6, FR-11.3 | Total token budget for all summaries loaded in a session (communicated to agent via instructions) |
| `requireConfirmationAbove` | number | 3 | FR-3.7, FR-11.4 | Ask user before loading more than N memories |
| `maxCatalogEntries` | number | 20 | FR-3.9, FR-11.3 | Max entries in the session-start catalog |
| `chronicleVersion` | string | (set by CLI) | FR-14 | CLI version that last ran `init`. Enables migration tooling and version-skew detection. |

---

## 11. Project Structure (Chronicle CLI Package)

[STATUS]: In Progress

```
chronicle/
├── package.json                 # name: chronicle-memory, bin: chronicle
├── tsconfig.json
├── tsup.config.ts               # Build config
├── README.md
├── src/
│   ├── index.ts                 # CLI entry point (commander setup)
│   ├── commands/
│   │   ├── init.ts              # chronicle init (idempotent, migration-aware)
│   │   ├── create.ts            # chronicle create (args + --stdin mode)
│   │   ├── update.ts            # chronicle update (args + --stdin mode)
│   │   ├── get.ts               # chronicle get
│   │   ├── list.ts              # chronicle list
│   │   ├── delete.ts            # chronicle delete
│   │   ├── supersede.ts         # chronicle supersede
│   │   └── hook.ts              # chronicle hook session-start
│   ├── db/
│   │   ├── connection.ts        # SQLite connection (default journal mode, path resolution)
│   │   ├── schema.ts            # Table creation, migrations, version check
│   │   └── queries.ts           # Prepared statements for all operations
│   ├── config/
│   │   └── config.ts            # Read/write/validate .chronicle/config.json
│   ├── templates/
│   │   ├── skills/              # SKILL.md template strings (embedded in code)
│   │   │   ├── create-memory.ts
│   │   │   ├── create-memory-from.ts
│   │   │   ├── update-memory.ts
│   │   │   ├── list-memories.ts
│   │   │   └── recall.ts
│   │   ├── hooks/               # Hook config templates
│   │   │   ├── claude-code.ts
│   │   │   └── copilot.ts
│   │   └── instructions/        # Custom instruction snippets
│   │       ├── claude-md.ts
│   │       └── copilot-instructions.ts
│   └── utils/
│       ├── tokens.ts            # Token estimation
│       ├── validation.ts        # Input validation, JSON parsing
│       ├── errors.ts            # Error types, exit codes, structured error output
│       └── paths.ts             # .chronicle/ directory resolution (walk up)
├── bin/
│   └── chronicle.js             # #!/usr/bin/env node → dist/index.js
└── tests/
    ├── unit/
    │   ├── db.test.ts           # Schema, queries, journal mode
    │   ├── config.test.ts       # Config read/write/defaults
    │   ├── tokens.test.ts       # Token estimation
    │   └── validation.test.ts   # Input validation
    ├── commands/
    │   ├── init.test.ts         # Init, idempotency, migrations
    │   ├── create.test.ts       # Create (args + stdin)
    │   ├── update.test.ts       # Update (partial, full)
    │   ├── get.test.ts          # Get (found, not found)
    │   ├── list.test.ts         # List (filters, pagination, formats)
    │   ├── delete.test.ts       # Delete (force, interactive)
    │   ├── supersede.test.ts    # Supersede (valid, invalid IDs, cycles, self-supersede)
    │   └── hook.test.ts         # Hook output format validation
    └── integration/
        └── lifecycle.test.ts    # Full flow: init→create→list→get→update→supersede→delete
```

---

## 12. Implementation Epics

[STATUS]: In Progress

### Epic 1: Project Scaffold & Database Layer

[STATUS]: Done

**Goal:** Working CLI skeleton with SQLite CRUD — the foundation everything else builds on.

| # | Task | FR | Acceptance | Status |
|---|------|-----|------------|--------|
| 1.1 | Initialize npm project: `package.json`, `tsconfig.json`, `tsup.config.ts`, install deps | — | `npm run build` compiles without errors | Done |
| 1.2 | Create `bin/chronicle.js` entry point + `src/index.ts` with commander skeleton (no commands yet) | — | `chronicle --version` and `chronicle --help` work | Done |
| 1.3 | Implement `src/db/connection.ts` — open/create SQLite DB, default journal mode, handle path resolution | FR-14.1 | Can create and open a DB file at `.chronicle/chronicle.db` | Done |
| 1.4 | Implement `src/db/schema.ts` — create tables, indexes, schema_version tracking | FR-1.6 | Tables created with `IF NOT EXISTS`, version tracked | Done |
| 1.5 | Implement `src/db/queries.ts` — prepared statements: insertMemory, updateMemory, getMemory, listMemories, deleteMemory, supersede. **All user input must be bound via parameterized placeholders — no string concatenation into SQL.** | FR-2 through FR-7 | All queries work in isolation with test data. | Done |
| 1.6 | Implement `src/config/config.ts` — read/write/validate config.json, sensible defaults | FR-8 | Missing config → defaults. Invalid config → clear error. | Done |
| 1.7 | Implement `src/utils/tokens.ts` — `estimateTokens(text): number` | FR-2.7 | `Math.ceil(text.length / 4)` returns expected values | Done |
| 1.8 | Implement `src/utils/validation.ts` — validate required fields, parse JSON arrays for parentIds, enforce max length on `title` (160 chars) and `description` (600 chars) | FR-13.4 | Malformed input → structured error. Oversized fields → rejected with clear message. | Done |
| 1.9 | Implement `src/utils/errors.ts` — error types, exit code constants, `formatError()` for JSON/text output | FR-13 | Consistent error format across all commands | Done |
| 1.10 | Implement `src/utils/paths.ts` — find `.chronicle/` by walking up from cwd | FR-14.1 | Works from repo root and subdirectories | Done |
| 1.11 | Write unit tests for db, config, tokens, validation, errors | — | All pass | Done |

### Epic 2: CLI Commands

[STATUS]: Done

**Goal:** All 8 CLI commands wired up and working.

| # | Task | FR | Acceptance | Status |
|---|------|-----|------------|--------|
| 2.1 | Implement `chronicle init` — create .chronicle/, DB, config, .gitignore entries. Idempotent. | FR-1 | Running twice doesn't destroy data. .gitignore updated. | Done |
| 2.2 | Implement `chronicle create` — args mode + `--stdin` mode. Validate, compute tokens, insert, return ID. | FR-2 | Both input modes work. Token limit enforced. | Done |
| 2.3 | Implement `chronicle update <id>` — partial updates, --stdin mode. | FR-4 | Partial update preserves unchanged fields. | Done |
| 2.4 | Implement `chronicle get <id>` — return full JSON. | FR-7 | Found → JSON. Not found → exit 1 + error. | Done |
| 2.5 | Implement `chronicle list` — format, filtering, pagination, superseded exclusion. | FR-7 | Default excludes superseded. Pagination works. | Done |
| 2.6 | Implement `chronicle delete <id>` — TTY detection, --force. | FR-6 | Interactive → prompts. Non-interactive without --force → error. | Done |
| 2.7 | Implement `chronicle supersede <old> <new>` — validate both IDs, referential integrity checks (no self-supersede, no cycles). | FR-5 | Invalid IDs → error. Self-supersede → error. Cycles → error. Valid → superseded_by_id set. | Done |
| 2.8 | Implement `chronicle hook session-start` — output SessionStart JSON, always exit 0. | FR-3, FR-13.1 | No .chronicle/ → silent exit 0. Empty DB → empty-store message. Valid catalog → correct JSON with truncation signal. | Done |
| 2.9 | Write command tests (one test file per command) | — | All pass | Done |

### Epic 3: Agent Integration Templates & Init Scaffolding

[STATUS]: In Progress

**Goal:** `chronicle init` produces all agent integration artifacts. Prompt engineering is done.

| # | Task | FR | Acceptance | Status |
|---|------|-----|------------|--------|
| 3.1 | Write `/create-memory` SKILL.md template — **this is the most critical prompt**. Must produce high-quality descriptions and structured summaries. Includes `--stdin` usage instruction. | FR-9.4, FR-9.8, FR-2.4 | Manual test: give a sample conversation → agent produces a well-structured memory | Done |
| 3.2 | Write `/create-memory-from` SKILL.md template — for brownfield adoption. Instructs agent to analyze provided files/text instead of conversation. Same quality standards. | FR-9.4, FR-2.10 | Manual test: point at an existing doc → agent produces a well-structured memory | Done |
| 3.3 | Write `/update-memory` SKILL.md template | FR-9.4 | Clear step-by-step for loading, comparing, updating | Done |
| 3.4 | Write `/list-memories` SKILL.md template | FR-9.4 | Runs `chronicle list --format table` | Done |
| 3.5 | Write `/recall` SKILL.md template | FR-9.4 | Runs `chronicle get <id>`, presents content | Done |
| 3.6 | Write custom instruction snippet for CLAUDE.md — includes coexistence note, budget rules, conflict handling, marker comments | FR-9.5, FR-9.9 | All FR-9.5 bullet points covered | Done |
| 3.7 | Write custom instruction snippet for copilot-instructions.md — same content adapted for Copilot | FR-9.5, FR-9.9 | Same coverage | Done |
| 3.8 | Write Claude Code hook config template | FR-9.2 | Valid `.claude/settings.json` hook format | Done |
| 3.9 | Write Copilot hook config template (VS Code local agent mode) | FR-9.2 | Valid `.github/hooks/chronicle.json` format Schema validated against current Copilot docs. | In Progress |
| 3.10 | Wire templates into `chronicle init` — skill file generation, hook config merging, instruction appending, .gitignore | FR-1, FR-9.3 | `chronicle init` produces full directory structure from Section 6 | Done |
| 3.11 | Implement idempotent instruction appending — detect `<!-- chronicle:start -->` markers, replace block if present | FR-1.4, FR-1.6 | Re-running init updates instructions without duplication | Done |
| 3.12 | Test `chronicle init` end-to-end with both agents | — | All files created correctly for `--agent claude-code --agent copilot` | Done |

### Epic 4: Integration Testing & Polish

[STATUS]: Not Started

**Goal:** Full lifecycle works. Manual testing with real agents. Ready to use.

| # | Task | FR | Acceptance | Status |
|---|------|-----|------------|--------|
| 4.1 | Integration test: `init → create → list → get → update → supersede → list → delete` | All | Full lifecycle passes | Not Started |
| 4.2 | Integration test: hook output format matches Claude Code expectations | FR-3.1, FR-9.6 | JSON output parses correctly, < 5 seconds | Not Started |
| 4.3 | Integration test: hook output format matches Copilot expectations | FR-3.1, FR-9.6 | JSON output parses correctly | Not Started |
| 4.4 | Integration test: `--stdin` mode with large payloads (>10KB summary) | FR-2.9 | Creates/updates successfully | Not Started |
| 4.5 | Integration test: error scenarios (missing DB, corrupt DB, invalid input, missing CLI) | FR-13 | Graceful errors, no crashes, exit codes correct | Not Started |
| 4.6 | Manual test: Claude Code session — init, create memory, new session, verify catalog injection + retrieval | FR-3, FR-9 | End-to-end works | Not Started |
| 4.7 | Manual test: GH Copilot session — same flow | FR-3, FR-9 | End-to-end works | Not Started |
| 4.8 | Write README.md — installation, quickstart, command reference, configuration | — | Developer can set up Chronicle from README alone | Not Started |
| 4.9 | Prepare for npm publish — package.json bin field, files field, .npmignore | FR-14.4 | `npm pack` produces clean package | Not Started |

---

## 13. Memory Summary Format

[STATUS]: Defined

The `summary` field uses this structured markdown template (embedded in the `/create-memory` SKILL.md):

```markdown
## Goals
- What the session was trying to achieve

## Decisions
- Key architectural/design decisions made and WHY

## Implementation
- What was actually built/changed
- Key files modified: `path/to/file.ts`

## Learnings
- Insights, gotchas, patterns discovered

## Current State
- Where things stand at end of session

## Next Steps
- Explicit follow-up tasks or open questions
```

**Generation guidelines** (embedded in skill prompt):
- Concise but precise — favor specifics (file paths, function names, config values) over generalities
- Omit sections with no content
- Never exceed ~2000 tokens
- Bullet points, not paragraphs

---

## 14. Acceptance Criteria (MVP)

[STATUS]: Defined

| # | Criterion | Covers |
|---|-----------|--------|
| 1 | `chronicle init` creates `.chronicle/`, DB, config, agent skills, hooks, instructions, .gitignore entries | FR-1 |
| 2 | `chronicle init` is idempotent — re-running doesn't destroy data or duplicate instruction blocks | FR-1.6 |
| 3 | `chronicle create` inserts a memory and returns its UUID (both args and --stdin modes) | FR-2 |
| 4 | `chronicle create` rejects summaries exceeding `maxMemorySummaryTokens` | FR-2.8 |
| 5 | `chronicle list` returns non-superseded memories as JSON with title, description, token_count | FR-7 |
| 6 | `chronicle get <id>` returns full memory entry | FR-7 |
| 7 | `chronicle update <id>` updates specified fields, re-computes token_count | FR-4 |
| 8 | `chronicle supersede <old> <new>` sets superseded_by_id; old memory excluded from default list | FR-5 |
| 9 | `chronicle hook session-start` outputs valid SessionStart JSON for both Claude Code and Copilot | FR-3.1 |
| 10 | `chronicle hook session-start` exits 0 even when .chronicle/ doesn't exist | FR-13.1 |
| 11 | Starting a new Claude Code session injects the memory catalog via SessionStart hook | FR-3.1 |
| 12 | Using `/create-memory` in Claude Code produces a valid structured memory and stores it | FR-2, FR-9 |
| 13 | A fresh Claude Code session retrieves and loads relevant memories based on user's first prompt | FR-3.3 |
| 14 | Same flows work in GitHub Copilot (VS Code agent mode) | FR-9.1 |
| 15 | Config limits are communicated to the agent via instructions and enforced on CLI side for summary size | FR-8, FR-11 |
| 16 | All CLI commands return meaningful error messages for invalid inputs | FR-13 |
| 17 | `chronicle hook session-start` outputs no context when `.chronicle/` doesn’t exist (silent no-op) | FR-13.1 |
| 18 | `chronicle hook session-start` outputs empty-store message when DB has zero active memories | FR-3.10 |
| 19 | Hook catalog output includes total active memory count and truncation signal when catalog is partial | FR-3.9 |
| 20 | `chronicle supersede` rejects self-supersession and cycles | FR-5 |
| 21 | `chronicle delete` warns when deleting a memory referenced by other memories | FR-6 |
| 22 | `chronicle init` fails with clear error outside a Git repository | FR-1 |
| 23 | Re-running `chronicle init` overwrites Chronicle-owned skill/hook files without duplicating | FR-1.6 |
| 24 | `/create-memory-from` records parent_ids when session has loaded Chronicle memories | FR-2.5 |
| 25 | Agent asks user for confirmation before loading more than `requireConfirmationAbove` memories | FR-3.7, FR-11.4 |
| 26 | `chronicle list --include-superseded` returns superseded memories alongside active ones | FR-7 |
| 27 | Custom instructions explicitly state Chronicle is separate from the agent's built-in memory | FR-9.9 |
| 28 | Golden-path prompt evaluation: `/create-memory` on a sample conversation produces a well-structured memory with accurate description, correct parent_ids, and properly formatted summary | FR-9.8 |

---

## 15. Constraints

[STATUS]: Defined

- **Zero external API calls** — all LLM work delegated to the host agent
- **2 runtime npm dependencies** — `better-sqlite3`, `commander`
- **Cross-platform** — all hook scripts are CLI subcommands executed via Node.js, no shell scripts
- **Git-friendly** — `.chronicle/` committed; rollback journal file gitignored. Default journal mode (not WAL) ensures the single `.db` file always contains the latest state.
- **Non-destructive init** — Markdown instruction files use marker-based idempotency. Chronicle-owned files (skills, hooks) are overwritten on re-init. JSON config files are structurally merged.
- **Graceful degradation** — Chronicle failures never block agent sessions. If the `chronicle` CLI is not installed, the agent platform’s own hook error handling will skip the hook gracefully. Chronicle does not ship repo-local wrapper scripts.
- **CLI is a prerequisite** — `chronicle` must be globally installed (`npm i -g chronicle-memory`) for hooks and skills to function. This is documented in the README as a setup requirement.
- **Single-user optimized** — SQLite-in-Git is optimized for single-user / low-contention usage. Team sharing is possible (commit and pull), but concurrent multi-developer editing of the memory store is not a guaranteed workflow in the MVP.
- **Retrieval budgets are prompt-level** — `maxMemoriesToPull`, `maxRetrievalTokenBudget`, and `requireConfirmationAbove` are communicated to the agent via custom instructions but not enforced at the CLI level. The agent can call `chronicle get` without budget checks. This is a known MVP limitation; a budget-aware retrieval command may be added post-MVP.
- **Memory quality depends on host agent context** — The MVP does not export or archive conversation transcripts. Memory creation relies on the host agent still retaining relevant session context. If the agent’s context has been compacted or truncated, memory quality may degrade. This is an inherent limitation of delegating all analysis to the host agent.
- **Native dependency risk** — `better-sqlite3` is a native C++ addon. Global npm installs of native modules are more fragile than pure JS packages, especially on Windows. Validate the install flow on Windows early in Epic 1. If friction appears, consider fallback options (e.g., `sql.js` WASM build).
- **CLI version tracking** — `config.json` includes a `chronicleVersion` field set by `chronicle init` to the installed CLI version. This enables future migration tooling and helps diagnose version-skew issues when a repo is shared across machines with different Chronicle versions.

---

## 16. Out of Scope (MVP)

[STATUS]: Defined

- PreCompact auto-save / session snapshots
- Vector embeddings / semantic search (qmd)
- Full-text search (`chronicle search`) — FTS5 index deferred to post-MVP. Catalog-first retrieval (titles + descriptions) is the primary retrieval model.
- GitHub/Copilot cloud repository hooks (only VS Code local agent mode is supported)
- Budget-aware retrieval command (`chronicle recall --ids`)
- Repo-local CLI launcher wrappers for graceful missing-CLI degradation
- Direct LLM API calls from Chronicle
- File system mirroring of memories
- Codex / OpenCode / Gemini CLI agent support
- Memory analytics / dashboard
- Memory merge/consolidation
- Multi-repo memory sharing
- Binary packaging (standalone binary)
- MCP server implementation
- Transcript export / session archival

See `docs/functional-requirements.md` Section 6 for the full future considerations list.

---

## 17. Implementation Order & Dependencies

[STATUS]: Defined

```
Epic 1 (Foundation)
  1.1 → 1.2 → 1.3 → 1.4 → 1.5 (sequential: each builds on prior)
  1.6, 1.7, 1.8, 1.9, 1.10 (parallel: independent utilities)
  1.11 (after all above)

Epic 2 (Commands) — depends on Epic 1
  2.8 (hook) can be done early — it's the simplest command
  2.1 (init) should be done LAST in this epic — it depends on all templates from Epic 3
  2.2–2.7 can be done in parallel
  2.9 (tests) after each command

Epic 3 (Templates) — partially parallel with Epic 2
  3.1 (create-memory prompt) is the CRITICAL PATH — start early, iterate
  3.2–3.9 can be done in parallel
  3.10–3.12 depend on Epic 2.1 (init command) and all templates

Epic 4 (Testing) — depends on Epic 2 + 3
  4.1–4.5 (automated tests) first
  4.6–4.7 (manual agent tests) after
  4.8–4.9 (polish) last
```

**Critical path:** 1.1 → 1.3 → 1.4 → 1.5 → 2.2 → 3.1 → 3.10 → 4.6

**Estimated effort:** ~3-4 focused sessions for Epic 1+2, ~2 sessions for Epic 3, ~1-2 sessions for Epic 4.
