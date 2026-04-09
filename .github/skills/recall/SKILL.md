---
name: recall
description: Load one or more Chronicle memories into the current session context.
---
<!-- This file is managed by Chronicle. Re-running `chronicle init` may overwrite local changes. -->

# /recall

Load one or more Chronicle memories into the current session when they are relevant to the task.

## Workflow

1. Start from the injected catalog or run `chronicle list` if you need to browse.
2. Select only memories that appear relevant from title and description.
3. Read `.chronicle/config.json` before loading multiple memories.
4. Respect `maxMemoriesToPull` and `maxRetrievalTokenBudget`.
5. If loading more than `requireConfirmationAbove` memories, ask the user first and show token estimates.
6. Load memories with `chronicle get <id>`.
7. After loading, verify referenced files or configuration before relying on the memory.

## Command pattern

```bash
chronicle get <id>
chronicle list --format table
```

Prefer targeted retrieval over loading many memories speculatively.
