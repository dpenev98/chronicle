# Chronicle — Functional Requirements

## 1. Overview

**Chronicle** is a project-scoped, local memory layer that gives AI coding agents persistent memory across sessions. It lives inside the repository (version-controlled and team-shareable), allowing agents to recall knowledge, decisions, and context from prior sessions without manual documentation effort.

### Problem

AI coding agents (Claude Code, GitHub Copilot, Codex, OpenCode, etc.) lose all context when a session ends. Knowledge gained during a session — architectural decisions, debugging insights, implementation state, learned patterns — vanishes entirely. Starting a new session means starting from zero. The developer can manually document session outcomes and feed them back, but this is tedious, unscalable, and quickly becomes stale.

### Solution

Chronicle provides:

- **Memory creation**: The ability to capture and persist structured knowledge from a coding agent session
- **Memory retrieval**: The ability for a fresh agent session to autonomously discover and load relevant memories from prior sessions
- **Memory management**: The ability to update, supersede, and organize memories over time

All intelligence (summarization, relevance decisions) is delegated to the coding agent itself — Chronicle provides the storage, retrieval interface, and the instructional framework that guides agents in creating and consuming memories.

---

## 2. Core Concepts

### Memory

A **memory** is a structured record of knowledge gained during one or more coding agent sessions. It consists of:

- **Title**: A concise label (5-10 words) capturing the session's primary topic or accomplishment
- **Description**: A 2-3 sentence signal that clearly communicates WHEN and WHY this memory should be retrieved. This is the primary input for relevance decisions — it must give a future agent enough information to determine if this memory is useful for its current task
- **Summary**: A structured report containing the session's goals, decisions, implementation details, learnings, current state, and next steps. This is the full knowledge payload that gets injected into an agent's context when the memory is loaded
- **Metadata**: Creation timestamp, update timestamp, originating agent, knowledge ancestry, and staleness markers

### Memory Catalog

The **catalog** is the lightweight index of all active memories — just titles, descriptions, and approximate sizes. It is injected into the agent's context at session start, allowing the agent to scan available knowledge without loading full memory content.

### Knowledge Ancestry

When a session loads one or more existing memories and then creates a new memory, the new memory records which prior memories informed it. This creates a lineage chain that tracks how knowledge evolves across sessions.

### Memory Supersession

When a memory becomes outdated (e.g., a technology migration invalidates earlier decisions), it can be marked as superseded by a newer memory. Superseded memories are hidden from the default catalog, preventing agents from consuming stale information.

---

## 3. Functional Requirements

### FR-1: Project Initialization

**FR-1.1**: A developer must be able to initialize Chronicle in any software repository with a single command.

**FR-1.2**: Initialization must create all necessary storage, configuration, and agent integration artifacts within the repository.

**FR-1.3**: Initialization must support targeting specific coding agents (Claude Code, GitHub Copilot).

**FR-1.4**: Initialization must not overwrite or break existing agent configuration files — it must append or merge.

**FR-1.5**: After initialization, the repository's Chronicle data must be committable to version control, making memories shareable across machines and team members.

**FR-1.6**: Initialization must be idempotent — running it on an already-initialized repository must not destroy existing memories or configuration. It should detect the existing installation, apply any necessary schema migrations, and regenerate or update agent integration artifacts without data loss.

**FR-1.7**: Initialization must configure version control ignore rules (e.g., `.gitignore`) so that transient database files (write-ahead logs, shared memory files) are excluded from commits while the primary database and configuration files are tracked.

---

### FR-2: Memory Creation

**FR-2.1**: A developer must be able to trigger memory creation explicitly during an agent session (e.g., via a slash command like `/create-memory`).

**FR-2.2**: When memory creation is triggered, the coding agent must analyze the full conversation context of the current session and generate a structured memory entry containing title, description, and summary.

**FR-2.3**: The summary must follow a defined structured format with the following sections (empty sections may be omitted):
- **Goals**: What the session was trying to achieve
- **Decisions**: Key architectural or design decisions made, including rationale
- **Implementation**: What was built or changed, including specific file paths and component names
- **Learnings**: Insights, gotchas, and patterns discovered
- **Current State**: Where things stand at the end of the session
- **Next Steps**: Explicit follow-up tasks or open questions

**FR-2.4**: The description field is the **most critical field in the entire system** — it is the primary input for the agent's relevance decision during retrieval. It must be written as a retrieval signal: containing enough domain terms, technology names, component names, and contextual keywords that a future agent can determine relevance by reading the description alone, without loading the full summary. The quality of this field directly determines the quality of memory retrieval across the entire system. Agent instructions must emphasize this and provide clear guidance on writing effective descriptions.

**FR-2.5**: If the current session has loaded one or more existing memories, the newly created memory must record those memories as its parents (knowledge ancestry).

**FR-2.6**: The system must record which coding agent created the memory.

**FR-2.7**: The system must compute and store an approximate token count for the summary to support budget calculations during retrieval.

**FR-2.8**: Memory creation must fail with a clear error if the summary exceeds the configured maximum token limit, prompting the agent to condense.

**FR-2.9**: The storage interface must accept large text fields (summary, description) via standard input or file reference, not solely via command-line arguments, to avoid platform-specific command-line length limitations (e.g., Windows shell limits).

**FR-2.10**: A developer must be able to create memories from arbitrary text sources — files, documentation, architecture decisions, README content, or any other existing project artifacts — not only from conversation context. This supports brownfield adoption where a project already has valuable knowledge that was never captured in an agent session. A separate skill (`/create-memory-from`) must instruct the agent to analyze provided file paths or pasted text and generate a structured memory from that content, following the same format and quality standards as conversation-based memories.

---

### FR-3: Memory Retrieval

**FR-3.1**: When a new coding agent session starts, the system must automatically inject the memory catalog (titles, descriptions, and token counts of all active memories) into the agent's context.

**FR-3.2**: The injected catalog must include instructions that guide the agent on how to evaluate and load relevant memories.

**FR-3.3**: When the agent receives the user's first message, it must evaluate the memory catalog against the user's request and determine which memories (if any) are relevant.

**FR-3.4**: The relevance decision must be made by the agent's own reasoning capabilities — no embedding-based or similarity-search mechanisms are used. The agent reads the titles and descriptions and applies its judgment.

**FR-3.5**: If the agent determines one or more memories are relevant, it must be able to load the full memory content (title, description, and summary) by requesting specific memories by their identifier.

**FR-3.6**: The agent must respect configured budget limits when loading memories:
- **Maximum number of memories** that can be loaded in a single session
- **Maximum total tokens** across all loaded memory summaries

**FR-3.7**: If the agent wants to load more memories than the configured confirmation threshold, it must ask the user for approval before proceeding, showing the list of memories and their estimated token costs.

**FR-3.8**: The catalog must exclude superseded memories by default, showing only active memories.

**FR-3.9**: The catalog must be limited to a configurable maximum number of entries, ordered by most recently created. The agent must be able to request older entries if needed.

**FR-3.10**: If no memories exist for the project, the system must inject a brief notification indicating an empty memory store and proceed normally.

---

### FR-4: Memory Update

**FR-4.1**: A developer must be able to trigger an update to an existing memory during the same session that created it (e.g., after continuing work and gaining new knowledge).

**FR-4.2**: When updating, the agent must re-analyze the full current conversation context, compare it with the existing memory, and generate updated fields that reflect the new state of knowledge.

**FR-4.3**: Partial updates must be supported — only the fields that have changed need to be provided.

**FR-4.4**: The update must refresh the token count and the last-updated timestamp.

**FR-4.5**: Previous versions of a memory are preserved through the repository's version control history (no in-application versioning needed).

---

### FR-5: Memory Supersession (Cross-Session Staleness)

**FR-5.1**: A developer (or agent) must be able to mark an existing memory as superseded by a newer memory.

**FR-5.2**: A superseded memory must be excluded from the default catalog but remain queryable when explicitly requested (e.g., via an "include superseded" flag).

**FR-5.3**: The supersession relationship must be recorded as a forward pointer on the old memory, indicating which newer memory replaces it.

**FR-5.4**: The typical cross-session update flow is:
1. Agent loads old memory A in a new session
2. Agent (or user) determines A is outdated
3. Agent creates new memory C with corrected/updated information
4. Agent marks A as superseded by C

---

### FR-6: Memory Deletion

**FR-6.1**: A developer must be able to permanently delete a memory.

**FR-6.2**: Deletion must require explicit confirmation in interactive mode to prevent accidental data loss, with a force option for scripted use.

---

### FR-7: Memory Search and Listing

**FR-7.1**: A developer or agent must be able to list all active (non-superseded) memories with their titles, descriptions, token counts, and creation dates.

**FR-7.2**: Listing must support multiple output formats (human-readable table and machine-readable JSON).

**FR-7.3**: Listing must support pagination (limit and offset) for repositories with many memories.

**FR-7.4**: A developer or agent must be able to search memories by keyword across titles, descriptions, and summaries.

**FR-7.5**: A developer or agent must be able to retrieve a single memory's full content by its identifier.

---

### FR-8: Configuration

**FR-8.1**: Each initialized project must have a configuration file that controls Chronicle's behavior.

**FR-8.2**: The following settings must be configurable:

| Setting | Purpose |
|---------|---------|
| Maximum memories to pull | Hard ceiling on memories loaded per session |
| Maximum summary tokens | Total token budget for injected memories per session |
| Confirmation threshold | Number of memories above which user approval is required |
| Maximum catalog entries | How many memories appear in the session-start catalog |

**FR-8.3**: Configuration must have sensible defaults so that Chronicle works out of the box after initialization.

---

### FR-9: Agent Integration

**FR-9.1**: Chronicle must integrate with Claude Code and GitHub Copilot (VS Code agent mode) for the MVP.

**FR-9.2**: Integration must use each agent's native extension mechanisms:
- **Hooks**: For automatic catalog injection at session start
- **Skills / Slash Commands**: For user-triggered memory operations (`/create-memory`, `/create-memory-from`, `/update-memory`, `/list-memories`, `/recall`)
- **Custom Instructions**: For guiding the agent's retrieval decision logic and memory generation behavior

**FR-9.3**: The integration artifacts (hooks, skills, instructions) must be generated automatically during project initialization.

**FR-9.4**: Skills must provide the agent with complete, structured instructions on:
- How to analyze a session and generate each memory field
- How to analyze external text sources (files, docs, pasted text) and generate each memory field
- The exact structured format for the summary
- How to determine knowledge ancestry (parent memories)
- How to interact with the storage layer

**FR-9.5**: Custom instructions must guide the agent on:
- When and how to evaluate the memory catalog
- How to make relevance decisions
- How to handle conflicting memories (prefer most recent, flag conflict)
- Budget limits and confirmation requirements
- **Verify before trusting**: After loading a memory, if it references specific files, implementations, or configurations, the agent should spot-check that those artifacts still exist and contain what the memory describes before relying on the memory's claims. This mitigates drift caused by manual developer changes made outside agent sessions.

**FR-9.6**: The catalog injection at session start must complete quickly (< 5 seconds) to avoid delaying the session.

**FR-9.7**: Future agent support (Codex, OpenCode, Gemini CLI) must be achievable without changes to the core storage or memory model — only new integration artifacts (hooks, skills, instructions) should be needed.

**FR-9.8**: The system prompts and instruction templates that guide agents in memory creation and retrieval decisions are a **core deliverable**, not boilerplate. They must be carefully designed, iterable, and stored as versioned artifacts within the project. Prompt quality directly determines the quality of generated memories and retrieval accuracy. Specifically:
- The memory creation prompt must produce consistently high-quality descriptions that serve as effective retrieval signals
- The retrieval decision prompt must guide the agent to make accurate relevance judgments from titles and descriptions alone
- Prompts should be tunable per-project if needed (future consideration)

**FR-9.9**: Chronicle must coexist with built-in agent memory systems (GitHub Copilot Memory, Claude Memory / CLAUDE.md) without conflict or duplication. Chronicle serves a distinct purpose — structured, version-controlled, project-scoped knowledge — and agent instructions must make this distinction clear so the agent does not confuse Chronicle memories with its own built-in memory mechanisms.

---

### FR-10: Memory Conflict Resolution

**FR-10.1**: When an agent loads multiple memories that contain contradictory information, the agent must prefer the most recently created memory.

**FR-10.2**: The agent must flag the conflict to the user, identifying which memories disagree and what the contradiction is.

**FR-10.3**: The supersession mechanism (FR-5) provides the explicit resolution path — the user or agent can supersede the outdated memory.

---

### FR-11: Context Pollution Prevention

**FR-11.1**: The memory catalog injected at session start must be as lightweight as possible — titles, descriptions, and token counts only. Full summaries are never injected automatically.

**FR-11.2**: Full memory content is only loaded when the agent explicitly requests it after making a relevance decision.

**FR-11.3**: The system must enforce configurable limits on:
- How many memories can be in the catalog
- How many memories can be loaded per session
- How many total tokens of memory content can be injected

**FR-11.4**: Above a configurable threshold, the agent must pause and ask the user before loading memories.

**FR-11.5**: If no memories are relevant to the current session, zero additional context should be loaded (beyond the catalog itself).

---

### FR-13: Graceful Degradation and Error Handling

**FR-13.1**: If Chronicle is not initialized in the current repository, session-start hooks must exit silently without errors, and the agent session must proceed normally with no memory injection.

**FR-13.2**: If the Chronicle CLI is not installed globally, hooks and skills that reference it must fail gracefully with a clear message to the user, not crash the agent session.

**FR-13.3**: If the database is corrupted or unreadable, CLI commands must return meaningful error messages that allow the agent to report the issue to the user rather than producing cryptic failures.

**FR-13.4**: If the agent produces malformed input (e.g., missing required fields, invalid JSON), the CLI must validate all inputs and return structured error messages that the agent can interpret and correct.

**FR-13.5**: The system should degrade gracefully under all failure modes — a broken Chronicle installation must never prevent normal agent operation. Memory is an enhancement, not a prerequisite.

---

### FR-14: Version Control and Portability

**FR-14.1**: All Chronicle data (storage, configuration) must live within the repository directory structure.

**FR-14.2**: Chronicle data must be committable to Git and shareable across clones of the repository.

**FR-14.3**: Chronicle must function as a fully local solution — no cloud services, external APIs, or network dependencies.

**FR-14.4**: Chronicle must be installable once and usable across any number of repositories — each repository maintains its own independent memory store.

---

## 4. User Flows

### Flow A: First-Time Setup

1. Developer installs Chronicle globally
2. Developer navigates to a repository and runs the initialization command
3. Chronicle creates its storage directory, database, configuration, and agent integration files
4. Developer commits the Chronicle artifacts to version control
5. Chronicle is now active for all future agent sessions in this repository

### Flow B: Creating a Memory

1. Developer works with a coding agent on a task (e.g., implementing an auth module)
2. At the end of the session (or at a meaningful checkpoint), the developer triggers `/create-memory`
3. The agent analyzes the full conversation and generates a structured memory with title, description, and summary
4. The memory is stored persistently in the project's memory store
5. The agent confirms the memory was saved and reports the identifier

### Flow C: Automatic Memory Retrieval in a New Session

1. Developer starts a new coding agent session in the same repository
2. The system automatically injects the memory catalog into the session context
3. The developer types their request (e.g., "Add rate limiting to the auth endpoints")
4. The agent reads the catalog and determines that a prior memory about auth implementation is relevant
5. The agent loads the full memory and gains context about prior auth decisions, file locations, and patterns
6. The agent proceeds with the task, informed by the prior session's knowledge

### Flow D: Updating a Memory (Same Session)

1. Developer created a memory earlier in the current session
2. Developer continues working and gains significant new knowledge
3. Developer triggers `/update-memory <id>`
4. The agent re-analyzes the full conversation, compares with the existing memory, and generates updated content
5. The memory is overwritten with the updated version

### Flow E: Superseding an Outdated Memory

1. The agent has loaded an existing memory about the project's database strategy (either in the current session or a new one)
2. During the session, the developer and agent decide to migrate from Prisma to Drizzle
3. The developer triggers `/create-memory` — the agent creates a new memory capturing the migration decision and receives the new memory's ID
4. The agent or developer should then be able to mark the old memory as replaced
5. Future sessions will only see the new memory in the catalog

### Flow G: Creating a Memory from Existing Artifacts (Brownfield)

1. Developer onboards Chronicle into an existing project that already has architecture docs, READMEs, or design decisions
2. Developer triggers `/create-memory-from @docs/architecture.md @docs/api-design.md` (or pastes text directly)
3. The agent reads the referenced files or pasted content
4. The agent generates a structured memory (title, description, summary) based on the source material, following the same quality standards as conversation-based memories
5. The memory is stored and available for future session retrieval

### Flow F: Memory Retrieval with Budget Controls

1. A new session starts; the catalog shows 8 potentially relevant memories
2. The agent evaluates the user's request and determines 4 memories are relevant
3. Since 4 exceeds the configured confirmation threshold (3), the agent pauses and presents the list:
   - "I'd like to load these memories: [list with token estimates]. Total: ~3500 tokens. Proceed?"
4. The developer approves (or selects a subset)
5. The agent loads the approved memories and continues

---

## 5. Out of Scope (MVP)

The following capabilities are excluded from the initial version. Items marked with *(future)* have a planned path forward in Section 6.

- **Automatic memory creation on context compaction** *(future — see #2)*: No auto-save when the agent's context window fills up. The developer must explicitly trigger memory creation.
- **Semantic search / vector embeddings** *(future — see #1)*: Memory retrieval is based on the agent's reasoning over titles and descriptions, not embedding similarity.
- **Direct LLM calls** *(future)*: Chronicle makes no API calls to any language model. All intelligence is delegated to the host coding agent. If sub-agent delegation proves insufficient, direct LLM calls may be introduced in a future iteration.
- **File system mirroring**: Memories are not exported as individual files. The database is the single source of truth.
- **Additional agent support** *(future)*: Only Claude Code and GitHub Copilot are supported initially. Codex, OpenCode, and Gemini CLI support is deferred but achievable without core changes (FR-9.7).
- **Memory analytics**: No dashboards, usage tracking, or memory health reports.
- **Memory merge/consolidation** *(future — see #13)*: No automated combining of related memories. May be addressed as part of the deep memory reconciliation flow.
- **Multi-repository memory sharing**: Each repository has an independent, isolated memory store.
- **Enterprise features**: No multi-user access control, secrets auditing, or branch-scoped memories.

---

## 6. Future Considerations

These items are not requirements but represent potential future directions that the design should not preclude:

1. **Hybrid retrieval via qmd**: Integrating semantic search using [qmd](https://github.com/tobi/qmd) — a hybrid semantic + BM25 + reranked retrieval engine built on SQLite with local embeddings. This is the most promising upgrade path if reasoning-based retrieval proves insufficient at scale. It could supplement or replace the LLM-based relevance decision for the catalog filtering step.
2. **Pre-compaction session snapshots**: A richer model than simple auto-save — during long sessions with multiple context compactions, each compaction creates a lightweight snapshot. When the user finally triggers `/create-memory`, all accumulated snapshots plus the current context are synthesized into a single coherent memory. This prevents knowledge loss during sessions that exceed the context window multiple times.
3. **Memory decay / priority**: Reducing the catalog prominence of memories that are old and never retrieved. Potential mechanisms: retrieval counters, last-accessed timestamps, automatic deprioritization after N sessions without retrieval.
4. **MCP server interface**: Exposing Chronicle as a Model Context Protocol server, giving agents native tool access without shell execution. This could replace the CLI invocation pattern entirely and provide a cleaner integration surface.
5. **Transcript archival**: Storing or referencing raw session transcripts (e.g., Claude Code's JSONL transcript files) alongside memories for full audit trails and potential re-analysis.
6. **File system export**: Dumping memories as individual markdown files for easier human reading and Git diffing. A `chronicle export` command that writes each memory as a `.md` file in `.chronicle/memories/`.
7. **Memory graph**: Richer cross-referencing beyond parent-child chains (e.g., "related to", "contradicts", "extends") enabling the agent to traverse knowledge relationships.
8. **Agent-initiated memory creation**: The agent autonomously detects that a session contains valuable knowledge and suggests creating a memory, without the user explicitly triggering `/create-memory`. Could be implemented via a Stop/SessionEnd hook that evaluates session significance.
9. **Memory types and templates**: Formal categorization of memories with type-specific summary templates (e.g., "architecture-decision" template with ADR-like fields, "bug-fix" template with root cause and resolution, "research" template with findings and trade-offs). This could improve both generation quality and retrieval precision.
10. **Bulk operations and status dashboard**: `chronicle export` (dump all), `chronicle import` (load from file), `chronicle status` (stats: memory count, total tokens, age distribution, most/least retrieved), `chronicle gc` (garbage-collect orphaned or very old superseded memories).
11. **Per-project prompt tuning**: Allowing projects to override the default memory creation and retrieval prompts with project-specific versions for different domains or team conventions.
12. **Git diff memory audit (`/audit-memories`)**: A dedicated skill that the developer triggers after making manual code changes (or periodically) to detect memory drift. The flow: (1) agent runs `git diff` against a configurable base (default: `main`) to extract changed files, (2) pulls the memory catalog via `chronicle list`, (3) for each memory, analyzes whether changed files overlap with or invalidate the memory's content, (4) produces a report recommending which memories are still valid, potentially stale, should be superseded, or should be created, (5) developer reviews and approves actions. Enforcement options include a git pre-push hook reminder or a CI check. Scoped to the git diff (not the entire codebase), keeping it bounded and practical.
13. **Deep memory reconciliation**: A comprehensive, expensive "self-healing" flow that can be run periodically (e.g., weekly) to reconcile the entire memory store against the current codebase state. Unlike the targeted `/audit-memories` (which works on a bounded git diff), this spins up sub-agents to perform a deep exploration of the full codebase and a full analysis of all stored memories, then reconciles the two — updating, superseding, deleting, or creating memories as needed. This addresses accumulated drift over many commits and is complementary to the git diff audit. Due to its token cost and complexity, it should be an explicit manual operation, not automated.

### Reference Implementations

The following projects may provide useful implementation patterns for future iterations:
- [omega-memory](https://github.com/omega-memory/omega-memory) — Closest existing solution to Chronicle's concept. Open source but cloud-gated. Worth studying for memory schema and retrieval patterns.
- [everything-claude-code hooks](https://github.com/affaan-m/everything-claude-code/tree/main/scripts/hooks) — Curated Claude Code integrations with session summarization and injection patterns relevant to Chronicle's hook mechanisms.
- [OpenViking](https://github.com/volcengine/OpenViking) — File-system-based context database for agents. Alternative storage pattern to consider if SQLite limitations are hit.
