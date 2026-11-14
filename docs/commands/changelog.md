# `pnpm playbook changelog`

Generate, validate, and safely append deterministic WHAT/WHY changelog entries from a git range.

## Usage

- `pnpm playbook changelog generate --base HEAD~1 --format markdown`
- `pnpm playbook changelog generate --base HEAD~1 --format json`
- `pnpm playbook changelog validate --base origin/main --head HEAD --json`
- `pnpm playbook changelog append --base HEAD~1 --file docs/CHANGELOG.md --dry-run`

## Subcommands

- `generate`: collect the commits in `<base>..<head>`, classify them (path rules and commit-message signals), and render WHAT/WHY entries grouped by category. Markdown is the default; `--json` or `--format json` prints the structured entries. `--out <path>` also writes the output to a file.
- `validate`: generate the entries for the range and check changelog quality. Prints a `playbook-changelog-validation` result with `status` and `diagnostics`; exits `0` on `pass` and `1` otherwise.
- `append`: plan (and, without `--dry-run`, write) an insertion of the generated entries into a changelog file (`--file`, default `docs/CHANGELOG.md`). It exits `1` when the plan is `blocked` and `0` otherwise (including `skipped`).

## Options

- `--base <ref>`: required for every subcommand; missing it is an error (exit `1`).
- `--head <ref>`: defaults to `HEAD`.
- `--config <path>`: custom changelog config JSON. Without it the repository config `.playbook/changelog-config.json` is used when present, otherwise built-in defaults.
- `--include-unknown` / `--exclude-unknown`: force or suppress entries whose category could not be classified.
- `--fail-on-unknown`, `--require-changes`, `--low-confidence-threshold <0..1>`: validation strictness.
- `--version <version>`, `--date <YYYY-MM-DD>`: labels for the generated output (used by `append`).
- `--dry-run` (append only): print the planned content instead of writing it.

## Behavior notes

- Read-only except `generate --out` and a non-dry-run `append`.
- `append` refuses to write into Playbook-managed release notes: with the default target `docs/CHANGELOG.md` it reports `blocked` (`changelog.append.target.managed`, exit `1`) because that file holds managed `PLAYBOOK:CHANGELOG_RELEASE_NOTES` content and no safe generated seam exists. Use a non-managed target with `--file`.
- Repository CI: `.github/workflows/changelog.yml` runs `pnpm playbook changelog validate --base <resolved base> --head HEAD --json` and, on manual dispatch, `changelog generate`; it does not append to `docs/CHANGELOG.md`.
- Unsupported subcommands exit `1`; running `changelog` with no subcommand prints the usage and exits `1`.

See also: [`../CHANGELOG-GENERATOR.md`](../CHANGELOG-GENERATOR.md), [`release.md`](./release.md), [`../RELEASING.md`](../RELEASING.md).
