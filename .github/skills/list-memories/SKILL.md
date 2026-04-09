---
name: list-memories
description: List Chronicle memories so you can browse the catalog before loading full entries.
---
<!-- This file is managed by Chronicle. Re-running `chronicle init` may overwrite local changes. -->

# /list-memories

Browse the Chronicle memory catalog before deciding which full memories to load.

## Workflow

1. Run `chronicle list --format table`.
2. Review titles, descriptions, token estimates, and creation timestamps.
3. If relevant memories exist, decide which specific IDs to load with `chronicle get <id>`.
4. Use pagination if the catalog is truncated.

## Command pattern

```bash
chronicle list --format table
chronicle list --format table --offset 20 --limit 20
```

Use this skill before recall when you need to browse memory candidates instead of guessing IDs.
