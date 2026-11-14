# `pnpm playbook init`

Scaffold the installable Playbook templates and default governance into the current repository.

## Usage

- `pnpm playbook init`
- `pnpm playbook init --force`
- `pnpm playbook init --json`

## Behavior

- Writes the files from `templates/repo` (copied into `packages/cli/dist/templates/repo` at build time) into the target repository (the current directory, or `--repo <path>`). It exits `0`.
- Existing files are left untouched and reported as skipped; `--force` overwrites them (reported as overwritten).
- Output lists `Created:`, overwritten and `Skipped:` paths, then next steps: `pnpm playbook status`, `pnpm playbook fix`, `pnpm playbook verify`. With `--json` the same paths appear as `info` findings in the standard result envelope. `--quiet` and `--ci` suppress the text output.

## Scaffolded files

- Config and docs: `playbook.config.json`, `docs/PLAYBOOK_NOTES.md`, `docs/ARCHITECTURE.md`, `docs/PLAYBOOK_CHECKLIST.md`, `docs/PROJECT_GOVERNANCE.md`, `docs/architecture/PLAYBOOK_ARCHITECTURE_DECISION_TEMPLATE.md`, `docs/postmortems/PLAYBOOK_POSTMORTEM_TEMPLATE.md`.
- Playbook state and workflows: `.playbook/.gitignore`, `.playbook/managed-surfaces.json`, `.github/workflows/playbook-ci.yml`, `.github/workflows/playbook-verify.yml`.
- Layout: `Playbook/README.md`, `Playbook/doctrine/README.md`, `Playbook/rules/README.md`, and a sub-app truth-pack template under `subapps/_truth-pack-template/`.

## Release governance seeding

`.playbook/version-policy.json`, `.github/workflows/release-prep.yml` and `docs/CHANGELOG.md` (with the managed `PLAYBOOK:CHANGELOG_RELEASE_NOTES` block) are installed only for eligible repositories: the repo uses pnpm (`packageManager` starts with `pnpm@`, or `pnpm-lock.yaml` / `pnpm-workspace.yaml` exists) and contains publishable Node packages. In other repositories those three files are skipped. Use [`upgrade`](./upgrade.md) to retrofit managed surfaces later.

See also: [`status.md`](./status.md), [`doctor.md`](./doctor.md), [`../REFERENCE/config.md`](../REFERENCE/config.md).
