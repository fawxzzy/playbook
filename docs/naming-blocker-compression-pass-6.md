## Playbook Naming Blocker Compression Pass 6

Date: 2026-05-29
Repo: `repos/playbook`
Scope: Owner-side bounded normalization and exact blocker-class recheck only. No ATLAS root docs. No repo rename.

### Exact blocker set before

- `repos/playbook`

### Prior class

`blocked by one exact remaining blocker: dirty main worktree blocked by CRLF-only normalization residue`

### Actions taken

1. Reconfirmed that no newer durable receipt had already cleared the residue.
2. Proved the remaining blocker was normalization-only:
   - `git diff --name-only` emitted no semantic dirty paths
   - `git diff --ignore-cr-at-eol --name-only` emitted no semantic dirty paths
3. Refreshed the exact dirty runtime/tests surface by staging only:
   - `packages/cli-wrapper/runtime/**`
   - `tests/contracts/**`
4. Confirmed the normalization pass produced no staged semantic diff:
   - `git diff --cached --name-only`: empty
   - `git diff --cached --ignore-cr-at-eol --name-only`: empty
5. Rechecked owner-side governance surfaces after normalization:
   - `pnpm playbook verify --json`
   - `pnpm playbook docs audit --json`

### Optional sidecar scout result

The secondary `tsc` failure is not naming-relevant.

Exact likely cause:

- `typescript` is present in root devDependencies.
- `packages/core/package.json` still uses bare `tsc -p tsconfig.build.json` for `build`.
- The failing lane is therefore most likely command invocation posture in that workspace package, not missing dependency ownership.

Likely later non-naming cleanup lane:

- normalize Playbook workspace build scripts so repo-local package build commands use the same explicit execution posture already present in `build:js` / `build:types` (`pnpm exec tsc`), or otherwise restore workspace bin resolution deterministically.

### Exact blocker set after

- none

### Exact class now

`safe-next-candidate ready`

### Candidate readiness

`safe-next-candidate ready`: yes

### Exact next owner-side step

None. The next honest move is root-side only: one Playbook-only remaining-family delta recheck.

### Verification

Commands run in this pass:

- `git diff --name-only`
- `git diff --ignore-cr-at-eol --name-only`
- `git add -A -- packages/cli-wrapper/runtime tests/contracts`
- `git diff --cached --name-only`
- `git diff --cached --ignore-cr-at-eol --name-only`
- `git status --short --branch`
- `pnpm playbook verify --json`
- `pnpm playbook docs audit --json`
- `pnpm why typescript`

Results:

- normalization residue: cleared
- `git status --short --branch`: clean on `main`, still `behind 7`
- `pnpm playbook verify --json`: pass
- `pnpm playbook docs audit --json`: pass
