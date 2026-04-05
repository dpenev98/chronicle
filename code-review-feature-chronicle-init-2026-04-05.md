# Code Review — `feature/chronicle-init`

**Date**: 2025-04-05
**Branch**: `feature/chronicle-init`
**Diff**: 18 files changed, 667 insertions(+), 25 deletions(-)
**Build**: ✅ Pass | **Typecheck**: ✅ Pass | **Tests**: ✅ 52/52 passing

---

## 🔍 Findings

### 🟠 High src/templates/skills/create-memory.ts:40 - Copilot skill example hardcodes the Claude agent
**Issue**: `renderCreateMemorySkill(agent)` accepts the target agent, but the command example always emits `"agent":"claude-code"`. When this template is rendered for Copilot, the generated skill teaches the agent to create memories with the wrong `session_agent`, which breaks provenance and any later behavior that depends on knowing which agent authored a memory. The same hardcoded payload pattern also appears in `src/templates/skills/create-memory-from.ts:36`.
**Suggestion**: Interpolate the `agent` parameter into the example JSON payload in both create-skill templates, and add a regression assertion that the Copilot-rendered skill contains `"agent":"copilot"`.

### 🟢 Low docs/specs/STATUS.md:270 - Validated test count is already stale
**Issue**: The status document now says the branch was validated at `46/46` tests passing, but the current suite on this branch runs `52/52`. Because `STATUS.md` is treated as a source-of-truth document in this repo, an outdated count can mislead the next contributor about the actual validation state.
**Suggestion**: Update the recorded total to the current passing count, or avoid hardcoding the exact test total if it is expected to change frequently.

### 🟢 Low `docs/specs/STATUS.md`:~171 — Decision #8 inserted before Decision #7

**Issue**: The new decision "### 8. Build templates as reusable generators, not ad hoc file blobs" is placed in the file _before_ the existing "### 7. Preserve hook safety guarantees". This creates out-of-order numbering in the Decisions and Rationale section.

**Suggestion**: Move the `### 8.` block to appear after the `### 7.` block so decision numbers are sequential in the document.

### 🟢 Low `src/templates/shared.ts`:16-19 — Non-exhaustive agent branching in `renderSkillFrontmatter`

**Issue**: The function uses `if (agent === 'claude-code') return '';` with an implicit fallthrough to copilot-style frontmatter. If a third value is later added to `SupportedAgent`, it would silently receive YAML frontmatter without a compiler diagnostic.

**Suggestion**: Use an exhaustive switch so TypeScript flags unhandled agent variants at compile time:
```typescript
function renderSkillFrontmatter(agent: SupportedAgent, name: string, description: string): string {
  switch (agent) {
    case 'claude-code':
      return '';
    case 'copilot':
      return normalizeTemplateContent(`---
name: ${name}
description: ${description}
---`);
  }
}
```
With `noImplicitReturns` enabled, adding a new `SupportedAgent` variant would produce a compile error until handled.
