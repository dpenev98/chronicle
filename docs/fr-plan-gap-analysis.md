# Chronicle — Functional Requirements vs Implementation Plan Gap Analysis

## 1. Review Scope

This report reviews and cross-checks:

- `docs/intial-idea.md`
- `docs/functional-requirements.md`
- `docs/implementation-plan.md`

The goal of this report is not to redesign Chronicle from scratch. The goal is to identify where the current implementation plan does not fully satisfy the functional requirements, where the requirements themselves remain ambiguous, and where there are design or technology choices that are likely to create trouble during implementation.

## 2. Overall Assessment

## Verdict

The implementation plan covers the **majority of the MVP concept correctly**, but it does **not yet fully satisfy the FRs as written**.

The most important gaps are:

- **Retrieval guardrails are mostly prompt-level, not system-enforced**
- **Agent integration details are partly inconsistent with current platform formats**
- **Initialization and re-initialization semantics are incomplete for managed artifacts**
- **Version-controlled SQLite in WAL mode needs stronger portability rules**
- **A few requirement-to-plan mappings are internally inconsistent or contradictory**

## Practical takeaway

If you implemented the plan exactly as written, Chronicle would likely work for the happy path, but it would still violate or only partially satisfy several important FRs around:

- retrieval budget enforcement
- graceful degradation
- uninitialized repo behavior
- cross-machine reproducibility
- artifact regeneration safety

---

## 3. Critical Gaps to Fix Before Implementation

## 3.1 Retrieval budgets are not truly enforceable

**[STATUS]** Descoped to post-MVP; documented as known limitation in Constraints and Out of Scope.

**Impacted FRs:** FR-3.6, FR-3.7, FR-11.3, FR-11.4

The plan says the agent must respect:

- max memories to load
- max total tokens
- confirmation threshold above N memories

But the actual command surface is:

- `chronicle list`
- `chronicle get <id>`

That means the agent can simply call `get` repeatedly. There is **no deterministic enforcement point** for:

- total loaded memory count
- cumulative token budget

Right now these controls are mostly **instructional**, not **system-enforced**.

### Why this matters

This is not a minor polish issue. Context pollution prevention is one of the central promises of the design. If the system cannot enforce retrieval budgets anywhere, then several FRs are only partially satisfied.

### Recommendation

Add a budget-aware retrieval command, for example:

- `chronicle recall --ids <id...>`
- or `chronicle load --ids '[...]'`

That command should:

- validate `maxMemoriesToPull`
- sum token counts before returning content
- return a structured approval payload if threshold is exceeded
- optionally support `--include-superseded`

This gives you a real enforcement boundary instead of relying only on agent compliance.

---

## 3.2 Uninitialized repo behavior is conflated with initialized-but-empty behavior

**[STATUS]** Addressed in plan — hook now differentiates uninitialized (silent no-op) vs empty DB (empty-store message). Acceptance criteria #17 and #18 added.

**Impacted FRs:** FR-3.10, FR-13.1, FR-13.5

The plan says:

- if no `.chronicle/` is found **or** DB is empty, output minimal JSON with a "No memories" message

That merges two different states:

- **Repo not initialized**
- **Repo initialized, but memory store is empty**

The FRs treat these differently:

- **FR-13.1**: if Chronicle is not initialized, hooks should exit silently and the session should proceed normally with **no memory injection**
- **FR-3.10**: if Chronicle is initialized but has no memories, inject a brief empty-store message

### Why this matters

This is a real behavioral contradiction. The current plan would inject Chronicle context into situations where the system should silently no-op.

### Recommendation

Define hook behavior as:

- **No `.chronicle/` found**
  - exit 0
  - emit no `additionalContext`
  - no Chronicle messaging at all

- **`.chronicle/` exists but zero active memories**
  - exit 0
  - inject a brief "Chronicle initialized; no memories yet" message

---

## 3.3 Copilot hook configuration in the plan does not match current documented formats

**[STATUS]** Addressed in plan — MVP targets VS Code local agent mode only. GitHub cloud hooks added to Out of Scope. Hook schema noted as requiring validation during implementation.

**Impacted FRs:** FR-9.1, FR-9.2, FR-9.3

The plan’s Copilot hook example uses this shape:

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

That is not aligned with the current documented formats I validated:

- **VS Code local agent hooks** use a `hooks` object keyed by event name, e.g. `SessionStart`
- **GitHub/Copilot repository hooks** use a `version: 1` file and lowerCamelCase event names like `sessionStart`, with OS-specific command fields like `bash` / `powershell`

The current plan’s sample does not cleanly match either format.

### Why this matters

This is a concrete implementation risk, not a theoretical one. If you generate the wrong file shape, initialization succeeds but hooks never run.

### Recommendation

Decide explicitly which Copilot target you are supporting in the MVP:

- **VS Code local agent mode**
- **GitHub/Copilot cloud agent hooks**
- or both

Then generate the exact documented schema for that platform.

If supporting both, treat them as separate integration targets, not a single generic "copilot" target.

---

## 3.4 Missing-global-CLI graceful degradation is not actually solved

**[STATUS]** Descoped — plan relies on agent platform error handling; CLI documented as a prerequisite in Constraints; launcher wrappers added to Out of Scope.

**Impacted FRs:** FR-13.2, FR-13.5, FR-14.4

The plan assumes hooks and skills call `chronicle ...` directly.

But FR-13.2 requires that if the CLI is not installed globally, hooks and skills fail gracefully with a clear message and do not crash the session.

With the current design, if the shell cannot resolve `chronicle`, the failure happens **before Chronicle code runs**. In other words, Chronicle itself never gets a chance to produce the graceful error message.

### Why this matters

This is one of the most important operational gaps in the whole design. The current architecture does not fully control the failure mode it promises to handle.

### Recommendation

Generate repo-local launcher wrappers during `init`, for example:

- a small script for Claude
- a small script for Copilot / VS Code

That wrapper should:

- check whether `chronicle` is available
- if not, emit a friendly no-op message or warning in the platform’s expected hook format
- otherwise delegate to `chronicle hook session-start`

This makes graceful degradation actually implementable.

---

## 3.5 `maxSummaryTokens` is overloaded and currently means two different things

**[STATUS]** Addressed in plan — split into `maxMemorySummaryTokens` (per-memory hard cap) and `maxRetrievalTokenBudget` (session total, prompt-level). Config table, custom instructions, and acceptance criteria updated.

**Impacted FRs:** FR-2.8, FR-3.6, FR-8.2

In the FRs, there are two separate concepts:

- **Per-memory summary max** during creation/update
- **Total retrieved summary token budget** during a session

The implementation plan uses a single config key:

- `maxSummaryTokens`

and applies it to both:

- rejecting oversized created memories
- retrieval budget guidance

### Why this matters

These are not the same limit.

Examples:

- A project may want memory summaries capped at 2000 tokens each, but allow 5000 tokens total during retrieval.
- Or it may want 1000-token memories and 3000-token retrieval sessions.

Using one setting for both creates semantic confusion and makes tuning harder.

### Recommendation

Split this into at least two config values:

- `maxMemorySummaryTokens`
- `maxRetrievedSummaryTokens`

---

## 3.6 Initialization and re-initialization semantics are incomplete for managed artifacts

**[STATUS]** Addressed in plan — managed artifact policy defined in init step 4 (markers for MD, overwrite for Chronicle-owned files, structural merge for JSON). YAML frontmatter requirement for Copilot skills added to Section 8. Acceptance criteria #23 covers re-init.

**Impacted FRs:** FR-1.4, FR-1.6, FR-9.3, FR-9.8

The plan handles marker-based idempotency for instruction files, but it does **not fully define** what happens to:

- `SKILL.md` files
- hook JSON files
- generated folders
- locally modified Chronicle-managed artifacts

Questions the plan does not answer:

- If a user edits a generated `SKILL.md`, does re-running `init` overwrite it?
- If the CLI ships updated prompts, how are existing repos upgraded?
- Are skill files fully managed, partially managed, or user-owned after generation?
- Are hook JSON files replaced, merged, or versioned?

There are also two concrete format-level gaps hidden inside this:

- Marker-based replacement works for Markdown, but not for JSON configuration files like `.claude/settings.json`, which need a structural merge and de-duplication strategy.
- Generated Copilot / VS Code `SKILL.md` files need explicit YAML frontmatter (`name`, `description`, and invocation flags) or discovery and slash-command behavior remain ambiguous.

### Why this matters

This is a major lifecycle issue because prompts are a core deliverable. If the update strategy is undefined, prompt evolution becomes brittle and data-loss risk appears during re-init.

### Recommendation

Define a managed-artifact policy explicitly. Example:

- **Managed and replaceable**
  - hook files under a Chronicle-owned filename
  - Chronicle-owned skill directories

- **Managed blocks inside shared files**
  - `CLAUDE.md`
  - `.github/copilot-instructions.md`

- **Never merged blindly**
  - user-authored custom skill edits outside managed markers

You can also add a generated header with a template version for Chronicle-owned files. For JSON config files, the plan should explicitly require structural parse/merge behavior with de-duplication. For Copilot / VS Code skills, the plan should explicitly define the required YAML frontmatter in each generated `SKILL.md`.

---

## 3.7 Git-tracked SQLite plus WAL mode needs a stronger portability story

**[STATUS]** Addressed in plan — WAL dropped; default rollback journal mode used. Single .db file always contains latest state. Gitignore updated to journal file only.

**Impacted FRs:** FR-1.5, FR-1.7, FR-14.2, FR-14.3

The plan intentionally commits `chronicle.db` and ignores `chronicle.db-wal` / `chronicle.db-shm`.

This is not automatically wrong, but it is riskier than the plan currently acknowledges.

SQLite WAL behavior means:

- a COMMIT can exist in the WAL without being written to the main DB yet
- the main DB is usually checkpointed when the last connection closes cleanly
- if cleanup/checkpoint does not happen, the latest committed state may live in the ignored WAL file

### Why this matters

For a version-controlled repo-local database, the Git-tracked file needs to reliably represent the latest durable memory state.

Chronicle may be safe in the happy path because it is a short-lived CLI, but the plan should not depend on "usually safe" when version-control correctness is part of the product value.

### Recommendation

Pick one of these approaches explicitly:

- **Option A: keep WAL, but checkpoint intentionally**
  - checkpoint after write commands
  - possibly `TRUNCATE` after writes or before process exit

- **Option B: do not use WAL for MVP**
  - use default rollback journal mode
  - simpler Git behavior
  - probably sufficient for Chronicle’s low write concurrency

For a personal-side-project MVP, Option B may actually be the more boring and reliable default.

---

## 4. Important Medium-Severity Gaps and Inconsistencies

## 4.1 `chronicle init` agent targeting is inconsistent

**[STATUS]** Addressed in plan — `--agent` flag now supports repeated use (`--agent claude-code --agent copilot`). Epic 3.12 updated.

The plan uses:

- `chronicle init [--agent claude-code|copilot]`

But elsewhere it assumes:

- `--agent both`
- "if `--agent` includes claude-code"
- generation for both agent families in one run

### Recommendation

Make the interface explicit, e.g. either:

- repeated flags: `--agent claude-code --agent copilot`
- or one plural flag: `--agents claude-code,copilot`

Right now the CLI contract is internally inconsistent.

---

## 4.2 The plan contradicts itself on how many skills are generated

**[STATUS]** Addressed in plan — corrected to 5 skills everywhere.

Section 4.1 says `init` creates **4 skills**.

Sections 6 and 8 clearly define **5 skills**:

- `create-memory`
- `create-memory-from`
- `update-memory`
- `list-memories`
- `recall`

This is a doc inconsistency, but it is also an implementation planning risk because scaffolding, tests, and acceptance criteria can drift from each other.

---

## 4.3 `/create-memory-from` ancestry handling conflicts with FR-2.5

**[STATUS]** Addressed in plan — parent_ids now conditional on session state, not source type. Acceptance criteria #24 added.

The plan says `/create-memory-from` memories have **no `parent_ids`**.

That conflicts with FR-2.5, which says:

- if the current session has loaded one or more memories, the new memory must record them as parents

The source material being external files rather than conversation does not erase the fact that the session may still have been informed by prior Chronicle memories.

### Recommendation

Make ancestry conditional on session state, not on source type.

---

## 4.4 Prompt limits are not aligned with config limits

**[STATUS]** Addressed in plan — config split into two keys; title capped at 160 chars, description at 600 chars; skill prompts now instruct the agent to read limits from `config.json` instead of hardcoding.

The skill guidance says summary should be **max ~2000 tokens**, while config default uses **5000**.

That is not automatically fatal, but it creates unclear semantics:

- Is 2000 the true intended design target?
- Is 5000 just an emergency upper bound?
- Should per-project config changes flow into generated skills?

The same misalignment appears in field-size validation. The plan currently allows a 500-character title and a 2000-character description, which is difficult to reconcile with a 5-10 word title, a 2-3 sentence description, and a lightweight catalog injected into most new sessions.

### Recommendation

Separate:

- **target summary size** for prompt guidance
- **hard summary max** for CLI validation
- **tight hard caps for title and description** to preserve catalog lightness

Then template those values into generated artifacts so config and prompts do not drift. A reasonable MVP range is roughly 120-160 characters for the title and 400-600 characters for the description.

---

## 4.5 Catalog truncation and older-entry discovery are under-specified

**[STATUS]** Addressed in plan — hook output now shows total count and truncation signal (e.g., "showing 5 of 12 active memories") with explicit browse instruction. Acceptance criteria #19 added.

FR-3.9 says the catalog must be limited to a configurable maximum number of entries, but the agent must still be able to request older entries if needed.

The current plan supports `chronicle list --limit --offset`, but the hook output does not clearly indicate:

- total active memory count
- whether the injected catalog is truncated
- how the agent should continue browsing older entries

Without that signal, the agent may reasonably assume the injected catalog is the complete set.

### Recommendation

The session-start output should include:

- total active memory count
- shown count
- an explicit note when older entries exist
- an explicit instruction to run `chronicle list --offset <N> --limit <N>` if the current page seems insufficient

---

## 4.6 `chronicle search` risks undermining the intended retrieval model

**[STATUS]** Descoped entirely — `chronicle search` and FTS5 removed from MVP. Catalog-first retrieval is the sole model. Search added to Out of Scope.

The FRs emphasize that retrieval decisions should be made by reasoning over the **catalog** of titles/descriptions.

The plan also exposes `chronicle search --query` in the always-on instructions.

That means the agent may bypass the catalog-first design and keyword-search summaries instead.

This does not violate the no-embeddings principle, but it **does dilute the architecture**:

- catalog-first reasoning is the core retrieval innovation
- full-text search over summaries is a different retrieval mode

There is also a lower-level semantics issue: SQLite FTS5 `MATCH` queries are not equivalent to plain keyword search. Parameter binding prevents SQL injection, but raw user queries can still produce parse surprises or confusing results if search behavior is not normalized and documented.

### Recommendation

Treat `search` as:

- a manual user/developer tool
- an advanced fallback
- not the default session-start retrieval path
- and define whether MVP search is simple normalized keyword search or advanced FTS syntax

---

## 4.7 Referential integrity rules are missing

**[STATUS]** Addressed in plan — supersede rejects self-supersession and cycles; delete warns on referenced memories and requires `--force`. Acceptance criteria #20 and #21 added.

The schema is intentionally light, but the plan does not define behavior for:

- self-supersession
- supersession cycles
- deleting a memory referenced as a parent by another memory
- deleting a memory that is the target of `superseded_by_id`

### Why this matters

Even in an MVP, these are easy ways to create broken knowledge graphs.

### Recommendation

At minimum, add CLI validation rules:

- cannot supersede a memory with itself
- cannot create a supersession cycle
- deletion should warn or block if the memory is still referenced

---

## 4.8 `chronicle init` repo-root behavior is under-specified

**[STATUS]** Addressed in plan — init walks up to Git repo root; fails with clear error if not inside a Git repo. Acceptance criteria #22 added.

Chronicle is explicitly **repo-scoped**, but the plan does not clearly define whether `chronicle init`:

- must be run from repo root
- walks up to the repo root automatically
- refuses to initialize outside a Git repo

This matters because the generated paths are root-relative:

- `.chronicle/`
- `.claude/`
- `.github/`
- `.gitignore`

### Recommendation

Make `init` walk up to the Git repo root, or fail clearly if no repo root is found.

---

## 4.9 FR traceability in the plan has some incorrect references

**[STATUS]** Addressed in plan — FR-7.6 references corrected to FR-7 in tasks and acceptance criteria.

Examples:

- `chronicle get` is labeled `FR-7.6`, but FR-7 only goes through `FR-7.5`
- `search` acceptance refers to `FR-7.5`, which is actually the single-memory retrieval requirement
- Acceptance criteria also reference `FR-7.6`

This does not change product behavior, but it weakens the plan as an execution document.

---

## 4.10 Acceptance criteria do not cover several important FRs

**[STATUS]** Addressed in plan — 12 new acceptance criteria (#17-#28) added covering: silent no-op, empty-store, truncation, supersede integrity, delete warnings, re-init, ancestry, confirmation threshold, include-superseded, coexistence, and prompt-evaluation golden path.

The acceptance section is good, but incomplete.

Notably under-covered or missing:

- `/create-memory-from` end-to-end acceptance
- catalog truncation / older-entry discovery behavior
- retrieval confirmation threshold behavior
- `include-superseded` behavior
- uninitialized repo silent no-op behavior
- missing global CLI behavior
- managed artifact re-init behavior
- deletion of referenced memories
- coexistence with built-in memory systems
- prompt-evaluation scenarios for memory generation and retrieval quality

Because prompt quality is a core deliverable, the plan should include a small golden scenario set for description writing, retrieval precision/recall, ancestry decisions, and conflict handling — not just manual spot checks.

### Recommendation

Expand the acceptance suite before implementation begins. Otherwise the highest-risk areas will be left to ad hoc manual validation.

---

## 5. Requirement Ambiguities Still Present

## 5.1 Team-shareable vs personal-lightweight is still a strategic tension

**[STATUS]** Addressed in plan — Constraints section explicitly states "Single-user optimized" with caveat that team sharing is possible but not guaranteed.

The docs say both:

- Chronicle is version-controlled and team-shareable
- this is primarily for personal use and should stay lightweight

Those are not fully aligned when the storage medium is a binary SQLite DB committed to Git.

### Interpretation

This is fine if the real target is:

- single user
- maybe one or two machines
- occasional sharing

It is much less convincing if the real target is active multi-developer shared editing of memories.

### Recommendation

State this explicitly in the plan:

- SQLite-in-Git is optimized for **single-user / low-contention** usage in the MVP
- team sharing is possible, but not a primary collaboration workflow guarantee

---

## 5.2 The role of raw transcript export has shifted, but the docs do not say so explicitly

**[STATUS]** Addressed in plan — Constraints section states "Memory quality depends on host agent context" and Out of Scope lists "Transcript export / session archival."

The initial idea starts from transcript export and transcript analysis.

The FRs and plan shift the MVP toward:

- agent analyzes current context directly
- no transcript archival in the MVP

That simplification is good for scope, but it should be named explicitly as a product decision because it changes:

- auditability
- re-analysis options
- cross-session reproducibility

Relatedly, FR-2.2 and FR-4.2 assume the agent can analyze the "full conversation." Without transcript export in the MVP, that is really an operational assumption that the host agent still retains the relevant session context. If compaction or earlier context loss has already occurred, memory quality may degrade.

### Recommendation

State this limitation explicitly in the plan so the MVP behavior is honest about what it can and cannot guarantee.

---

## 5.3 Timestamp format is unspecified

**[STATUS]** Addressed in plan — design notes specify UTC ISO 8601 (`new Date().toISOString()`).

The schema stores timestamps as `TEXT`, but the plan does not specify format.

### Recommendation

Use UTC ISO 8601 consistently.

---

## 5.4 FR numbering skips FR-12

**[STATUS]** Not addressed — this is a documentation issue in the FRs document, not the implementation plan. No action needed in the plan.

This is not a product issue, but it is a documentation hygiene issue and can create confusion later if you keep referencing FR numbers throughout implementation and testing.

---

## 6. Tech Choice Review

## 6.1 `better-sqlite3` as a globally installed native dependency is a medium risk on Windows

**[STATUS]** Addressed in plan — Constraints section includes "Native dependency risk" note recommending early Windows validation in Epic 1.

This is not necessarily a blocker, but it is worth calling out:

- `better-sqlite3` is a native dependency
- global npm installs are more fragile than pure JS packages
- Windows is usually the first place where global native-module install friction appears

### Recommendation

Validate install flow on Windows early.

If install friction appears, that will affect the entire product experience because hooks depend on the binary being available everywhere.

---

## 6.2 WAL mode is a questionable default for a Git-tracked database

**[STATUS]** Addressed in plan — WAL dropped; default rollback journal mode used. (Same resolution as gap 3.7.)

WAL is good technology, but it is not obviously the best fit here.

Chronicle is not a high-write, concurrent transactional service. It is a small local knowledge store.

That means the WAL benefits may be less valuable than:

- a single-file Git story
- simpler portability assumptions
- lower surprise factor

### Recommendation

Either:

- switch the MVP default away from WAL
- or keep WAL only with explicit checkpoint discipline

---

## 6.3 `Math.ceil(text.length / 4)` is acceptable as an estimate, but weak as a hard gate

**[STATUS]** Addressed in plan — design notes explicitly describe it as an "estimate with documented safety margin — not a precise token measurement."

For:

- display
- rough budgeting
- ordering

this heuristic is fine.

For:

- **hard failure** during memory creation
- **strict retrieval budget enforcement**

it is much less convincing, because the FRs use the language of token budgets while the implementation uses a very rough character heuristic.

### Recommendation

If you want to keep zero tokenizer dependencies, use the heuristic as:

- an estimate
- with documented safety margin

Do not present it as if it were a precise token measurement.

---

## 6.4 Global CLI only creates version-skew risk across machines

**[STATUS]** Addressed in plan — `chronicleVersion` field added to `config.json`, set by `chronicle init` to the installed CLI version. Enables future migration tooling and version-skew detection.

The repo contains:
 
- DB
- config
- generated instructions
- generated skills
 
But the actual behavior still depends on **whatever global Chronicle version is installed on that machine**.

That creates a reproducibility gap for a project that values version-controlled knowledge artifacts.

### Recommendation
At minimum, consider storing:

- a Chronicle template version
- a minimum supported CLI version

inside the repo-managed config or metadata.

---

## 7. Recommended Design Adjustments

If you want the smallest set of changes that would materially strengthen the plan, I would do these before implementation:

### 7.1 Add a budget-aware recall command

**[STATUS]** Descoped to post-MVP; documented in Constraints and Out of Scope.

- `chronicle recall --ids '[...]'`
- Enforce count and total token budget
- Support approval flow payloads
- Keep `get` as raw low-level access if needed

### 7.2 Split token config into separate concerns

**[STATUS]** Addressed in plan.

- `maxMemorySummaryTokens`
- `maxRetrievedSummaryTokens`
- `targetMemorySummaryTokens`

### 7.3 Differentiate hook states cleanly

**[STATUS]** Addressed in plan.

- no-op for uninitialized repo
- empty-store message only for initialized repo with zero memories

### 7.4 Fix agent target model in `init`

**[STATUS]** Addressed in plan.

- explicit multi-agent syntax
- explicit distinction between VS Code Copilot hooks and GitHub/Copilot hook variants

### 7.5 Define managed artifact policy

**[STATUS]** Addressed in plan — init step 4 defines full policy; YAML frontmatter for Copilot skills noted in Section 8.

- which generated files are fully Chronicle-owned
- which files use managed marker blocks
- what happens on re-init if user edited generated files
- structural JSON merge and de-duplication rules for `.claude/settings.json` and other JSON hook files
- required YAML frontmatter for Copilot / VS Code `SKILL.md` templates

### 7.6 Add repo-local launchers for graceful degradation

**[STATUS]** Descoped; documented in Constraints and Out of Scope.

- wrapper script checks CLI availability
- wrapper emits platform-correct hook output

### 7.7 Revisit WAL for MVP

**[STATUS]** Addressed in plan — WAL dropped.

- either remove it
- or checkpoint explicitly after writes

### 7.8 Add integrity validation rules

**[STATUS]** Addressed in plan.

- no self-supersede
- no cycles
- delete warnings for referenced memories
- UTC ISO timestamps

### 7.9 Narrow `search` to a non-default retrieval path

**[STATUS]** Descoped entirely — search removed from MVP.

- keep it available
- do not make it the primary session-start strategy
- and define whether MVP search is simple normalized keyword search or advanced FTS syntax

### 7.10 Expand acceptance coverage

**[STATUS]** Addressed in plan — 12 new acceptance criteria added (#17-#28).

Add explicit tests for:

- `/create-memory-from`
- catalog truncation / older-entry discovery behavior
- confirmation threshold behavior
- `include-superseded`
- missing CLI binary
- silent no-op when not initialized
- re-init behavior for generated skills/hooks
- ancestry behavior for brownfield creation
- prompt-evaluation scenarios for memory generation and retrieval quality
