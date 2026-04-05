# Chronicle Architecture

## Purpose of This Document

This document describes the **current implemented architecture** of Chronicle.

It focuses on:

- the current mental model of the system
- module and source layout responsibilities
- functional flows
- data flow
- persistence patterns
- command execution model
- engineering patterns established so far
- current architectural constraints and trade-offs

This is not a future-state wish list. It documents the repo as it exists today.

## Current Implementation Scope

Chronicle currently consists of:

- a TypeScript CLI package
- a SQLite-backed persistence layer
- a shared command runtime abstraction
- implemented command modules for core memory operations
- unit and command-level tests

Implemented command surface:

- `chronicle create`
- `chronicle update`
- `chronicle get`
- `chronicle list`
- `chronicle delete`
- `chronicle supersede`
- `chronicle hook session-start`

Not yet implemented:

- `chronicle init`
- generated agent integration templates and artifacts
- end-to-end onboarding flow for new repositories

## System Mental Model

Chronicle is best understood as a **thin local systems layer** for agent memory, not as an autonomous intelligence layer.

The host coding agent is responsible for:

- understanding the session or source material
- deciding what deserves memory
- generating the `title`, `description`, and `summary`
- deciding which memories are relevant in a later session

Chronicle is responsible for:

- durable local storage
- retrieval interfaces
- validation
- config handling
- predictable CLI behavior
- safe hook payload generation

In short:

```text
Agent decides and reasons
Chronicle stores, validates, retrieves, and structures
```

## Architectural Principles

The current implementation follows these principles.

### 1. Keep the core small

Chronicle intentionally avoids embedding intelligence into the storage layer.

Practical result:

- no vector store
- no embeddings
- no external API calls
- no transcript archival layer
- no complex orchestration runtime

### 2. Separate command transport from command logic

Commander is used for CLI parsing, but command execution is implemented in independent functions.

Practical result:

- commands can be tested directly without shell execution
- I/O is not tightly coupled to business logic

### 3. Keep storage access centralized

All SQL is located in `src/db/queries.ts`.

Practical result:

- consistent SQL access patterns
- parameterized statements only
- easier auditing and maintenance

### 4. Prefer explicit validation boundaries

Input parsing and validation happen before persistence.

Practical result:

- malformed JSON is rejected early
- length and structure constraints are centralized
- command modules remain focused on orchestration rather than low-level validation details

### 5. Fail safely, especially in hooks

The hook path must not break agent startup.

Practical result:

- uninitialized repo returns an empty payload
- failures are converted into warnings instead of hard failures
- resources are still cleaned up correctly

## High-Level Architecture

The current architecture is layered as follows:

```text
CLI entrypoint (`src/index.ts`)
  -> command registration (`src/commands/*`)
    -> shared runtime / command helpers (`src/commands/shared.ts`)
      -> validation / config / path resolution / error model (`src/utils`, `src/config`)
        -> database connection, schema, queries (`src/db/*`)
          -> SQLite file in `.chronicle/chronicle.db`
```

### Layer Responsibilities

#### CLI entrypoint layer

Responsible for:

- constructing the Commander program
- registering command modules
- creating the default runtime implementation

#### Command layer

Responsible for:

- accepting typed command options
- orchestrating validation, config access, and DB access
- converting domain results into CLI-facing result objects

#### Shared runtime layer

Responsible for:

- abstracting process-level behavior
- handling stdout/stderr
- exposing stdin
- providing current time and ID generation
- supporting confirmation prompts
- enabling deterministic tests

#### Validation/config/path layer

Responsible for:

- validating command input
- parsing JSON safely
- reading and validating config
- locating repo-local Chronicle paths
- shaping structured errors

#### Persistence layer

Responsible for:

- opening SQLite
- initializing schema
- performing all CRUD operations through prepared statements
- mapping database rows into typed in-memory objects

## Source Layout and Module Responsibilities

## Root-Level Files

### `package.json`

Defines:

- package identity (`chronicle-memory`)
- CLI binary entrypoint
- Node engine requirement
- runtime dependencies
- development scripts

### `tsconfig.json`

Defines the TypeScript compilation rules.

### `tsup.config.ts`

Defines the build output strategy.

### `bin/chronicle.js`

Node CLI launcher that forwards execution into the built `dist/index.js` bundle.

### `STATUS.md`

Repo-level implementation status snapshot.

## `src/index.ts`

This is the CLI bootstrap module.

Responsibilities:

- read package version
- create the root Commander program
- instantiate the default runtime
- register implemented commands
- execute CLI parsing

Current registered commands:

- create
- update
- get
- list
- delete
- supersede
- hook

## `src/commands/`

This directory contains command modules and command-level infrastructure.

### `src/commands/shared.ts`

This is the key command infrastructure module.

Responsibilities:

- define the `CommandRuntime` abstraction
- define the Chronicle command context
- read stdin safely
- open Chronicle config/DB context from the current working directory
- normalize output formatting
- centralize structured command error handling
- provide table formatting utilities for `list`
- expose reusable helpers for converting internal memory models into CLI-facing JSON payloads

This module is important because it decouples command logic from direct use of Node globals.

### `src/commands/create.ts`

Responsibilities:

- accept args mode or `--stdin`
- validate creation payloads
- estimate token count
- enforce config summary token limit
- generate IDs and timestamps
- insert a memory through the query layer

### `src/commands/update.ts`

Responsibilities:

- accept partial updates via args or `--stdin`
- validate update payloads
- reload the target memory
- recompute token count only if `summary` changes
- preserve unchanged data implicitly through the query layer

### `src/commands/get.ts`

Responsibilities:

- load one memory by ID
- return a normalized CLI JSON shape

### `src/commands/list.ts`

Responsibilities:

- support JSON or table output
- support pagination
- support superseded filtering
- use config defaults when limit is not provided

### `src/commands/delete.ts`

Responsibilities:

- load the target memory
- detect parent and supersession references
- require `--force` when appropriate
- require interactive confirmation in TTY mode when not forced
- delete the memory through the query layer

### `src/commands/supersede.ts`

Responsibilities:

- validate both memory IDs exist
- reject self-supersession
- reject transitive cycles
- update the supersession pointer

### `src/commands/hook.ts`

Responsibilities:

- generate the SessionStart payload
- return empty output for uninitialized repos
- return empty-store guidance for initialized but empty repos
- return a truncated catalog when needed
- degrade to warning output instead of throwing failures outward

## `src/config/`

### `src/config/config.ts`

Responsibilities:

- define the `ChronicleConfig` type
- provide `DEFAULT_CONFIG`
- validate config values
- read config files
- write config files

Current configuration fields:

- `maxMemoriesToPull`
- `maxMemorySummaryTokens`
- `maxRetrievalTokenBudget`
- `requireConfirmationAbove`
- `maxCatalogEntries`
- `chronicleVersion`

## `src/db/`

### `src/db/connection.ts`

Responsibilities:

- open the SQLite database
- ensure the DB directory exists
- configure rollback journal mode
- convert low-level DB open failures into structured Chronicle DB errors

### `src/db/schema.ts`

Responsibilities:

- create the Chronicle schema
- create indexes
- track schema version
- keep initialization idempotent with `IF NOT EXISTS`

### `src/db/queries.ts`

Responsibilities:

- define typed input and return shapes for persistence operations
- insert/update/get/list/delete/supersede memories
- count active and total memories
- resolve parent and supersession references
- read supersession chains for cycle detection
- map rows from SQLite column shape to in-memory TypeScript models

This file acts as the storage boundary for the app.

## `src/utils/`

### `src/utils/errors.ts`

Responsibilities:

- define error classes
- define exit codes
- normalize unknown errors
- format JSON/text error output

### `src/utils/tokens.ts`

Responsibilities:

- provide the heuristic token estimation function

### `src/utils/validation.ts`

Responsibilities:

- validate create/update inputs
- validate title/description/summary constraints
- parse JSON safely
- parse parent memory IDs consistently

### `src/utils/paths.ts`

Responsibilities:

- locate `.git` when needed
- locate `.chronicle/`
- construct canonical repo-local Chronicle paths

## `tests/unit/`

Unit-level tests for:

- DB foundation
- config
- errors
- paths
- tokens
- validation

## `tests/commands/`

Command-level tests for:

- create
- update
- get
- list
- delete
- supersede
- hook

The tests use temporary repos and runtime stubs rather than shelling out to the built CLI.

## Functional Flow

This section describes how the currently implemented command layer behaves.

## Flow 1: Create Memory

```text
CLI args / stdin
  -> parse input
  -> validate required fields
  -> resolve `.chronicle/` paths from cwd
  -> read config
  -> open DB
  -> estimate summary token count
  -> enforce config token limit
  -> generate ID + timestamp
  -> insert memory
  -> emit JSON result
```

Important notes:

- summary token enforcement happens at command level before insert
- creation does not infer parents automatically; it accepts them from the caller

## Flow 2: Update Memory

```text
CLI args / stdin
  -> parse partial update input
  -> validate only provided fields
  -> resolve Chronicle context
  -> load existing memory
  -> if summary changed, recalculate token count
  -> enforce token limit if summary changed
  -> run partial update query
  -> emit JSON result
```

Important notes:

- unchanged fields are preserved
- token count is only recalculated when `summary` changes

## Flow 3: Get Memory

```text
CLI input ID
  -> resolve Chronicle context
  -> query DB by ID
  -> map to CLI JSON output shape
  -> emit result
```

## Flow 4: List Memories

```text
CLI options
  -> normalize format
  -> resolve Chronicle context
  -> apply default or explicit limit/offset
  -> query active or all memories
  -> count total result set
  -> render JSON or table output
```

Important notes:

- JSON output is machine-oriented
- table output is for humans
- active list excludes superseded memories by default

## Flow 5: Delete Memory

```text
CLI input ID
  -> resolve Chronicle context
  -> load target memory
  -> check references from parent ancestry and supersession relationships
  -> if referenced and not forced, reject
  -> if not forced and interactive, ask for confirmation
  -> delete memory
  -> emit JSON result
```

Important notes:

- deletion is intentionally conservative
- non-interactive deletion requires `--force`

## Flow 6: Supersede Memory

```text
CLI input oldId/newId
  -> validate not the same ID
  -> resolve Chronicle context
  -> ensure both memories exist
  -> walk the supersession chain from newId
  -> reject if oldId appears in that chain
  -> update superseded_by_id
  -> emit JSON result
```

## Flow 7: Hook Session Start

```text
Agent hook invocation
  -> attempt to resolve Chronicle context
  -> if no `.chronicle/`, emit empty payload
  -> if zero active memories, emit empty-store guidance
  -> otherwise load first page of active memories
  -> build catalog context text
  -> emit SessionStart payload
  -> on error, emit warning payload instead of failing
```

## Data Flow

## Input Sources

Current input sources are:

- CLI positional arguments
- CLI options
- JSON passed through stdin
- local config file
- local SQLite database
- current working directory for repo resolution

## Output Types

Current outputs are:

- JSON command results
- human-readable table output for `list`
- JSON hook payloads for session start
- structured JSON/text errors

## Data Transformations

Typical data transformations in the current system:

```text
raw CLI input
  -> validated TypeScript object
  -> query-layer input object
  -> SQLite row
  -> typed domain object
  -> CLI-facing JSON object
```

This layered transformation is intentional and reduces leakage of low-level persistence shapes into the command layer.

## Persistence Model

## Storage Location

Chronicle stores project-local state under:

```text
.chronicle/
├── chronicle.db
└── config.json
```

## Database Tables

### `memories`

Current fields:

- `id`
- `title`
- `description`
- `summary`
- `session_agent`
- `parent_ids`
- `superseded_by_id`
- `token_count`
- `created_at`
- `updated_at`

### `schema_version`

Used to track schema evolution over time.

## Persistence Rules

Current rules enforced in implementation:

- IDs are text identifiers
- `parent_ids` is stored as JSON text
- timestamps are stored as UTC ISO 8601 strings
- token counts are stored as integer estimates
- all mutations go through prepared statements
- no command builds ad-hoc SQL directly

## Current Database Decisions

### Rollback journal mode

The connection layer explicitly uses `journal_mode = DELETE`.

Reason:

- simpler Git story for the MVP
- avoids WAL-specific portability/version-control concerns

### Token estimation heuristic

Current rule:

```text
Math.ceil(text.length / 4)
```

Reason:

- lightweight
- no tokenizer dependency
- good enough for rough retrieval budget estimation in the MVP

### Parent ancestry as JSON

Current rule:

- parent memory IDs are stored as JSON text in `parent_ids`

Reason:

- simple schema
- easy to write from CLI
- works adequately for current ancestry/reference queries

## Engineering Patterns Established So Far

## 1. Command Execution + Registration Split

Pattern:

- each command has an execution function
- each command has a registration function

Benefits:

- direct unit testing
- lower coupling to Commander
- easier refactoring later

## 2. Runtime Injection Pattern

Pattern:

- command execution depends on a runtime object rather than directly on `process`

Benefits:

- deterministic tests
- easier future adaptation
- reduced hidden dependencies

## 3. Context Resolution Pattern

Pattern:

- command modules call shared helpers to open Chronicle config/DB context from cwd

Benefits:

- one consistent repo-resolution path
- less duplication across commands

## 4. Typed Boundary Mapping

Pattern:

- DB row shapes, in-memory models, and CLI JSON payloads are represented separately

Benefits:

- clearer contracts
- less accidental leakage of storage naming conventions
- easier future migrations

## 5. Fail-Fast Validation

Pattern:

- input is validated before persistence or side effects

Benefits:

- safer command behavior
- clearer error reporting
- lower risk of corrupt state

## 6. Graceful Hook Degradation

Pattern:

- hooks return safe payloads even when Chronicle fails internally

Benefits:

- protects host agent workflows
- keeps Chronicle as an enhancement rather than a point of failure

## 7. Deterministic Test Helpers

Pattern:

- tests use temp repos, seeded DB state, and custom runtimes

Benefits:

- fast feedback
- low flakiness
- no dependence on machine-local Chronicle setup

## Current Error Model

The current system uses a typed error hierarchy.

Key error categories:

- validation errors
- repository/config errors
- database errors
- not-found errors
- operation-canceled errors for interactive flows

Error handling goals:

- predictable exit codes
- structured machine-readable errors
- safe degradation for hook entrypoints

## Security and Safety Properties

Current safety properties of the codebase:

- SQL uses bound parameters rather than raw interpolation
- JSON input is parsed explicitly and validated
- delete is conservative and guarded
- hook startup is defensive
- config values are validated before use
- DB connections are closed in `finally` blocks

## Current Constraints and Trade-Offs

## What the architecture currently optimizes for

- clarity
- testability
- local-first operation
- small dependency surface
- safe command behavior

## What the architecture intentionally does not optimize for yet

- multi-user concurrency workflows
- advanced retrieval strategies
- high-scale memory analytics
- transcript archival
- generated integration artifacts
- turnkey onboarding through `chronicle init`

## Known Architectural Gap

The biggest remaining architectural gap is the missing `chronicle init` path and the Epic 3 template/integration artifact layer that it depends on.

Until that exists:

- the implemented commands are real and tested
- the repo is not yet fully self-bootstrapping for end users

## How to Read the Codebase

A good reading order for the current implementation is:

1. `src/index.ts`
2. `src/commands/shared.ts`
3. one command module such as `src/commands/create.ts`
4. `src/config/config.ts`
5. `src/utils/validation.ts`
6. `src/db/queries.ts`
7. `src/db/schema.ts`
8. `tests/commands/`

This order gives a good top-down view of the CLI architecture.

## Summary

Chronicle currently has a clean, layered CLI architecture built around:

- strong typing
- explicit validation
- centralized SQL access
- runtime abstraction for testability
- graceful hook behavior
- local SQLite persistence

It is already a solid foundation for the next phase of work: Epic 3 integration/template generation and the `chronicle init` flow that depends on it.
