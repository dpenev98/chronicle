# Chronicle Architecture

## System Diagram

```text
┌──────────────────────────────────────────────────────────────────┐
│  Host Coding Agent (Claude Code / GitHub Copilot)                │
│                                                                  │
│  ┌─────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │ Session      │  │ Skills           │  │ Custom             │  │
│  │ Start Hook   │  │ /create-memory   │  │ Instructions       │  │
│  │ (catalog     │  │ /update-memory   │  │ (retrieval logic,  │  │
│  │  injection)  │  │ /recall          │  │  budget rules)     │  │
│  │              │  │ /list-memories   │  │                    │  │
│  │              │  │ /create-memory-  │  │                    │  │
│  │              │  │  from            │  │                    │  │
│  └──────┬───────┘  └────────┬─────────┘  └────────────────────┘  │
│         │                   │                                    │
│         ▼                   ▼                                    │
│  ┌──────────────────────────────────────────────┐                │
│  │  chronicle CLI  (global npm binary)          │                │
│  │                                              │                │
│  │  create │ update │ get │ list │ delete │      │                │
│  │  supersede │ hook session-start │ init        │                │
│  └──────────────────────┬───────────────────────┘                │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                           ▼
                 ┌───────────────────┐
                 │  .chronicle/      │
                 │  ├─ chronicle.db  │  ← SQLite (rollback journal)
                 │  └─ config.json   │  ← per-project settings
                 └───────────────────┘
                 (committed to Git)
```

---

## Layer Architecture

```text
src/index.ts                  CLI entrypoint — Commander program, command registration
  ↓
src/commands/*.ts             Command layer — one file per command
  ↓
src/commands/shared.ts        Runtime abstraction — I/O, time, IDs, context helpers
  ↓
src/templates/*               Artifact template layer — skills, instructions, hook configs consumed by chronicle init
  ↓
src/utils/ + src/config/      Validation, error model, config, path resolution
  ↓
src/db/*                      Persistence — connection, schema, prepared-statement queries
  ↓
.chronicle/chronicle.db       SQLite file (rollback journal mode)
```

| Layer | Key Responsibility |
|---|---|
| **Entrypoint** | Construct Commander program, create production runtime, register commands |
| **Commands** | Accept typed options, orchestrate validation + DB access, return typed results |
| **Runtime** | Abstract `process` (stdout/stderr/stdin, time, IDs, TTY, confirm prompts) |
| **Templates** | Render agent-managed artifact content for skills, instruction blocks, and hook configs |
| **Utils/Config** | Validate input, resolve paths, read config, shape structured errors |
| **Persistence** | Open SQLite, manage schema, execute prepared statements, map rows to domain objects |

---

## Key Architectural Patterns

### 1. Command Execution + Registration Split

Each command module exports `executeXxxCommand()` (pure logic, testable) and `registerXxxCommand()` (Commander wiring). Business logic never lives in `.action()` callbacks.

### 2. Runtime Injection

Commands receive a `CommandRuntime` interface instead of touching `process` directly. Production uses `createNodeCommandRuntime()`. Tests use `createTestRuntime()` with injectable time, IDs, stdin, and TTY state.

### 3. Context Resolution

`openChronicleContext(runtime)` walks up from `cwd` to find `.chronicle/`, opens DB + config, and returns a closeable context. `openOptionalChronicleContext()` returns `null` for hooks that must degrade gracefully. Context is always closed in a `finally` block.

### 4. Typed Boundary Mapping

Three data shapes prevent layer leakage:
- **`MemoryRow`** — raw SQLite row (internal to `queries.ts`)
- **`MemoryRecord`** — domain object with parsed `parentIds` (camelCase)
- **`GetJsonMemory` / `ListJsonMemory`** — CLI output (snake_case)

### 5. Fail-Fast Validation

All input is validated before any DB write or side effect. Field lengths, required fields, token limits, and JSON parsing are checked upfront with structured error messages.

### 6. Graceful Hook Degradation

`hook session-start` **always exits 0**. Errors become warning context in the output payload. Three states: no `.chronicle/` → empty `{}`, zero memories → guidance message, memories → catalog.

### 7. Reusable Artifact Generation

Agent integration artifacts are represented as typed renderer functions instead of static file blobs.

This allows Chronicle to:

- centralize agent-specific differences at the template boundary
- unit-test template output independently from `chronicle init` filesystem behavior
- keep `chronicle init` focused on filesystem writes and merge rules rather than string construction

One concrete example is the skill layer:

- Claude skill templates render plain markdown content
- Copilot skill templates render YAML frontmatter plus markdown for slash-command discovery

---

## Data Flow

```text
CLI args / stdin JSON
  → validated TypeScript object         (src/utils/validation.ts)
  → query-layer input                   (src/db/queries.ts interfaces)
  → SQLite row                          (prepared statement execution)
  → typed domain object (MemoryRecord)  (row mapping in queries.ts)
  → CLI-facing JSON (snake_case)        (shared.ts mapping functions)
  → stdout
```

---

## Persistence Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Journal mode** | `DELETE` (rollback) | Simpler Git story — single `.db` file always has latest state. No WAL sidecar files. |
| **Token estimation** | `Math.ceil(text.length / 4)` | No tokenizer dependency. Good enough for rough budget estimation. |
| **Parent ancestry** | JSON array in `parent_ids` TEXT column | Simple schema, easy CLI input, adequate for current reference queries. |
| **Timestamps** | UTC ISO 8601 strings | Human-readable, sortable, no timezone ambiguity. |
| **IDs** | `crypto.randomUUID()` text | Built-in Node.js, no dependency. |

---

## Template Generation Flow

The current template layer is the generation boundary used by `chronicle init`.

Its current flow is:

```text
chronicle init
  -> choose target agents
  -> select template renderers from src/templates/*
  -> render skills / instructions / hooks
  -> write or merge managed files into the repo
  -> preserve user-owned content where required
```

Implemented behaviors now include marker-based instruction replacement, structural Claude settings merge, Chronicle-owned artifact overwrites with managed metadata, and DB integrity/schema checks before reusing an existing Chronicle installation.

---

## Error Model

All errors extend `ChronicleError` with a `code`, `message`, and `exitCode`:

| Exit Code | Meaning | Error Classes |
|---|---|---|
| `0` | Success | — |
| `1` | User error | `ValidationError`, `NotFoundError`, `ConfigError`, `RepositoryError` |
| `2` | System error | `DatabaseError` |

- **Stdout** carries success output (JSON or table)
- **Stderr** carries error output
- Hook commands convert errors to warnings — they never set a non-zero exit code
