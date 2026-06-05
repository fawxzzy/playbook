## Playbook Naming Blocker Compression Pass 3

Date: 2026-05-29
Repo: `repos/playbook`
Scope: Owner-side blocker compression, scout, and exact recheck only. No ATLAS root docs. No repo rename.

### Exact blocker set before

- `repos/playbook`
- `<ATLAS_TMP>/playbook-lint-debt-closeout`
- `<ATLAS_TMP>/playbook-main-closeout`

### Preflight findings

- `<ATLAS_TMP>/playbook-main-closeout` was detached at commit `aab5ad5b` (`Playbook: sustain docs-audit governance support`).
- The detached worktree had only two live content diffs:
  - `packages/cli-wrapper/runtime/commands/patterns.js`
  - `packages/cli-wrapper/runtime/commands/patterns.js.map`
- Those live diffs matched the corresponding dirty diffs in both:
  - `repos/playbook`
  - `<ATLAS_TMP>/playbook-lint-debt-closeout`

### Actions taken

1. Preserved the detached base commit by creating local branch `codex/playbook-main-closeout-preserved` at `aab5ad5b`.
2. Removed the registered detached worktree `<ATLAS_TMP>/playbook-main-closeout`.
3. Removed the leftover unregistered residue directory after Git had already dropped the worktree registration.
4. Rechecked the surviving two branch-backed Playbook blocker surfaces.

### Read-only scout result on surviving branch-backed surfaces

Surviving surfaces:

- `repos/playbook`
- `<ATLAS_TMP>/playbook-lint-debt-closeout`

Relationship:

- The repo root on `codex/playbook-sustain-docs-audit` is the primary blocker surface.
- `playbook-lint-debt-closeout` is a dependent overlapping surface, not a separate governing lane.

Evidence:

- Against `HEAD`, the root has unique live content diffs in:
  - `docs/CHANGELOG.md`
  - `packages/engine/src/patternTransfer.ts`
  - `packages/engine/src/workflowPack/environmentBridgePlanner.ts`
- The overlapping live content diff shared by both surfaces is:
  - `packages/cli-wrapper/runtime/commands/patterns.js`
  - `packages/cli-wrapper/runtime/commands/patterns.js.map`
- `playbook-lint-debt-closeout` had no unique live content diff beyond the shared `patterns` pair in this pass.

### Exact blocker set after

- `repos/playbook`
- `<ATLAS_TMP>/playbook-lint-debt-closeout`

### Exact class now

`still blocked by exact class: primary dirty release-governance root lane with one dependent overlapping worktree surface`

### Candidate readiness

`safe-next-candidate ready`: no

### Exact next owner-side step

Collapse `<ATLAS_TMP>/playbook-lint-debt-closeout` next, then rerun one exact Playbook blocker-class recheck.

### Verification

Commands run in this pass:

- `git -C <ATLAS_TMP>/playbook-main-closeout status --short --branch`
- `git -C <ATLAS_TMP>/playbook-main-closeout diff --stat`
- `git -C <ATLAS_TMP>/playbook-main-closeout diff --name-only`
- `git -C repos/playbook branch codex/playbook-main-closeout-preserved aab5ad5b4a51f37f6426b0797080dfa565954788`
- `git -C repos/playbook worktree remove --force <ATLAS_TMP>/playbook-main-closeout`
- `pnpm playbook verify --json`

Results:

- `playbook-main-closeout`: collapsed
- `pnpm playbook verify --json`: failed with `verify.failure.release.requiredVersionBump.missing`
