# AI Agent Context

## Use diagrams before structural changes

When changing package layout or cross-package dependencies:

1. Run `pnpm -r build && pnpm playbook diagram --repo . --out docs/ARCHITECTURE_DIAGRAMS.md` for repo-internal execution.
2. Review `Structure` to understand folder/workspace containment.
3. Review `Dependencies` to avoid introducing unintended couplings.
4. Regenerate diagrams after architecture updates and commit the updated markdown.

This keeps architecture reasoning explicit and reproducible for agents working in this repository.

## Release & Distribution

### Install status: not published to npm yet

The scoped packages `@fawxzzy/playbook` (the CLI) and `@fawxzzy/playbook-cli` (the wrapper) are **not published to npm**: `npm view @fawxzzy/playbook` and `npm view @fawxzzy/playbook-cli` return 404 (checked 2026-11-14). No `npx @fawxzzy/playbook ...` or `npm install @fawxzzy/playbook` form works today. The working paths are:

- **A checkout of this repository**: `pnpm install && pnpm build`, then `pnpm playbook <command>`. `pnpm playbook` is a root script of this repository (`scripts/run-playbook.mjs` runs the built `packages/cli/dist/main.js`); it does not exist in other repositories. Use `--repo <path>` to point it at another local repository.
- **A consumer repository**: the GitHub release tarball `playbook-cli-<version>.tgz` (see [RELEASING.md](./RELEASING.md)). After `npm install --no-save <tarball url>` the repo-local binary is `node_modules/.bin/playbook`; run it from there, never through the unscoped `npx` form. The latest GitHub release as of 2026-11-14 is v0.54.1, older than the packages on `main` (0.66.0).

### Why `playbook` (unscoped) is not the npx target

- WHAT: Treat unscoped `playbook` as unavailable for onboarding commands.
- WHY: The unscoped npm package name is already taken (by an unrelated package), so `npx <unscoped package name> ...` cannot be the reliable install-free path.

### Preferred bootstrap (from a built checkout)

Run the canonical serious-user ladder from a built checkout of this repository:

```bash
pnpm playbook ai-context --json
pnpm playbook ai-contract --json
pnpm playbook context --json
pnpm playbook index --json
pnpm playbook query modules --json
pnpm playbook explain architecture --json
```

`analyze` remains available for compatibility and lightweight stack inspection, but it is no longer the primary serious-user bootstrap path.

Intended scoped-package invocation after the first npm publish (does **not** work today, see Install status above):

```bash
npx --yes -p @fawxzzy/playbook playbook ai-context --json
```

### Publishing notes

- WHAT: Publish scoped packages with explicit public access (`npm publish --access public`).
- WHY: Scoped npm packages default to private visibility and will not work for public `npx` onboarding unless published as public.

- WHAT: Do a manual first publish, then automate via a tag-triggered GitHub workflow.
- WHY: Validates package metadata and distribution behavior once before CI automation takes ownership.

Status: the tag-triggered workflow exists (`.github/workflows/publish-npm.yml`, tags `v*`; its npm publish steps only warn on failure and it always attaches the fallback tarball to the GitHub release), but nothing is on npm yet.

## Product state anchoring

Rule: **Product State Must Be Anchored**.

Pattern: **AI Anchor Drift**.

Whenever command/workflow state changes, update:

- `README.md`
- command reference docs
- demo docs/contracts
- `docs/CHANGELOG.md`

Canonical command ladder (declared in `docs/contracts/command-truth.json`): `ai-context`, `ai-contract`, `context`, `index`, `query`, `explain`, `ask`, `verify`, `plan`, `apply`. `analyze` and `fix` are compatibility commands.

Current product-facing command/artifact surface:

- `analyze`
- `verify`
- `rules`
- `doctor`
- `diagram`
- `plan`
- `apply`
- `playbook-demo` (via `pnpm playbook demo`)

If docs disagree with implementation, treat code as source of truth and realign docs.

## Internal CI command rule

- Rule: Repo-internal CI must execute the built CLI directly, not through `npx`.
- Pattern: Separate internal CLI execution (`pnpm playbook ...` from a built checkout, which runs `packages/cli/dist/main.js`) from consumer-install execution (the repo-local `node_modules/.bin/playbook` binary installed from the release tarball).
- Failure Mode: `npx could not determine executable to run` indicates package/bin resolution failure, not necessarily a command implementation bug.

## Documentation governance validation

When documentation, governance, or command-surface files change in the Playbook repository, run:

```bash
pnpm -r build
pnpm playbook docs audit --json
```

Pattern: AI working inside the Playbook repo should run docs audit alongside other branch-accurate local CLI validations.
