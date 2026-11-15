# Workflow Promotion Contract

`packages/contracts/src/workflow-promotion.schema.json` is the shared contract for durable workflow outputs that stage, validate, and promote repo-visible state.

For local-first workflow gating, use `docs/contracts/LOCAL_VERIFICATION_RECEIPT_CONTRACT.md`. Workflow promotion remains a separate mutation-state contract from verification, publishing, and deployment.

## Rule

- Durable workflow outputs must expose normalized staged-promotion metadata when they write repo-visible state.

## Pattern

- Reuse one shared workflow promotion contract instead of command-local promotion result shapes.

## Failure Mode

- Ad hoc workflow promotion metadata fragments governance semantics and makes Observer/orchestration reasoning inconsistent.

## Contract fields

All workflow promotion receipts use one normalized shape:

- `workflow_kind`: stable workflow/artifact family label.
- `candidate_artifact_path`: staged candidate location.
- `committed_target_path`: committed destination path.
- `validation_status`: `passed | blocked`.
- `promotion_status`: `promoted | blocked`.
- `blocked_reason`: deterministic validation/promotion block summary when present.
- `error_summary`: compact error mirror for automation consumers.
- `committed_state_preserved`: whether prior committed state stayed intact.
- `generated_at`: promotion receipt timestamp aligned to the workflow artifact timestamp when available.
- `summary`: short deterministic outcome sentence.

The schema also requires `schemaVersion` (`"1.0"`) and `kind` (`"workflow-promotion"`); every field listed here is required to be present (`blocked_reason` is `string | null`, so "when present" means non-null). Backward-compatible aliases remain part of the shared contract (also required by the schema) where older command surfaces already exposed them:

- `staged_generation`
- `staged_artifact_path`
- `validation_passed`
- `promoted`

## Current usage

Use this contract for workflow outputs that write committed `.playbook/` state and need inspectable staged candidates.

Current adopters (`packages/cli/src/lib/workflowPromotion.ts` is imported by `status`, `route`, `promote`, `story`, `execution/receiptIngest`, and `observer`):

- `pnpm playbook status updated --json`
- `pnpm playbook route --json`
- `pnpm playbook promote` and `pnpm playbook story` (also use the shared helper; UNVERIFIED which of their outputs embed the receipt)

Both workflows now write a staged candidate first, keep the staged artifact inspectable, and return the same promotion metadata shape in JSON output.
