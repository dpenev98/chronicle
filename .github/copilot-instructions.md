<!-- chronicle:start -->
## Chronicle Memory System

This project uses Chronicle for persistent, version-controlled memory across coding sessions.
Chronicle is separate from your built-in memory systems and stores structured project knowledge
in a local SQLite database within the repository.

### On Session Start
A memory catalog may be injected into the session context. When you see the user's first message:
1. Review the Chronicle memory catalog (titles and descriptions)
2. Determine which memories, if any, are relevant to the user's request
3. If relevant memories exist, run `chronicle get <id>` to load full content
4. Respect budget limits: max 5 memories, max 5000 total tokens
5. If loading more than 3 memories, ask the user first and show token estimates

### On Memory Conflicts
If loaded memories contradict each other, prefer the most recently created one.
Flag the conflict to the user so it can be resolved with a follow-up memory or a supersession update.

### Verify Before Trusting
After loading a memory, if it references specific files, implementations, or configurations,
spot-check that those artifacts still exist and still match what the memory describes before relying on it.

### Available Commands
- `chronicle list` — View catalog entries
- `chronicle get <id>` — Load a full memory
- Use `/create-memory` to save session knowledge
- Use `/update-memory <id>` to update an existing memory
- `chronicle supersede <old_id> <new_id>` — Mark a memory as replaced
<!-- chronicle:end -->
