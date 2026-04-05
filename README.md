# Chronicle

> **Status**: This project is still in early stage development and is not yet ready for **any** use. Key features are not yet implemented. Refer to [implementation plan](./docs/specs/implementation-plan.md) for the planned features and [STATUS.md](./docs/specs/STATUS.md) for the current progress.

Chronicle is a **project-scoped, local memory layer for coding agents**.

It gives AI coding agents persistent memory across sessions by storing structured project knowledge inside the repository itself, using SQLite as the storage layer and a TypeScript CLI as the integration surface.

- Let agents create durable memories from meaningful work
- Let fresh sessions discover and load relevant prior knowledge
- Keep that knowledge local, version-controlled, and project-specific

## Why Chronicle Exists

Modern coding agents lose all context when a session ends. The next session starts with no awareness of prior decisions, debugging discoveries, implementation state, or trade-offs already explored. That forces repeated rediscovery and manual documentation.

Chronicle solves this with a lightweight local-first approach:

- **Local** instead of cloud-dependent
- **Project-scoped** instead of generic global memory
- **Version-controlled** instead of opaque vendor storage
- **Structured** instead of unbounded transcript dumping
- **Agent-friendly** instead of human-only documentation

Chronicle is a thin infrastructure layer — it handles storage, retrieval, configuration, and agent integration. All intelligence (summarization, relevance decisions) is delegated to the host coding agent. Chronicle makes zero LLM API calls.

## Core Concepts

| Concept | Description |
|---|---|
| **Memory** | A structured record with a `title`, `description`, `summary`, and metadata (timestamps, ancestry, originating agent) |
| **Catalog** | Lightweight index of active memories (IDs, titles, descriptions, token estimates) injected at session start for relevance scanning |
| **Knowledge Ancestry** | New memories record which prior memories informed them, preserving how knowledge evolves |
| **Supersession** | Stale memories are marked as superseded by newer ones and hidden from the default catalog |

## Prerequisites

- **Node.js** >= 20
- **npm**
- **Git**
- A build environment for native Node modules (`better-sqlite3` is a C++ addon)

## Developer Quick Start

```bash
npm install          # Install dependencies
npm run typecheck    # TypeScript type checking
npm run build        # Build with tsup → dist/
npm test             # Run test suite (vitest)
npm run test:watch   # Tests in watch mode
```

The CLI entry point is `bin/chronicle.js` which requires `dist/index.js`. Build before using the CLI directly.

## CLI Commands

| Command | Description |
|---|---|
| `chronicle create` | Create a memory (args or `--stdin` JSON mode) |
| `chronicle update <id>` | Update an existing memory (partial updates supported) |
| `chronicle get <id>` | Get full memory content as JSON |
| `chronicle list` | List active memories (JSON or table format, pagination) |
| `chronicle delete <id>` | Delete a memory (with confirmation / `--force`) |
| `chronicle supersede <old> <new>` | Mark a memory as superseded |
| `chronicle hook session-start` | Emit session start payload for agent hooks |
| `chronicle init` | Initialize Chronicle in a repository *(not yet implemented)* |

## Technology Stack

| Component | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Runtime | Node.js 20+ |
| CLI framework | `commander` |
| Database | SQLite via `better-sqlite3` |
| Build | `tsup` |
| Testing | `vitest` |

**Runtime dependencies (2 only):** `better-sqlite3`, `commander`

## Project Structure

```
chronicle/
├── bin/chronicle.js      # CLI entry point
├── src/
│   ├── index.ts          # Commander program setup + command registration
│   ├── commands/         # One file per command + shared runtime helpers
│   ├── templates/        # Skill, instruction, and hook template renderers for future init generation
│   ├── db/               # SQLite connection, schema, prepared-statement queries
│   ├── config/           # .chronicle/config.json read/write/validation
│   └── utils/            # Tokens, validation, errors, path resolution
├── tests/
│   ├── unit/             # Unit tests for foundational modules and template renderers
│   └── commands/         # Command execution tests + test helpers
└── docs/
    ├── architecture.md   # Architectural patterns and design decisions
    └── specs/            # Functional requirements, implementation plan, status
```

## Documentation

| Document | Purpose |
|---|---|
| `AGENTS.md` | Coding standards, patterns, and conventions for AI agents working in this repo |
| `docs/architecture.md` | System diagram, layer architecture, key design decisions |
| `docs/specs/implementation-plan.md` | Authoritative implementation plan with epics and task ordering |
| `docs/specs/functional-requirements.md` | Complete functional requirements (FR-1 through FR-14) |
| `docs/specs/STATUS.md` | Current implementation state |

## Engineering Practices

See `AGENTS.md` for coding standards, patterns, and conventions.