# Chronicle

Chronicle is a **project-scoped, local memory layer for coding agents**.

It gives AI coding agents persistent memory across sessions by storing structured project knowledge inside the repository itself, using SQLite as the storage layer and a TypeScript CLI as the integration surface.

The long-term goal is simple:

- let agents create durable memories from meaningful work
- let fresh sessions discover and load relevant prior knowledge
- keep that knowledge local, version-controlled, and project-specific

## Why Chronicle Exists

Modern coding agents are strong at local reasoning but weak at long-term continuity.

When a session ends, the next session usually starts with no awareness of:

- prior architectural decisions
- debugging discoveries
- implementation state
- file locations and conventions
- trade-offs already explored
- open questions that matter for the next task

That loss of context forces repeated rediscovery and manual documentation.

Chronicle exists to solve that problem with a lightweight local-first approach:

- **local** instead of cloud-dependent
- **project-scoped** instead of generic global memory
- **version-controlled** instead of opaque vendor storage
- **structured** instead of unbounded transcript dumping
- **agent-friendly** instead of human-only documentation

## Product Vision

Chronicle is designed to work as a thin infrastructure layer beneath the host coding agent.

The host agent remains responsible for:

- understanding the session
- deciding what is important
- generating the title, description, and summary
- deciding which memories are relevant in a new session

Chronicle is responsible for:

- storage
- retrieval interfaces
- repository-local configuration
- hook entrypoints
- generated integration artifacts
- consistent validation and error handling

This keeps Chronicle deliberately small, boring, and easy to reason about.

## Core Concepts

### Memory

A Chronicle memory is a structured record containing:

- `title`
- `description`
- `summary`
- metadata such as timestamps, ancestry, staleness, and originating agent

### Catalog

The catalog is the lightweight index of memories used at session start.

It contains:

- memory IDs
- titles
- descriptions
- token estimates

The catalog is intentionally small so the agent can decide relevance without loading every memory.

### Knowledge Ancestry

When a session creates a new memory after using older memories, the new memory can record those prior memories as parents.

This preserves how knowledge evolved over time.

### Supersession

When an older memory becomes stale, it can be superseded by a newer one.

By default, superseded memories are hidden from the active catalog.

## Current Repository State

Chronicle is **partially implemented**.

### Completed

- Epic 1: project scaffold and database foundation
- Most of Epic 2: core CLI commands except `chronicle init`
- Command and unit tests
- Build/typecheck/test workflow
- Root status tracking docs

### Implemented Commands

- `chronicle create`
- `chronicle update`
- `chronicle get`
- `chronicle list`
- `chronicle delete`
- `chronicle supersede`
- `chronicle hook session-start`

### Not Yet Implemented

- `chronicle init`
- generated agent templates and instruction artifacts
- README-driven end-user onboarding flow through `init`
- Epic 4 integration/manual/publish polish

## Important Current Limitation

At the moment, the CLI command surface is **not fully end-user complete** because `chronicle init` has not been implemented yet.

That means the implemented commands currently assume the repository already contains:

- `.chronicle/config.json`
- `.chronicle/chronicle.db`

This is intentional and follows the implementation sequencing in `docs/implementation-plan.md`.

## Quick Start

## Prerequisites

- **Node.js** `>= 20`
- **npm**
- **Git**
- A local development environment capable of building native Node modules
  - Chronicle uses `better-sqlite3`, which is a native addon

## Developer Quick Start

This is the correct quick start for the repo **today**.

### 1. Install dependencies

```bash
npm install
```

### 2. Typecheck the project

```bash
npm run typecheck
```

### 3. Build the CLI

```bash
npm run build
```

### 4. Run the test suite

```bash
npm test
```

## Current Functional Quick Start

Until `chronicle init` exists, the available commands require an initialized `.chronicle/` directory.

If you want to exercise the implemented command surface manually right now, you must provide:

- a `.chronicle/config.json`
- a `.chronicle/chronicle.db` initialized with the current schema

In practice, the current repo is best used in one of these ways:

- as a development/codebase for continuing implementation
- through the test suite, which creates initialized temp repos automatically
- through manual local setup for experimental CLI validation

## Planned End-User Quick Start

This is the intended flow once `chronicle init` is implemented.

```bash
npm install -g chronicle-memory
chronicle init --agent claude-code --agent copilot
chronicle create --stdin
chronicle list
chronicle get <id>
```

That flow is the target UX, but it is **not yet fully available** because `init` is still pending.

## CLI Command Reference

## Implemented Today

### `chronicle create`

Create a new memory.

Supports:

- argument-based input
- `--stdin` JSON input
- token limit enforcement from config

Example:

```bash
chronicle create --title "Auth module" --description "JWT auth decisions" --summary "## Goals\n- Build auth"
```

Example with stdin:

```bash
echo '{"title":"Auth module","description":"JWT auth decisions","summary":"## Goals\n- Build auth"}' | chronicle create --stdin
```

### `chronicle update <id>`

Update one or more fields on an existing memory.

Supports:

- partial updates
- `--stdin` JSON input
- token recalculation if `summary` changes

### `chronicle get <id>`

Return the full memory payload as JSON.

### `chronicle list`

List memories.

Supports:

- `--format json|table`
- `--include-superseded`
- `--limit`
- `--offset`

### `chronicle delete <id>`

Delete a memory.

Supports:

- `--force`
- interactive confirmation requirements
- protection when a memory is referenced by others

### `chronicle supersede <old> <new>`

Mark one memory as superseded by another.

Supports:

- self-supersede protection
- cycle detection
- re-pointing an already superseded memory

### `chronicle hook session-start`

Emit a SessionStart payload for agent hooks.

Behavior:

- silent no-op if Chronicle is not initialized
- empty-store message if there are zero active memories
- truncated catalog output with browse instructions if needed
- never crashes the host agent session by design

## Pending Command

### `chronicle init`

Planned responsibilities:

- create `.chronicle/`
- initialize DB and config
- add `.gitignore` entries
- generate agent integration artifacts
- merge/update hook and instruction files idempotently

Status: **not yet implemented**

## Scripts

Available repo scripts:

```bash
npm run typecheck
npm run build
npm test
npm run test:watch
```

## Repository Structure

Current top-level structure:

```text
Chronicle/
├── bin/
│   └── chronicle.js
├── docs/
│   ├── architecture.md
│   ├── intial-idea.md
│   ├── functional-requirements.md
│   ├── implementation-plan.md
│   └── fr-plan-gap-analysis.md
├── src/
│   ├── commands/
│   ├── config/
│   ├── db/
│   ├── utils/
│   └── index.ts
├── tests/
│   ├── commands/
│   └── unit/
├── STATUS.md
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

## Technology Stack

- **Language**: TypeScript
- **Runtime**: Node.js 20+
- **CLI framework**: `commander`
- **Database**: SQLite via `better-sqlite3`
- **Build**: `tsup`
- **Testing**: `vitest`

## Architecture and Engineering Details

For the detailed technical view of the current system, see:

- `docs/architecture.md`

That document covers:

- current architecture and layering
- functional flow and data flow
- source layout responsibilities
- module boundaries
- engineering patterns and mental models
- database usage and persistence patterns
- hook behavior and graceful degradation model
- current constraints and trade-offs

## Engineering Practices

The repo currently follows these practices:

- strong TypeScript typing with no `any`
- parameterized SQL only
- explicit validation before persistence
- structured error handling with explicit exit codes
- command execution separated from CLI registration
- tests added alongside implemented slices

## Testing and Quality Status

Current validated state:

- `npm run typecheck` passes
- `npm run build` passes
- `npm test` passes

Latest validated total:

- **40/40 tests passing**

Coverage currently includes:

- config
- database layer
- error handling
- path resolution
- token estimation
- validation
- create command
- update command
- get command
- list command
- delete command
- supersede command
- hook command

## Current Development Workflow

Recommended local workflow:

### 1. Install

```bash
npm install
```

### 2. Typecheck before larger edits

```bash
npm run typecheck
```

### 3. Run tests after a slice of work

```bash
npm test
```

### 4. Build before checkpointing

```bash
npm run build
```

### 5. Commit in focused increments

The repo is already using conventional commits.

Example:

```text
feat: scaffold chronicle CLI foundation
```

## Status and Project Tracking Files

Useful project-tracking docs already present in the repo:

- `docs/implementation-plan.md`
- `docs/functional-requirements.md`
- `docs/intial-idea.md`
- `docs/fr-plan-gap-analysis.md`
- `STATUS.md`

## Roadmap / What Comes Next

The most important next implementation step is:

- **Epic 3**: agent integration templates and generated artifacts

That work unblocks:

- `chronicle init`
- full repo onboarding flow
- generated skills and instructions
- agent-specific integration scaffolding

After that:

- Epic 4 integration testing and polish
- README polish can evolve further alongside actual user onboarding support

## Non-Goals for the MVP

The current MVP intentionally avoids:

- vector embeddings
- semantic search
- transcript archival
- direct LLM API calls
- multi-repo memory sharing
- enterprise collaboration features
- extra agent targets beyond the defined MVP direction

## Contributing Notes

If you continue implementation in this repo, preserve these conventions:

- keep the implementation aligned with `docs/implementation-plan.md`
- update plan/task statuses when meaningful milestones are completed
- keep runtime behavior honest to the actual implementation state
- do not document unimplemented features as if they already exist
- keep the CLI strongly typed and testable
- prefer explicitness over cleverness in validation, SQL access, and error handling

## Summary

Chronicle is a local memory layer for coding agents focused on continuity across sessions.

Today, this repo already contains:

- a strong TypeScript CLI foundation
- a validated SQLite persistence layer
- a tested command surface for core memory operations
- a safe hook entrypoint
- clear implementation docs and project status tracking

The major remaining gap before the intended onboarding experience is `chronicle init` and the Epic 3 integration/template work that supports it.
