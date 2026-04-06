# Chronicle Operations

This document covers CI/CD pipelines, versioning, release workflow, and npm publishing for the Chronicle project.

---

## Package Identity

| Field | Value |
|---|---|
| npm package name | `chronicle-memory` |
| CLI binary name | `chronicle` |
| Registry | npmjs.com (public) |
| License | Apache-2.0 |
| Install command | `npm install -g chronicle-memory` |

---

## Versioning

Chronicle follows [semantic versioning](https://semver.org/). The project starts in pre-stable alpha and will progress toward 1.0.0:

```
0.0.1-alpha     Initial publish
0.0.N-alpha     Iterative alpha releases
0.1.0           First stable release (all epics complete, real-agent tested)
0.x.y           Feature releases toward 1.0
1.0.0           Stable public API commitment
```

### Version Bump Scripts

Each script runs `npm version`, which updates `package.json`, creates a git commit, and creates a git tag:

| Script | Example | When to use |
|---|---|---|
| `npm run version:pre` | `0.0.1-alpha` → `0.0.1-alpha.0` | Iterating on alpha builds |
| `npm run version:patch` | `0.0.1-alpha.N` → `0.0.1` | Promoting alpha to stable patch |
| `npm run version:minor` | → `0.1.0` | New features, non-breaking |
| `npm run version:major` | → `1.0.0` | Breaking changes |

After bumping, push the tag to trigger automated publishing:

```bash
git push --follow-tags
```

---

## CI Pipeline

**File:** `.github/workflows/ci.yml`

**Triggers:** Push to `main`, pull requests targeting `main`.

**Matrix:**

| OS | Node |
|---|---|
| `ubuntu-latest` | 20 |
| `macos-latest` | 20 |
| `windows-latest` | 20 |

Cross-platform testing is required because `better-sqlite3` compiles platform-specific native binaries via `node-gyp`.

**Steps:**

1. Checkout
2. Setup Node.js (with npm cache)
3. `npm ci`
4. `npm run typecheck`
5. `npm run build`
6. `npm test`
7. `npm pack --dry-run` (Ubuntu only — tarball sanity check)

`fail-fast: false` ensures all platforms report results independently.

---

## CD Pipeline (Publish)

**File:** `.github/workflows/publish.yml`

**Trigger:** Push of any `v*` tag.

### Tag Classification

The workflow classifies the tag at runtime:

| Tag format | Example | Classification | npm dist-tag |
|---|---|---|---|
| `v<major>.<minor>.<patch>` (no suffix) | `v0.1.0` | Stable | `latest` |
| Anything else with `v` prefix | `v0.0.1-alpha.0` | Prerelease | `next` |

- **`latest`** — what users get with `npm i -g chronicle-memory`
- **`next`** — opt-in with `npm i -g chronicle-memory@next`

### Steps

1. Checkout
2. Setup Node.js 20 + npm registry (`https://registry.npmjs.org`)
3. Classify tag (stable vs prerelease)
4. `npm ci`
5. `npm run typecheck`
6. `npm run build`
7. `npm test`
8. `npm publish --provenance` (stable) or `npm publish --provenance --tag next` (prerelease)
9. Create GitHub Release (auto-generated release notes, prerelease flag set accordingly)

The workflow runs its own full validation before publishing — it does not rely on CI having passed separately, since tag pushes bypass PR checks.

### Provenance

`--provenance` is enabled, linking each published package version to the exact source commit via npm's supply chain attestation. Requires `id-token: write` permission on the workflow.

### Required Secrets

| Secret | Location | Value |
|---|---|---|
| `NPM_TOKEN` | GitHub repo → Settings → Secrets → Actions | npm automation token (bypasses 2FA in CI) |

---

## Publish Safety

### `prepublishOnly` Script

`package.json` includes a `prepublishOnly` script that runs before every `npm publish`:

```
npm run typecheck && npm run build && npm test
```

This prevents publishing a broken or stale build, whether publishing locally or through CI.

### `files` Allowlist

`package.json` `files` field restricts the tarball to `["bin", "dist"]`. npm always includes `package.json`, `README.md`, and `LICENSE` automatically.

Published tarball contents:

```
bin/chronicle.js
dist/index.js
dist/index.d.ts
dist/index.js.map
package.json
README.md
LICENSE
```

An `.npmignore` file exists as defense-in-depth documentation but the `files` allowlist is the primary mechanism.

---

## Release Workflow (End-to-End)

### Prerelease

```bash
npm run version:pre          # 0.0.1-alpha → 0.0.1-alpha.0, git commit + tag
git push --follow-tags       # Triggers publish workflow
# → npm publish --tag next
# → GitHub prerelease created
```

### Stable Release

```bash
npm run version:patch        # 0.0.1-alpha.N → 0.0.1, git commit + tag
git push --follow-tags       # Triggers publish workflow
# → npm publish (latest)
# → GitHub release created
```

### First-Time Setup

Before the first publish:

1. Ensure the npm account exists and the `chronicle-memory` name is available
2. Create an npm automation token at npmjs.com
3. Add the token as `NPM_TOKEN` in GitHub repo → Settings → Secrets → Actions
4. Push a version tag to trigger the workflow

### Verification

After a publish, verify:

- Package appears on [npmjs.com/package/chronicle-memory](https://www.npmjs.com/package/chronicle-memory)
- `npm i -g chronicle-memory` installs successfully
- `chronicle --version` prints the expected version
- GitHub Release was created with correct prerelease flag
