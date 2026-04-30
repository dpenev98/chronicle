---
name: chronicle-memory
description: Use this skill when the user wants to browse the Chronicle memory catalog, load prior project context, save durable learnings from the current session, create memories from existing docs or pasted source material, or update an outdated Chronicle memory, even if they ask in terms of preserving context, recalling past decisions, or documenting what changed rather than mentioning Chronicle explicitly.
license: Apache-2.0
---
<!-- This file is managed by Chronicle. Re-running `chronicle init` may overwrite local changes. -->

# /chronicle-memory

Use this skill for Chronicle memory work only: browse the catalog, recall prior context, create durable memories, create memories from existing project artifacts, or update stale memories.

## Default workflow

1. Pick one primary path first: browse, recall, create from session, create from source material, or update.
2. Read `.chronicle/config.json` before any action that depends on retrieval budgets or summary-size limits.
3. Prefer the smallest useful action: browse before recall, recall before update, update before creating a replacement memory when the existing one is still mostly correct.
4. Use Chronicle CLI commands directly. For create and update, default to `--stdin` JSON payloads.

## Workflow checklist

Progress:
- [ ] Identify the correct path for the current task
- [ ] Read config if limits or summary size matter
- [ ] Collect any memory IDs that influence the result
- [ ] Run the Chronicle command for the chosen path
- [ ] Validate the result before finishing

## Gotchas

- The description is the primary retrieval signal. Write it so a future agent can decide relevance without loading the full summary.
- Do not load memories speculatively. Start from titles and descriptions and pull only the IDs that you deem most relevant.
- If loaded memories influenced a new memory, record those IDs in `parentIds`.
- For create-from-source workflows, treat the supplied files or pasted text as the source of truth, not the conversation history.
- After recalling a memory, verify any referenced files, implementations, or configuration before relying on it. The repo may have changed.
- When updating, preserve still-correct content. Do not rewrite a memory from scratch unless the old one is no longer trustworthy.

## Summary template

Read [references/memory-template.md](references/memory-template.md) before creating a new memory or rewriting a summary.
Treat it as a fill-in output format: keep the section order, replace the placeholder bullets with session-specific facts, and keep the result concise.

## Browse catalog

Default when you need to inspect available memories before choosing specific IDs.

1. Run `chronicle list --format table`.
2. Review titles, descriptions, token counts, and timestamps.
3. If the catalog is truncated, page with `--offset` and `--limit`.
4. Switch to recall only after specific IDs look relevant.

Command pattern:

```bash
chronicle list --format table
chronicle list --format table --offset 20 --limit 20
```

## Recall memories

Default when the task depends on prior project context, previous decisions, or stored implementation details.

1. Start from the injected catalog or from `chronicle list --format table`.
2. Select only the IDs that look relevant from title and description.
3. Respect `maxMemoriesToPull`, `maxRetrievalTokenBudget`, and `requireConfirmationAbove`.
4. If loading more than `requireConfirmationAbove` memories, ask the user first and show token estimates.
5. Load each memory with `chronicle get <id>`.
6. Verify referenced artifacts before relying on the loaded memory.

Command pattern:

```bash
chronicle get <id>
```

Validation loop:

1. If a recalled memory conflicts with current repo state, flag the conflict.
2. Prefer the more recent memory until the project state is clarified.
3. Continue only after checking the relevant files or config.

## Create from the current session

Default when the current session produced durable project knowledge that should be reusable later.

1. Review the entire conversation, not just the last exchange.
2. Capture durable decisions, implementation details, debugging discoveries, and next steps.
3. Write a short title and a retrieval-oriented description.
4. If loaded Chronicle memories influenced the result, collect their IDs for `parentIds`.
5. Read [references/memory-template.md](references/memory-template.md) and fill that template.
6. Replace placeholders with concrete facts, file paths, commands, and decisions from the session.
7. Keep the summary within `maxMemorySummaryTokens`.
8. Call Chronicle in `--stdin` mode.

Description quality rule: if a future agent reads only the description, it should still know whether the memory is relevant.

Command pattern:

```bash
echo '{"title":"...","description":"...","summary":"...","parentIds":["memory-1"],"agent":"copilot"}' | chronicle create --stdin
```

## Create from existing files or pasted material

Default when the important knowledge already exists in docs, code, issue text, or pasted source material outside the chat.

1. Read the provided files or pasted text carefully.
2. Analyze the supplied files or pasted text as the primary source material, not the conversation.
3. Read [references/memory-template.md](references/memory-template.md).
4. Replace placeholders with concrete facts taken from the source material.
5. Apply the same title, description, summary template, and `parentIds` rules used for session-based creation.
6. Keep the summary within `maxMemorySummaryTokens`.
7. Call Chronicle in `--stdin` mode.

Command pattern:

```bash
echo '{"title":"...","description":"...","summary":"...","parentIds":[],"agent":"copilot"}' | chronicle create --stdin
```

Example usage:

- `/chronicle-memory` for source material like `@docs/architecture.md` or pasted migration notes

## Update an existing memory

Default when a saved memory is stale, incomplete, or partially incorrect but still worth preserving.

1. Identify the target memory ID.
2. Load the current memory first with `chronicle get <id>`.
3. Compare the stored memory against the current project state and session context.
4. Preserve information that is still correct.
5. Update only the fields that are stale or incomplete.
6. If you change `summary`, read [references/memory-template.md](references/memory-template.md), preserve the template structure, and replace placeholders with updated facts.
7. Keep the rewritten summary within `maxMemorySummaryTokens`.
8. Prefer `--stdin` mode for structured updates.
9. If the old memory is obsolete enough that a new memory would be clearer, create a replacement memory instead and consider `chronicle supersede`.

Command pattern:

```bash
chronicle get <id>
echo '{"summary":"## Goals
...","description":"Updated retrieval signal"}' | chronicle update <id> --stdin
```

## Final validation

Before finishing:

1. Confirm the chosen path matches the user intent.
2. Confirm config limits were respected.
3. Confirm the description is retrieval-oriented.
4. Confirm `parentIds` reflect only the memories that actually informed the result.
5. Confirm recalled information was checked against the current repo state.
6. If validation fails, revise the memory or rerun the Chronicle command before finishing.
