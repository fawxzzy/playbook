# Verify Output Contract

## Failure Derivation Contract

Playbook remediation decisions are driven exclusively by failures.

Failure count is derived from every failure source present in the verify payload, and the highest count wins (`deriveVerifyFailureFacts` in `packages/cli/src/lib/remediationContract.ts`):

1. `verify.failures[]` array (**authoritative** when present)
2. `verify.findings[]` entries with `level: "failure"` or `level: "error"`
3. `verify.summary.failures` when it is a non-negative integer

Taking the maximum is fail-safe: a source that under-reports can never turn a failing verify into `not_needed` remediation. Warnings never contribute to failure count.

This contract prevents rule authors from misinterpreting findings and accidentally triggering remediation from non-failure results.

## Why This Matters

Playbook depends on a stable execution invariant:

```text
analysis output
      v
failure extraction
      v
remediation planning
      v
deterministic apply
```

If failure derivation is fuzzy, behavior becomes unpredictable and can cause:

- remediation running when it should not
- remediation skipping when it should run
- CI false positives
- broken demo repositories

## Pattern: Failure-Driven Remediation

```text
Discovery (verify/analyze)
      v
Findings
      v
Failure Derivation
      v
Remediation Planning
      v
Remediation Apply
```

**Rule:** Remediation logic must depend only on failures, never on total findings.

**Reason:** Findings include warnings and informational results, which must not trigger repository modification.

## Baseline-Aware Finding State

`verify --baseline <ref>` can also persist `.playbook/finding-state.json` as a deterministic repo-local artifact.

- Finding identity is derived from rule id, normalized location, baseline ref, and evidence hash.
- Triage states are `new`, `existing`, `resolved`, and `ignored`.
- The finding-state artifact is separate from SARIF or GitHub-check output.
- SARIF/check delivery modes remain a future layer after stable finding identity exists.
