# Demo and Onboarding

## Purpose

`playbook-demo` is the official fast onboarding repository artifact for first-run adoption.

Goal: let developers quickly experience deterministic repository intelligence and reviewed remediation in a stable, low-setup environment.

## Adoption role

The demo repo is part of product adoption strategy:

- shortens time-to-value for new users
- provides a stable walkthrough for docs/videos/live demos
- gives contributors and AI agents a known-good environment for examples

## Current status

`playbook-demo` (https://github.com/fawxzzy/playbook-demo) is an active product artifact and is exposed directly through `pnpm playbook demo` (deterministic text/JSON onboarding contract). The command is read-only: it prints the clone URL, the workflow steps and the expected before/after outcome (`--json` emits `schemaVersion`, `repository`, `workflow`, `expectedInitialFindings`, `demonstrates` and `summary`) and does not clone or run anything itself. Its printed `verify` steps omit `--json`, and it omits `ask`, so it is a shorter form of the ladder below.

## Canonical serious-user ladder

Use the demo to practice the same operating ladder used in real repositories:

```bash
pnpm playbook ai-context --json
pnpm playbook ai-contract --json
pnpm playbook context --json
pnpm playbook index --json
pnpm playbook query modules --json
pnpm playbook explain architecture --json
pnpm playbook ask "where should a new feature live?" --repo-context --json
pnpm playbook verify --json
pnpm playbook plan --json --out .playbook/plan.json
pnpm playbook apply --from-plan .playbook/plan.json
pnpm playbook verify --json
```

The `pnpm playbook ...` form above is a root script of the Playbook repository (it is not published to npm yet), and the demo repository does not define a `playbook` script. Run the ladder from a built Playbook checkout (`pnpm install && pnpm build`) and point it at a local clone of the demo with the global `--repo` option, for example `pnpm playbook --repo ../playbook-demo verify --json`; `--out` and `--from-plan` paths then resolve inside the demo repository. See [README.md](../README.md), "Install status".

What the demo repository itself provides (checked against `fawxzzy/playbook-demo` `main` and Playbook 0.66.0 on 2026-11-14):

- It is an npm project with no dependencies (`package-lock.json`, no pnpm lockfile), so the `pnpm install` step printed by `pnpm playbook demo` has nothing to install. Its README documents `npx @fawxzzy/playbook ...` commands, which do not work yet because the Playbook packages are not published to npm.
- It bundles a small CLI (`dist/cli.js`, run through `npm run verify`, `npm run plan` and `npm run apply`) that implements only `analyze`, `index`, `explain`, `rules`, `verify`, `plan`, `apply`, `diagram` and `doctor`. It has no `ai-context`, `ai-contract`, `context`, `query` or `ask`.
- The fail-first before/after story comes from that bundled CLI: a fresh clone fails `verify` with four findings (PB002-PB005), `plan` lists four tasks, `apply` applies four safe remediations, and the final `verify` passes.
- With the Playbook CLI from this repository (run as described above), `ai-context`, `ai-contract`, `context`, `index`, `query`, `explain` and `ask --repo-context` all run against the demo, but `verify` passes with warnings only and does not reproduce PB002-PB005. Use the bundled CLI for the remediation walkthrough and this repository CLI for the intelligence steps.

`analyze` can still be used as a compatibility-friendly shortcut for lightweight stack inspection, but it is not the primary serious-user narrative.

## `ask --repo-context` question boundary contract

Supported question classes:

- repository-shape placement questions grounded in indexed modules
- architecture/dependency questions grounded in `.playbook/repo-index.json`
- impact/ownership questions grounded in deterministic Playbook artifacts

Unsupported/bounded question classes:

- broad non-repository Q&A
- speculative future commitments not represented in live contracts
- ad-hoc deep file crawling outside Playbook-generated intelligence artifacts

Deterministic fallback guidance:

- if index context is unavailable, run `pnpm playbook index --json` first
- if question scope is too broad, narrow to a deterministic `pnpm playbook query` or `pnpm playbook explain` target
- if `ask --repo-context` returns unsupported-question, keep the question within supported classes and retry with explicit repo target terms


## Rule: Demo Terminology Sync

Whenever the main product changes command framing, output language, or architecture positioning, revalidate the demo repository in the same phase or immediately after.

The demo README, scenario docs, and command wording should not lag behind the core product narrative.

## Pattern: demo as narrative surface

The demo repository is not just a testbed.

It is the fastest explanation of what Playbook is.

## Pattern: Product Demo Contract

A good demo repo should provide a stable before/after story:

- known initial findings
- clear educational meaning
- deterministic remediation
- verifiable clean end state

This keeps the demo useful as both an onboarding surface and a governance learning artifact.

## Rule: optimize for product clarity over command breadth

The demo repo is the product perception layer.

Design decisions in `playbook-demo` should prioritize explaining Playbook's value clearly, even if that means covering fewer commands in a single walkthrough.

## Pattern: deterministic intelligence + remediation loop

The core demo narrative should be intentionally sequenced:

1. `ai-context`, `ai-contract`, and `context` establish runtime/trust-layer context.
2. `index`, `query`, and `explain` establish deterministic repository intelligence.
3. `verify` confirms governance findings.
4. `plan` generates reviewed remediation tasks for those findings.
5. `apply` executes bounded tasks from the reviewed plan.
6. `verify` confirms the post-remediation end state.

All steps should describe the same small set of intentional issues so users can trust the flow from diagnosis to action.

## Pattern: model realistic architectural drift

Intentional demo issues should resemble real repository drift (for example, docs lagging after architectural changes), not random or artificial breakage.

This keeps outputs educational, credible, and easy to transfer to real repos.

## Failure mode: too many unrelated findings

If demo scenarios include too many unrelated issues, users cannot map diagnosis to remediation.

Keep scenarios narrow, explainable, and deterministic.
