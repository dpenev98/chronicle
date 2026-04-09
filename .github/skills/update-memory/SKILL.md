---
name: update-memory
description: Update an existing Chronicle memory while preserving still-correct information.
---
<!-- This file is managed by Chronicle. Re-running `chronicle init` may overwrite local changes. -->

# /update-memory

Update an existing Chronicle memory when the project has changed or a memory is incomplete.

## Workflow

1. Identify the target memory ID.
2. Load the current memory first with `chronicle get <id>`.
3. Compare the stored memory against the current project state and session context.
4. Preserve information that is still correct.
5. Update only the fields that are stale or incomplete.
6. If you change `summary`, read `.chronicle/config.json` and keep it within `maxMemorySummaryTokens`.
7. Prefer `--stdin` mode for structured updates.

## Command pattern

```bash
chronicle get <id>
echo '{"summary":"## Goals
...","description":"Updated retrieval signal"}' | chronicle update <id> --stdin
```

Do not rewrite the memory from scratch unless the old content is no longer trustworthy.
