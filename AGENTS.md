# AGENTS.md

## Project Overview

Chronicle is a **project-scoped, local memory layer for coding agents** — a TypeScript CLI tool that gives AI coding agents persistent memory across sessions using SQLite and Commander.

**What it does:** Stores structured project knowledge (memories) inside the repository itself so fresh agent sessions can discover and load relevant prior knowledge without manual documentation.

**What it does NOT do:** Chronicle makes zero LLM API calls. All intelligence (summarization, relevance decisions) is delegated to the host coding agent. Chronicle is infrastructure only — storage, retrieval interfaces, validation, and agent integration artifacts.

### Key facts

- **Package name:** `chronicle-memory`
- **Binary name:** `chronicle`
- **Runtime deps (2 only):** `better-sqlite3`, `commander`
- **Runtime:** Node.js >= 20
- **Database:** SQLite via `better-sqlite3` (synchronous, native C++ addon)
- **Journal mode:** Rollback (`DELETE`), NOT WAL — simpler Git story

---

## Setup Commands

```bash
npm install          # Install dependencies (includes native better-sqlite3 build)
npm run typecheck    # Run TypeScript type checking (tsc --noEmit)
npm run build        # Build with tsup → outputs to dist/
npm test             # Run full test suite with vitest
npm run test:watch   # Run tests in watch mode
npm pack --dry-run   # Verify tarball contents before publishing
```

The CLI entry point is `bin/chronicle.js` which requires `dist/index.js`. You must run `npm run build` before using the CLI directly.

---

## Project Structure

```
chronicle/
├── bin/chronicle.js          # CLI shebang entry → dist/index.js
├── src/
│   ├── index.ts              # CLI entrypoint (Commander setup + command registration)
│   ├── commands/             # One file per command + shared.ts for runtime/helpers
│   ├── templates/            # Skill, instruction, and hook template renderers consumed by chronicle init
│   ├── db/                   # SQLite connection, schema, prepared-statement queries
│   ├── config/               # .chronicle/config.json read/write/validation
│   └── utils/                # tokens, validation, errors, paths
├── tests/
│   ├── unit/                 # Unit tests (utilities, DB modules, template renderers)
│   ├── commands/             # Command tests + helpers.ts (test runtime, repo seeding)
│   └── integration/          # Registered-CLI lifecycle and cross-command integration tests
├── .github/workflows/        # CI (test matrix) and CD (npm publish) pipelines
├── docs/specs/               # FR spec, implementation plan, STATUS, gap analysis
├── docs/architecture.md      # Architectural patterns (evolving)
└── docs/operations.md        # CI/CD, versioning, and release workflow
```

**Key files to know:**
- `src/commands/shared.ts` — `CommandRuntime` interface, context opening, output formatters, table rendering
- `src/db/queries.ts` — All prepared statements and the `ChronicleQueries` type
- `src/templates/shared.ts` — Template rendering primitives and agent-specific formatting boundary
- `src/templates/skills/index.ts` — Canonical skill template manifest for both supported agents
- `src/utils/errors.ts` — Error hierarchy (`ChronicleError` subclasses) and exit codes
- `tests/commands/helpers.ts` — `createGitRepo()`, `createInitializedRepo()`, `createTestRuntime()`, `seedMemory()`
- `tests/integration/lifecycle.test.ts` — End-to-end registered-CLI lifecycle, hook, and error-path coverage

---

## Authoritative Documentation

The project docs are the **source of truth** for scope, sequencing, and design decisions:

- **`docs/specs/implementation-plan.md`** — The authoritative implementation plan. Epics, task ordering, and acceptance criteria live here. Always consult before starting new work.
- **`docs/specs/functional-requirements.md`** — Complete functional requirements (FR-1 through FR-14). Every implementation decision should trace back to an FR.
- **`docs/specs/STATUS.md`** — Current implementation state. Check this before assuming what is or isn't built.
- **`docs/architecture.md`** — Architectural patterns, layer diagram, and key design decisions.

**When in doubt about scope or behavior, check the implementation plan first, then the FR doc.**

---

## Coding Standards

### TypeScript

- **Strict mode is on.** No `any` — use `unknown` and narrow explicitly.
- Never use **`as` casts** unless it is absolutely necessary.
- **Explicit interfaces** for all command options, results, and data shapes.
- **Imports use `node:` prefix** for Node.js built-ins. Use `import type` for type-only imports.
- **Nullable values handled intentionally** — `| null` for DB-nullable fields, `| undefined` for optional inputs.
- **No comments in production code** unless they explain a non-obvious decision. The code should be self-documenting through naming and types.

### SQL and Database

- **All SQL uses parameterized placeholders (`@name` or `?`).** Never concatenate user input into SQL.
- **All queries are prepared statements** in `src/db/queries.ts`. Commands never write raw SQL.
- **DB connections closed in `finally` blocks, and partially opened handles must be cleaned up if DB initialization fails.** Rollback journal mode (`DELETE`) — do not switch to WAL.
- **Timestamps are UTC ISO 8601** strings generated via `new Date().toISOString()`.

### CLI Output

- **JSON is the default** output — stable shapes, machine-first, pretty-printed with 2-space indent.
- CLI-facing JSON uses **snake_case** keys. Internal domain objects use **camelCase**.
- **Stdout** for success output. **Stderr** for errors.
- All errors flow through `ChronicleError` subclasses — never throw raw `Error`.
- Hook commands **never throw** — convert errors to warning context.

---

## Key Patterns

These patterns are **mandatory** — all new code must follow them. See `docs/architecture.md` for the full picture.

### Command Execution + Registration Split

Every command exports `executeXxxCommand()` (testable logic) and `registerXxxCommand()` (Commander wiring). **Never put business logic in `.action()` callbacks.**

### Runtime Injection

Commands depend on `CommandRuntime` (defined in `src/commands/shared.ts`) — never access `process` directly. Production: `createNodeCommandRuntime()`. Tests: `createTestRuntime()`.

### Context Resolution

Use `openChronicleContext(runtime)` for DB access. Always close in `finally`. For hooks, use `openOptionalChronicleContext()` which returns `null` instead of throwing.

### Typed Boundary Mapping

Three data shapes — never leak across boundaries:
- **`MemoryRow`** → **`MemoryRecord`** (camelCase domain) → **`GetJsonMemory`/`ListJsonMemory`** (snake_case CLI output)

### Reusable Artifact Generation

Agent integration artifacts are generated through typed renderers in `src/templates/`.

- Keep agent-specific differences isolated at the template boundary.
- Do not scatter skill text, instruction snippets, or hook JSON across unrelated modules.

### Graceful Hook Degradation

`hook session-start` **always exits 0**. Errors become warnings in the output payload. Chronicle must never block agent startup.

---

## Testing

- **Vitest.** Run `npm test`. Tests call `executeXxxCommand()` directly — never shell out.
- **Test infra** in `tests/commands/helpers.ts`: `createGitRepo()`, `createInitializedRepo()`, `seedMemory()`, `createTestRuntime()`.
- **Temp dirs** cleaned in `afterEach` via the `repos` array pattern.
- **Every new command** → `tests/commands/<name>.test.ts`. Every new utility → `tests/unit/<name>.test.ts`.
- **Cross-command and end-to-end CLI behavior** → extend `tests/integration/lifecycle.test.ts`.
- **Template renderers** should be validated in `tests/unit/templates.test.ts` or a neighboring focused unit test file.
- Always run `npm run typecheck && npm test` before considering work complete.

---

## How-To Recipes

### Adding a New Command

1. Create `src/commands/<name>.ts` with `executeXxxCommand()` + `registerXxxCommand()`.
2. Use `openChronicleContext(runtime)`, close in `finally`, return typed result.
3. Register in `src/index.ts`.
4. Add `tests/commands/<name>.test.ts`.

### Adding or Updating a Template

1. Add or update the renderer in `src/templates/skills/`, `src/templates/instructions/`, or `src/templates/hooks/`.
2. Keep agent-specific formatting decisions inside the template layer, not in commands.
3. If the template is part of the skill set, update `src/templates/skills/index.ts`.
4. Add or update focused unit coverage in `tests/unit/templates.test.ts`.

### Adding a New Query

1. Add prepared statement in `createQueries()` in `src/db/queries.ts`.
2. Use `@paramName` or `?` placeholders. Wrap in try/catch, throw `DatabaseError`.
3. Add interface types at top of file.

### Modifying the Schema

1. Update `SCHEMA_SQL` in `src/db/schema.ts`, increment `CURRENT_SCHEMA_VERSION`.
2. Add migration logic in `initializeSchema()` if preserving existing data.

---

## Constraints

- **Zero external API calls** — all intelligence delegated to the host agent.
- **Two runtime deps only** — `better-sqlite3` and `commander`. Do not add more without justification.
- **Cross-platform** — no shell scripts, no platform-specific code.
- **Graceful degradation** — Chronicle failures must never block agent sessions.
