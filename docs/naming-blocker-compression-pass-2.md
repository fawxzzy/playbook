## Playbook Naming Blocker Compression Pass 2

Date: 2026-05-29
Repo: `repos/playbook`
Scope: Owner-side blocker compression only. No ATLAS root docs. No repo rename.

### Exact blocker set before

- `repos/playbook`
- `<ATLAS_TMP>/playbook-lint-debt-closeout`
- `<ATLAS_TMP>/playbook-main-closeout`
- `<ATLAS_TMP>/fawxzzy-playbook-finding-identity`
- `<ATLAS_TMP>/fawxzzy-playbook-sarif-output`
- `<ATLAS_TMP>/fawxzzy-playbook-verify-baseline`
- `<ATLAS_TMP>/playbook-fawx-den-os-doctrine`
- `<ATLAS_TMP>/playbook-pr9-worktree`
- `<ATLAS_TMP>/playbook-research-phase-grid-evidence`
- `<ATLAS_TMP>/playbook-research-phase-grid-math`
- `<ATLAS_TMP>/playbook-sustain-pr19-refresh`

### Actions taken

1. Reconfirmed live worktree registration and dirty state across the full Playbook worktree family.
2. Removed seven clean retained worktrees after confirming they were registered, clean, and branch-backed:
   - `<ATLAS_TMP>/fawxzzy-playbook-sarif-output`
   - `<ATLAS_TMP>/fawxzzy-playbook-verify-baseline`
   - `<ATLAS_TMP>/playbook-fawx-den-os-doctrine`
   - `<ATLAS_TMP>/playbook-pr9-worktree`
   - `<ATLAS_TMP>/playbook-research-phase-grid-evidence`
   - `<ATLAS_TMP>/playbook-research-phase-grid-math`
   - `<ATLAS_TMP>/playbook-sustain-pr19-refresh`
3. Preserved the only untracked note from `<ATLAS_TMP>/fawxzzy-playbook-finding-identity` before removing that worktree.

### Preserved finding-identity note

The removed `codex/playbook-baseline-finding-identity` worktree carried one untracked file, `.codex-pr-body.md`, with this content:

```md
## Summary

- add `playbook verify --baseline <ref>`
- add stable finding identity for verification findings
- persist finding triage state across runs
- classify findings as `new`, `existing`, `resolved`, or `ignored`
- add schema/contracts/tests/docs coverage for finding state

## Verification

- `pnpm -r build`
- `pnpm playbook verify --baseline main`
- `pnpm agents:update`
- `pnpm agents:check`
- `pnpm playbook docs audit --json`
- `pnpm run verify`

## Scope note

This adds baseline-aware finding identity and persistent triage state only. It does not add SARIF output, GitHub-check output, mutation workflows, or Wave B work.
```

### Exact blocker set after

- `repos/playbook`
- `<ATLAS_TMP>/playbook-lint-debt-closeout`
- `<ATLAS_TMP>/playbook-main-closeout`

### Resulting blocker class

`still blocked by exact class: active dirty release-governance three-worktree lane`

### Candidate readiness

`safe-next-candidate ready`: no

### Exact next owner-side step

Collapse the detached dirty closeout surface at `<ATLAS_TMP>/playbook-main-closeout` first, then rerun one exact Playbook blocker-class recheck.

### Verification

Commands run after the compression attempt:

- `pnpm playbook verify --json`
- `pnpm playbook docs audit --json`

Results:

- `pnpm playbook verify --json`: failed with `verify.failure.release.requiredVersionBump.missing`
- `pnpm playbook docs audit --json`: passed
