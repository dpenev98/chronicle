# Chronicle Status

## Current Repository State

Chronicle has been bootstrapped from a docs-only repository into a working TypeScript CLI codebase with a validated Epic 1 foundation, a completed Epic 2 command layer, and an Epic 3 integration layer that is now wired into `chronicle init`.

The implementation has followed the project docs as the authoritative source, especially:
- `docs/implementation-plan.md`
- `docs/functional-requirements.md`
- `docs/intial-idea.md`

## Implementation Progress

### Epic 1: Project Scaffold & Database Layer

Status: Done

Implemented:
- Project scaffold
  - `package.json`
  - `tsconfig.json`
  - `tsup.config.ts`
  - `bin/chronicle.js`
  - `src/index.ts`
- Core utility and infrastructure modules
  - `src/utils/errors.ts`
  - `src/utils/tokens.ts`
  - `src/utils/validation.ts`
  - `src/utils/paths.ts`
  - `src/config/config.ts`
- SQLite layer
  - `src/db/connection.ts`
  - `src/db/schema.ts`
  - `src/db/queries.ts`
- Unit tests for the foundation
  - `tests/unit/*.test.ts`

Delivered behavior:
- SQLite database creation/opening with rollback journal mode
- Schema initialization with version tracking
- Parameterized prepared statements for memory CRUD primitives
- Config read/write/validation with defaults
- Token estimation with a lightweight heuristic
- Strong input validation for title, description, summary, and parent memory IDs
- Repo-relative path discovery for `.chronicle/`
- Structured error model with explicit exit codes

### Epic 2: CLI Commands

Status: Done

Implemented:
- `chronicle init`
- `chronicle create`
- `chronicle update`
- `chronicle get`
- `chronicle list`
- `chronicle delete`
- `chronicle supersede`
- `chronicle hook session-start`

Also implemented:
- Shared command runtime and helpers in `src/commands/shared.ts`
- Command-level tests in `tests/commands/*.test.ts`

Delivered behavior:
- Init supports Git repo root discovery from nested directories
- Init creates or reuses `.chronicle/`, verifies DB integrity on re-run, applies schema initialization/migration steps, refreshes `chronicleVersion`, and preserves existing memories
- Init updates `.gitignore` idempotently for rollback journal transient files
- Init generates Claude and Copilot managed artifacts from the template layer
- Init structurally merges `.claude/settings.json`, replaces Chronicle marker blocks in instruction files, and overwrites Chronicle-owned skill/hook artifacts with managed headers/metadata
- Create supports args mode and `--stdin`
- Update supports partial updates and `--stdin`
- Get returns the full memory payload
- List supports JSON/table output, pagination, and superseded filtering
- Delete supports `--force`, interactive confirmation requirements, and reference protection
- Supersede enforces no self-supersede and no cycles
- Session-start hook returns:
  - silent no-op for uninitialized repos
  - empty-store message for initialized repos with no memories
  - truncated catalog output with browse instructions and retrieval guidance

### Epic 3: Agent Integration Templates & Init Scaffolding

Status: In Progress

Implemented:
- skill template modules under `src/templates/skills/`
  - `create-memory`
  - `create-memory-from`
  - `update-memory`
  - `list-memories`
  - `recall`
- custom instruction template modules under `src/templates/instructions/`
  - `claude-md.ts`
  - `copilot-instructions.ts`
- hook config template modules under `src/templates/hooks/`
  - `claude-code.ts`
  - `copilot.ts`
- shared template helpers in `src/templates/shared.ts`
- template export surface in `src/templates/index.ts`
- unit coverage for the template layer in `tests/unit/templates.test.ts`

Delivered behavior:
- Claude skill templates render plain markdown skill content
- Copilot skill templates render YAML frontmatter plus markdown content for slash-command discovery
- the `/create-memory` and `/create-memory-from` prompts enforce `--stdin` usage and config-aware summary budgeting
- the `/recall` prompt instructs the agent to respect retrieval budgets and confirmation thresholds from `.chronicle/config.json`
- custom instruction snippets render with idempotent `<!-- chronicle:start -->` markers and config-derived budget values
- hook templates render the shared `chronicle hook session-start` command for both agents
- `chronicle init` now wires the template layer into real filesystem generation for both Claude and Copilot
- generated Chronicle-owned skill and hook artifacts include managed metadata and are overwritten on re-init
- init coverage now exercises multi-agent generation, managed marker replacement, hook merging, overwrite semantics, invalid persisted files, and migration-style DB edge cases

Still pending in this epic:
- external validation of the Copilot local hook JSON schema against current public docs

### Epic 4: Integration Testing & Polish

Status: Not Started

## Technical Decisions Made During Implementation

### 1. Use the docs as implementation authority

The repo docs are treated as the source of truth for scope and sequencing.

Practical outcome:
- Epic 1 was completed first
- Epic 2 is now complete
- the template layer was built before `chronicle init` and is now the generation boundary used by `init` for managed artifacts

### 2. Keep the CLI strongly typed and modular

The command layer is split into dedicated modules under `src/commands/` instead of building everything directly inside `src/index.ts`.

Practical outcome:
- better separation of concerns
- easier command-level testing
- lower coupling between parsing, validation, execution, and rendering

### 3. Introduce a dedicated command runtime abstraction

A shared runtime abstraction was added in `src/commands/shared.ts` to avoid hard-wiring command logic directly to Node process globals.

Practical outcome:
- commands are directly testable without shelling out
- stdin/stdout/stderr behavior can be controlled in tests
- time and ID generation are injectable for deterministic tests

### 4. Keep database access behind prepared statements only

All current SQL operations are encapsulated in `src/db/queries.ts` and use bound parameters.

Practical outcome:
- avoids unsafe string interpolation in SQL
- centralizes row mapping and persistence behavior
- keeps command modules focused on business logic

### 5. Use rollback journal mode for the MVP

The database connection explicitly uses `journal_mode = DELETE`.

Practical outcome:
- aligns with the MVP direction of favoring Git simplicity over WAL complexity
- keeps the storage story closer to a single committed `.db` file model

### 6. Separate command behavior from output formatting

Commands return typed result objects, and output formatting is handled explicitly by shared rendering helpers.

Practical outcome:
- easier testing
- clearer control over machine-readable JSON versus human-readable text output
- lower risk of command logic becoming tangled with I/O concerns

### 7. Preserve hook safety guarantees

The session-start hook is implemented so it always returns a successful payload shape and converts failures into warning context instead of crashing.

Practical outcome:
- aligns with the requirement that Chronicle must not block normal agent operation
- protects agent startup from DB/config failures

### 8. Build templates as reusable generators, not ad hoc file blobs

The Epic 3 template layer was implemented as typed renderer functions rather than static files copied directly into the repo.

Practical outcome:
- `chronicle init` now chooses agent-specific formats at generation time
- Copilot-specific frontmatter behavior is centralized instead of duplicated
- instruction blocks and hook configs remain testable independently from filesystem writes

## Established Patterns

### Strong typing

Patterns established so far:
- no `any` usage in implemented code
- explicit interfaces for command options and results
- explicit mapping between internal DB records and CLI JSON payloads
- nullable values are handled intentionally rather than implicitly

### Clear validation boundaries

Patterns established so far:
- parsing and validation happen before persistence
- malformed inputs produce explicit validation errors
- config validation is centralized
- parent ID parsing is handled consistently in one place

### Resource lifecycle discipline

Patterns established so far:
- DB connections are opened close to use sites
- command execution closes DB handles in `finally` blocks
- hook execution preserves the same cleanup discipline while still degrading gracefully

### Testability-first design

Patterns established so far:
- command execution functions are exported independently of Commander registration
- test helpers create temporary repos and seeded Chronicle state
- tests cover both happy paths and failure behavior
- template renderers are unit-tested directly without needing filesystem generation first

### Machine-first CLI outputs

Patterns established so far:
- JSON output uses stable shapes for command results
- list/get payloads normalize internal camelCase fields into CLI-facing snake_case where appropriate
- error rendering is centralized and consistent

### Reusable artifact generation

Patterns established so far:
- future generated artifacts are represented as typed render functions
- agent-specific differences are isolated at the template boundary
- file content generation is testable independently from filesystem writes

## Issues Found and Resolved So Far

### Partial update parameter binding bug

Issue:
- SQLite update execution initially failed when optional named parameters were omitted during partial updates.

Resolution:
- update execution now binds all named placeholders explicitly and uses `null` only where intended.

### Hook and list command edge cases

Issue:
- `list` needed error handling that stayed inside the structured command wrapper
- hook behavior needed to ensure graceful output and proper cleanup in all paths

Resolution:
- list format handling was tightened
- hook execution was adjusted to always return safe output and always close resources

### Init migration and managed-artifact edge cases

Issue:
- `chronicle init` initially lacked an explicit SQLite integrity verification step for existing databases
- Chronicle-owned generated artifacts did not include managed metadata
- schema version detection failed on valid SQLite databases that existed before the `schema_version` table was initialized

Resolution:
- init now runs `PRAGMA integrity_check` before reusing an existing Chronicle database
- Chronicle-owned skills and Copilot hook JSON now include managed headers/metadata
- `getCurrentSchemaVersion()` now returns `0` when the `schema_version` table is absent, allowing init to treat that state as a migration/setup path instead of failing

## Validation Status

The current codebase has been validated with:
- `npm install`
- `npm run typecheck`
- `npm run build`
- `npm test`

Current known validated state:
- all implemented unit tests pass
- all implemented command tests pass
- template layer unit tests pass
- expanded `init` command coverage passes, including idempotency, invalid persisted files, overwrite semantics, and integrity-check error paths
- current total: `69/69` tests passing at the latest validation checkpoint

## Current Repository Conventions

### Branching / source control

Current working branch at the last documented checkpoint:
- `feat/epic-1-foundation`

Existing conventional commit created earlier:
- `feat: scaffold chronicle CLI foundation`

### File organization

Current implementation organization:
- `src/index.ts` for CLI entrypoint and registration
- `src/commands/` for command modules
- `src/db/` for persistence and schema
- `src/config/` for config logic
- `src/templates/` for generated agent artifact templates
- `src/utils/` for shared non-command utilities
- `tests/unit/` for foundational unit coverage
- `tests/commands/` for command execution coverage

## What Is Intentionally Deferred Right Now

Deferred for plan alignment:
- Epic 4 integration/manual/polish work

Reason:
- the remaining work is now integration/manual/polish follow-through rather than core command or template-generation implementation

## Recommended Next Step

The clean next step is:
- continue Epic 4 with full lifecycle integration tests and hook-format validation for both agent targets

If the implementation order is intentionally changed later, then:
- external validation of the Copilot local hook JSON schema remains the main open Epic 3 item before broader polish work

## Summary

Chronicle currently has:
- a complete Epic 1 foundation
- a complete and tested Epic 2 command layer
- an Epic 3 template and init-generation layer that produces managed agent integration artifacts
- strong typing and explicit validation boundaries
- consistent error handling and resource cleanup patterns
- a stable base for Epic 4 integration testing and agent-specific validation work next
