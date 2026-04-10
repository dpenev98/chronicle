# Chronicle

[![npm version](https://img.shields.io/npm/v/chronicle-memory)](https://www.npmjs.com/package/chronicle-memory)
[![CI](https://github.com/dpenev98/chronicle/actions/workflows/ci.yml/badge.svg)](https://github.com/dpenev98/chronicle/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)

> **Status:** Early alpha (`0.0.1-alpha`). The core CLI, agent integration, and delivery pipeline are complete. See [STATUS.md](./docs/specs/STATUS.md) for details.

Chronicle is a **project-scoped, local memory layer for coding agents**.

It gives AI coding agents persistent memory across sessions by storing structured project knowledge inside the repository itself — local, version-controlled, and team-shareable.

## Why Chronicle Exists

Modern coding agents lose all context when a session ends. The next session starts with no awareness of prior decisions, debugging discoveries, implementation state, or trade-offs already explored. That forces repeated rediscovery and manual documentation.

Chronicle solves this:

- **Local** — no cloud services, no API calls, no network dependencies
- **Project-scoped** — each repository has its own independent memory store
- **Version-controlled** — memories live in `.chronicle/` and are committed to Git
- **Structured** — memories follow a defined format with title, description, summary, and metadata
- **Agent-friendly** — hooks and skills integrate natively with Claude Code and GitHub Copilot

Chronicle is infrastructure only — it handles storage, retrieval, and agent integration. All intelligence (summarization, relevance decisions) is delegated to the host coding agent. Chronicle makes zero LLM API calls.

## Core Concepts

| Concept | Description |
|---|---|
| **Memory** | A structured record with a title, description, summary, and metadata (timestamps, ancestry, originating agent) |
| **Catalog** | Lightweight index of active memories injected at session start so the agent can scan available knowledge |
| **Knowledge Ancestry** | New memories record which prior memories informed them, preserving how knowledge evolves |
| **Supersession** | Stale memories are marked as superseded by newer ones and hidden from the default catalog |

## Prerequisites

| Platform | Requirements |
|---|---|
| **All** | Node.js >= 20, npm, Git |
| **macOS** | Xcode Command Line Tools (`xcode-select --install`) |
| **Linux** | `build-essential` and `python3` (usually pre-installed) |
| **Windows** | Visual Studio Build Tools with "Desktop development with C++" workload |

> **Why build tools?** Chronicle uses [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3), a native C++ addon that compiles during `npm install`.

## Installation

```bash
npm install -g chronicle-memory
```

Verify the installation:

```bash
chronicle --version
```

## Quick Start

```bash
# Initialize Chronicle in your project
cd your-project
chronicle init --agent claude-code --agent copilot

# Commit the generated artifacts
git add .chronicle/ .claude/ .github/ CLAUDE.md .gitignore
git commit -m "feat: initialize Chronicle memory layer"
```

That's it. The next time you start an agent session:

1. The **session-start hook** automatically injects the memory catalog into the agent's context
2. The agent evaluates catalog entries against your request and loads relevant memories
3. At the end of a session, tell your coding agent to create a memory or explicitly invoke the **/create-memory** skill to save knowledge for future sessions
4. Use the **/recall** skill to explicitly load memories from the catalog
5. You can also directly use the `chronicle` CLI if you require to manually manage memories.

## CLI Command Reference

| Command | Description |
|---|---|
| `chronicle init [--agent <name>]` | Initialize Chronicle in a Git repository. Supports `claude-code` and `copilot` (repeatable). Default: `claude-code` |
| `chronicle create` | Create a new memory (via args or `--stdin` JSON) |
| `chronicle update <id>` | Update an existing memory. Supports partial updates and `--stdin` |
| `chronicle get <id>` | Retrieve full memory content as JSON |
| `chronicle list` | List active memories. Options: `--format json\|table`, `--include-superseded`, `--limit N`, `--offset N` |
| `chronicle delete <id>` | Delete a memory. Requires `--force` in non-interactive mode |
| `chronicle supersede <old> <new>` | Mark a memory as superseded by a newer one |
| `chronicle hook session-start` | Emit the memory catalog payload for agent session hooks |

## Agent Integration

Chronicle integrates with coding agents through agent skills and enforces actions via agent hooks. Running `chronicle init` generates all required artifacts.

### Supported Agents

| Agent | Skills Directory | Hook Config | Instructions |
|---|---|---|---|
| **Claude Code** | `.claude/skills/` | `.claude/settings.json` | `CLAUDE.md` |
| **GitHub Copilot** | `.github/skills/` | `.github/hooks/chronicle.json` | `.github/copilot-instructions.md` |

### What Gets Generated

- **5 skills** per agent: `/create-memory`, `/create-memory-from`, `/update-memory`, `/list-memories`, `/recall`
- **Session-start hook** that runs `chronicle hook session-start` to inject the memory catalog
- **Custom instructions** that guide the agent on retrieval logic, budget limits, and memory quality standards

### How It Works at Session Start

```
Agent session begins
  → Hook runs `chronicle hook session-start`
  → Chronicle returns the memory catalog (titles, descriptions, token estimates)
  → Agent receives user's first message
  → Agent evaluates catalog against the request
  → Agent loads relevant memories via `chronicle get <id>`
  → Agent proceeds with full prior context
```

## Configuration

Chronicle stores per-project settings in `.chronicle/config.json`. All settings have sensible defaults.

| Setting | Default | Description |
|---|---|---|
| `maxMemoriesToPull` | 5 | Maximum memories an agent should load per session |
| `maxMemorySummaryTokens` | 2000 | Maximum token count for a single memory summary |
| `maxRetrievalTokenBudget` | 5000 | Total token budget across all loaded memories per session |
| `requireConfirmationAbove` | 3 | Number of memories above which the agent asks for user approval before loading |
| `maxCatalogEntries` | 20 | Maximum memories shown in the session-start catalog |

These limits are communicated to the agent through custom instructions. The agent is expected to respect them when making retrieval decisions.

## How It Works

```
┌────────────────────────────────────────────────┐
│  Coding Agent (Claude Code / GitHub Copilot)   │
│                                                │
│  Hooks ──> Skills ──> Custom Instructions      │
│    │          │                                │
│    ▼          ▼                                │
│  chronicle CLI (global npm binary)             │
│  init │ create │ get │ list │ update │ ...     │
└────────────────────┬───────────────────────────┘
                     │
                     ▼
           ┌───────────────────┐
           │  .chronicle/      │
           │  ├─ chronicle.db  │  ← SQLite
           │  └─ config.json   │  ← settings
           └───────────────────┘
           (committed to Git)
```

- **Storage:** SQLite via `better-sqlite3` with rollback journal mode (single `.db` file, Git-friendly)
- **Token estimation:** — lightweight heuristic, no tokenizer dependency
- **IDs:** `crypto.randomUUID()` — built-in Node.js, no dependency
- **Timestamps:** UTC ISO 8601 strings

## Contributing

```bash
git clone https://github.com/dpenev98/chronicle.git
cd chronicle
npm install
npm run typecheck
npm run build
npm test
```

See [AGENTS.md](./AGENTS.md) and [architecture.md](./docs/architecture.md) for coding standards, architectural patterns, and development recipes. See [docs/operations.md](./docs/operations.md) for versioning and release workflow.

## Documentation

| Document | Purpose |
|---|---|
| [AGENTS.md](./AGENTS.md) | Coding standards, patterns, and conventions for contributors |
| [docs/architecture.md](./docs/architecture.md) | System diagram, layer architecture, key design decisions |
| [docs/operations.md](./docs/operations.md) | CI/CD, versioning, and release workflow |
| [docs/specs/functional-requirements.md](./docs/specs/functional-requirements.md) | Complete functional requirements (FR-1 through FR-14) |
| [docs/specs/implementation-plan.md](./docs/specs/implementation-plan.md) | Authoritative implementation plan with epics and task ordering |
| [docs/specs/STATUS.md](./docs/specs/STATUS.md) | Current implementation state |

## License

[Apache-2.0](./LICENSE)