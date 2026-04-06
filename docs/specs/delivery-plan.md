# Chronicle — Packaging, Publishing & CI/CD Delivery Plan

This document is the detailed implementation plan for making Chronicle publishable, installable, and maintainable as a public npm package.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Registry | **npmjs.com** (public) | Open-source project, maximum reach |
| Package name | **`chronicle-memory`** (unscoped) | Already configured, simpler install command |
| Initial version | **`0.0.1-alpha`** | Signals early stage, allows breaking changes freely |
| License | **Apache-2.0** | Already present in repository |
| Native dependency | Keep `better-sqlite3` as-is | Document build prerequisites, avoid WASM complexity |
| Install method | **Global only** (`npm i -g chronicle-memory`) | Hooks call bare `chronicle` on PATH; simplest model |
| CI platforms | **Linux + macOS + Windows** | Native addon requires cross-platform validation |
| Release notes | **GitHub Releases only** | No CHANGELOG.md file in repo |
| Stable publish trigger | Git tag matching `v[0-9]+.[0-9]+.[0-9]+` | e.g. `v0.1.0` |
| Prerelease publish trigger | Git tag matching `v*-alpha.*` or `v*-pre.*` | e.g. `v0.0.1-alpha`, publishes to npm `next` dist-tag |

---

## Task 1: Package Metadata & Publish Safety

**Goal:** Ensure `npm pack` produces a clean, minimal tarball with correct metadata and no source/test leakage.

### 1.1 — Update `package.json` fields

Add or update the following fields:

```jsonc
{
  "version": "0.0.1-alpha",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/<OWNER>/chronicle.git"   // fill in actual owner
  },
  "homepage": "https://github.com/<OWNER>/chronicle#readme", // fill in actual owner
  "bugs": {
    "url": "https://github.com/<OWNER>/chronicle/issues"     // fill in actual owner
  },
  "author": "<NAME>",                                        // fill in actual author
  "keywords": [
    "chronicle",
    "memory",
    "coding-agents",
    "ai",
    "cli",
    "sqlite",
    "copilot",
    "claude",
    "context",
    "local-memory"
  ]
}
```

Fields that stay unchanged (already correct):
- `name`: `"chronicle-memory"`
- `bin`: `{ "chronicle": "bin/chronicle.js" }`
- `main`: `"dist/index.js"`
- `types`: `"dist/index.d.ts"`
- `engines`: `{ "node": ">=20" }`
- `files`: `["bin", "dist"]`

**Note on the `files` field:** The existing `"files": ["bin", "dist"]` acts as an allowlist. npm always includes `package.json`, `README.md`, and `LICENSE` regardless of `files`. This means only `bin/`, `dist/`, `package.json`, `README.md`, and `LICENSE` will be in the tarball. Source code, tests, docs, config files, and `AGENTS.md` are automatically excluded.

### 1.2 — Add `prepublishOnly` script

Add to `package.json` scripts:

```json
"prepublishOnly": "npm run typecheck && npm run build && npm test"
```

This ensures every `npm publish` (local or CI) runs a full validation pass before uploading. It prevents publishing a broken or stale build.

### 1.3 — Create `.npmignore` as a safety net

Even though `files` already handles inclusion, create `.npmignore` as documentation and defense-in-depth:

```
# Source and config (excluded by `files` allowlist, listed here for clarity)
src/
tests/
docs/
tsconfig.json
tsup.config.ts
AGENTS.md
delivery-plan.md
.github/

# Editor and OS artifacts
*.tgz
.DS_Store
Thumbs.db
```

### 1.4 — Verification step

Run `npm pack --dry-run` and confirm the tarball contents are exactly:

```
bin/chronicle.js
dist/index.js
dist/index.d.ts
dist/index.js.map
package.json
README.md
LICENSE
```

No `src/`, `tests/`, `docs/`, `AGENTS.md`, `tsconfig.json`, `tsup.config.ts`, or `node_modules/` should appear.

### Acceptance criteria

- [ ] `npm pack --dry-run` shows only the expected files listed above
- [ ] `package.json` has all metadata fields filled in (version, license, repository, author, keywords)
- [ ] `prepublishOnly` script runs typecheck + build + test before publish

---

## Task 2: Version Strategy & Version Bump Scripts

**Goal:** Establish a clear versioning workflow from alpha to stable, with convenient npm scripts.

### 2.1 — Set initial version

Change `package.json` version from `1.0.0` to `0.0.1-alpha`.

### 2.2 — Add version bump scripts

Add to `package.json` scripts:

```json
"version:pre": "npm version prerelease --preid=alpha",
"version:patch": "npm version patch",
"version:minor": "npm version minor",
"version:major": "npm version major"
```

Behavior:
- `npm run version:pre` → `0.0.1-alpha` → `0.0.2-alpha` → `0.0.3-alpha` ...
- `npm run version:patch` → strips prerelease, bumps to `0.0.1` (first stable)
- `npm run version:minor` → `0.1.0`
- `npm run version:major` → `1.0.0`

Each `npm version` command automatically:
1. Updates `package.json` version
2. Creates a git commit: `v0.0.1-alpha`
3. Creates a git tag: `v0.0.1-alpha`

Pushing the tag (`git push --follow-tags`) triggers the appropriate CD workflow.

### 2.3 — Planned version progression

```
0.0.1-alpha   First publish (current task)
0.0.N-alpha   Iterative alpha releases during Epic 4 validation
0.1.0            First stable release (all epics complete, real-agent tested)
0.x.y            Feature releases toward 1.0
1.0.0            Stable public API commitment
```

### Acceptance criteria

- [ ] `package.json` version is `0.0.1-alpha`
- [ ] All four version scripts work and produce correct versions + tags
- [ ] `git log` shows version commit and `git tag` shows the tag after running a bump

---

## Task 3: CI Pipeline — `.github/workflows/ci.yml`

**Goal:** Automated quality gate on every push to `main` and every pull request. Cross-platform validation of the native addon build.

### 3.1 — Workflow triggers

```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

### 3.2 — Job matrix

```yaml
strategy:
  fail-fast: false
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
    node-version: [20]
```

`fail-fast: false` ensures all platform results are reported even if one fails — important for diagnosing platform-specific native build issues.

Single Node version (20) is sufficient since `engines` requires `>=20` and we don't need to test bleeding-edge Node.

### 3.3 — Job steps

```
1. actions/checkout@v4
2. actions/setup-node@v4  (with node-version from matrix, cache: 'npm')
3. npm ci
4. npm run typecheck
5. npm run build
6. npm test
7. npm pack --dry-run          (verify package contents, only on ubuntu)
```

**Caching:** `actions/setup-node` with `cache: 'npm'` caches the npm download cache (not `node_modules`). This speeds up `npm ci` by avoiding re-downloading packages. `node_modules` itself is not cached because `better-sqlite3` compiles platform-specific native binaries — caching `node_modules` across different OS matrix entries would break.

**Package verification (step 7):** Run `npm pack --dry-run` on one platform (ubuntu) to log the tarball contents in CI output. This is a sanity check, not a blocking gate.

### 3.4 — GitHub Actions runner prerequisites for `better-sqlite3`

GitHub Actions hosted runners come with:
- **Ubuntu:** `build-essential`, `python3` — node-gyp works out of the box
- **macOS:** Xcode Command Line Tools — node-gyp works out of the box
- **Windows:** Visual Studio Build Tools + Python — node-gyp works out of the box

No additional setup steps are needed for `better-sqlite3` compilation on any platform.

### Acceptance criteria

- [ ] CI runs on every push to `main` and every PR
- [ ] All three platforms (Linux, macOS, Windows) pass: install → typecheck → build → test
- [ ] `better-sqlite3` native compilation succeeds on all platforms without extra setup
- [ ] npm cache is used to speed up installs

---

## Task 4: CD Pipeline — `.github/workflows/publish.yml`

**Goal:** Automated npm publishing on git tags, with separate stable and prerelease flows.

### 4.1 — Workflow trigger

```yaml
on:
  push:
    tags:
      - 'v*'
```

Single trigger on any `v*` tag. The workflow itself determines whether it's a stable or prerelease publish based on the tag format.

### 4.2 — Tag classification logic

The workflow needs to distinguish:
- **Stable tag:** `v0.1.0`, `v1.0.0` — matches `v[0-9]+.[0-9]+.[0-9]+` exactly (no suffix)
- **Prerelease tag:** `v0.0.1-alpha`, `v0.1.0-pre` — contains `-alpha.` or `-pre.`

Implementation approach — a shell step that sets an output variable:

```bash
TAG=${GITHUB_REF#refs/tags/}
if [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "release_type=stable" >> $GITHUB_OUTPUT
else
  echo "release_type=prerelease" >> $GITHUB_OUTPUT
fi
```

### 4.3 — Validation steps (run before any publish)

The publish workflow must run its own quality checks, not rely on CI having passed separately (tags bypass PR checks):

```
1. actions/checkout@v4
2. actions/setup-node@v4  (node 20, registry-url: 'https://registry.npmjs.org')
3. npm ci
4. npm run typecheck
5. npm run build
6. npm test
```

These run on `ubuntu-latest` only (the publish platform).

### 4.4 — Publish step

```yaml
- name: Publish to npm
  run: |
    if [ "${{ steps.classify.outputs.release_type }}" = "stable" ]; then
      npm publish
    else
      npm publish --tag next
    fi
  env:
    NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

Key details:
- **Stable releases** publish to the `latest` dist-tag (npm default). Users running `npm i -g chronicle-memory` get this version.
- **Prerelease versions** publish to the `next` dist-tag. This prevents `npm i -g chronicle-memory` from installing an alpha. Users who want the prerelease must explicitly run `npm i -g chronicle-memory@next`.
- **`NODE_AUTH_TOKEN`** must be configured as a repository secret in GitHub. It should be an npm automation token (not a publish token) to bypass 2FA requirements in CI.

### 4.5 — GitHub Release creation

After successful publish, create a GitHub Release from the tag:

```yaml
- name: Create GitHub Release
  uses: softprops/action-gh-release@v2
  with:
    generate_release_notes: true
    prerelease: ${{ steps.classify.outputs.release_type == 'prerelease' }}
```

This uses GitHub's auto-generated release notes (based on PR titles since the last release). Prerelease tags are marked as pre-release on the GitHub Releases page.

### 4.6 — Publish provenance (optional enhancement)

npm supports publish provenance attestation from GitHub Actions. This adds a verifiable link between the published package and the source commit:

```yaml
- run: npm publish --provenance
```

Requires the workflow to have `id-token: write` permission. This is a nice-to-have for supply chain security but not blocking for the first publish.

### 4.7 — Complete workflow structure

```
Job: publish
  Platform: ubuntu-latest
  Steps:
    1. Checkout
    2. Setup Node 20 + npm registry
    3. Classify tag (stable vs prerelease)
    4. npm ci
    5. npm run typecheck
    6. npm run build
    7. npm test
    8. npm publish (or npm publish --tag next)
    9. Create GitHub Release
```

### 4.8 — Required secrets

| Secret | Where | Value |
|---|---|---|
| `NPM_TOKEN` | GitHub repo → Settings → Secrets → Actions | npm automation token from npmjs.com |

### 4.9 — End-to-end publish flow (developer perspective)

**Prerelease:**
```bash
npm run version:pre        # bumps 0.0.1-alpha → 0.0.1-alpha.1, commits, tags
git push --follow-tags     # pushes commit + tag → triggers publish workflow
# → npm publish --tag next
# → GitHub prerelease created
```

**Stable release:**
```bash
npm run version:patch      # bumps 0.0.1-alpha.N → 0.0.1, commits, tags
git push --follow-tags     # pushes commit + tag → triggers publish workflow
# → npm publish (latest)
# → GitHub release created
```

### Acceptance criteria

- [ ] Pushing a `v*-alpha.*` tag publishes to npm under the `next` dist-tag
- [ ] Pushing a `v0.x.y` tag (no suffix) publishes to npm under the `latest` dist-tag
- [ ] Full validation (typecheck + build + test) runs before every publish
- [ ] GitHub Release is created automatically with correct prerelease flag
- [ ] `NPM_TOKEN` secret is documented as a setup requirement

---

## Task 5: README Rewrite for Public Consumption

**Goal:** Extend the current developer-facing README with a user-facing segment suitable for the npm package page and GitHub landing.

### 5.1 — Target audience

Primary: developers who want to give their AI coding agents persistent memory. They will find this package via npm search, GitHub, or a blog post / recommendation.

### 5.2 — Structure

```
1. Title + one-line description
2. Badges (npm version, CI status, license)
3. Why Chronicle exists (2-3 paragraphs, problem → solution)
4. Core concepts (brief table: Memory, Catalog, Ancestry, Supersession)
5. Prerequisites
6. Installation
7. Quick Start (init → create memory → new session → recall)
8. CLI Command Reference (table with all commands + brief description)
9. Agent Integration
   - Supported agents (Claude Code, GitHub Copilot)
   - What init generates (skills, hooks, instructions)
   - How it works at session start
10. Configuration Reference (table of config.json settings)
11. How It Works (brief architecture: CLI → SQLite → agent hooks/skills)
12. Contributing (brief: clone, npm install, npm test)
13. License
```

### 5.3 — Badges

```markdown
[![npm version](https://img.shields.io/npm/v/chronicle-memory)](https://www.npmjs.com/package/chronicle-memory)
[![CI](https://github.com/<OWNER>/chronicle/actions/workflows/ci.yml/badge.svg)](https://github.com/<OWNER>/chronicle/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
```

### 5.4 — Prerequisites section

Must clearly document the native build toolchain requirement for `better-sqlite3`:

| Platform | Requirement |
|---|---|
| **All** | Node.js >= 20, npm, Git |
| **macOS** | Xcode Command Line Tools (`xcode-select --install`) |
| **Linux** | `build-essential` and `python3` (usually pre-installed) |
| **Windows** | Visual Studio Build Tools with "Desktop development with C++" workload, or `npm install -g windows-build-tools` |

### 5.5 — Quick Start section

Walk the reader through the core flow in ~20 lines of shell commands:

```bash
# Install
npm install -g chronicle-memory

# Initialize in a repo
cd your-project
chronicle init --agent claude-code --agent copilot

# Commit the generated artifacts
git add .chronicle/ .claude/ .github/ CLAUDE.md .gitignore
git commit -m "feat: initialize Chronicle memory layer"

# Start an agent session — catalog is automatically injected
# Use /create-memory at session end to save knowledge
# Next session will see the memory catalog and can /recall relevant memories
```

### 5.6 — CLI Command Reference

Compact table format:

| Command | Description |
|---|---|
| `chronicle init` | Initialize Chronicle in a Git repository |
| `chronicle create` | Create a new memory (args or `--stdin` JSON) |
| `chronicle update <id>` | Update an existing memory (partial updates supported) |
| `chronicle get <id>` | Retrieve full memory content as JSON |
| `chronicle list` | List active memories (JSON or table, with pagination) |
| `chronicle delete <id>` | Delete a memory (`--force` for non-interactive) |
| `chronicle supersede <old> <new>` | Mark a memory as superseded by a newer one |
| `chronicle hook session-start` | Emit catalog payload for agent session hooks |

### 5.7 — Content to remove from current README

The current README contains developer/contributor-oriented content (project structure, "Developer Quick Start", `npm run typecheck`, vitest details). This should be extracted into a dedicated /docs file.

### 5.8 — Content to preserve

Keep linking to the detailed docs (`docs/architecture.md`, `docs/specs/`) for contributors who want to understand internals. Don't inline that content in the README.

### Acceptance criteria

- [ ] README is written for end-users (developers installing Chronicle), not contributors
- [ ] Prerequisites clearly document native build tool requirements per platform
- [ ] Quick Start walks through init → first session → memory creation → recall
- [ ] All CLI commands are documented with description and key flags
- [ ] Agent integration section explains what `chronicle init` generates and how hooks work
- [ ] Configuration settings table is included
- [ ] Badges render correctly (npm, CI, license)
- [ ] Contributing section exists but is brief (clone, install, test, link to AGENTS.md)

---

## Implementation Order

The tasks have the following dependencies:

```
Task 1 (metadata)  ──→  Task 2 (versioning)  ──→  Task 3 (CI)  ──→  Task 4 (CD)
                                                                        ↑
Task 5 (README)  ──────────────────────────────────────────────────────-┘
```

- **Task 1** must be done first — it sets the package.json foundation that everything else builds on.
- **Task 2** depends on Task 1 (version field must be set before bump scripts make sense).
- **Task 3** is independent of versioning but logically follows — you want CI before CD.
- **Task 4** depends on Task 3 (publish workflow references CI patterns and assumes the CI workflow exists).
- **Task 5** (README) can be done in parallel with Tasks 3-4 but should be complete before the first publish, since the README is included in the npm tarball and displayed on npmjs.com.

**Recommended execution order:** 1 → 2 → 3 → 4 → 5 → verify end-to-end with `npm pack` → first publish.

---

## Post-Implementation Verification

Before the first real publish, verify:

1. **Local:** `npm pack` produces a clean tarball; inspect contents with `tar tzf chronicle-memory-0.0.1-alpha.tgz`
2. **Local:** Install from tarball globally: `npm i -g chronicle-memory-0.0.1-alpha.tgz` and run `chronicle --version`
3. **CI:** Push to `main` triggers CI; all 3 platforms pass
4. **CD dry run:** Create and push an alpha tag; confirm the publish workflow triggers and passes validation steps (can cancel before actual publish if `NPM_TOKEN` is not yet configured)
5. **First publish:** Configure `NPM_TOKEN`, push the tag, confirm the package appears on npmjs.com

---

## Open Items (Require Developer Input)

| Item | Current State | Action Needed |
|---|---|---|
| GitHub repository URL | Not in `package.json` | Fill in `repository`, `homepage`, `bugs` fields |
| Author name | Not in `package.json` | Fill in `author` field |
| `NPM_TOKEN` secret | Not configured | Create npm automation token and add to GitHub repo secrets |
| npm account | Unknown | Ensure the publishing npm account exists and owns `chronicle-memory` (or the name is available) |
