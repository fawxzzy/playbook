# `pnpm playbook ignore`

Suggest and safely apply ranked `.playbookignore` recommendations from Playbook runtime artifacts.

## Usage

- `pnpm playbook --repo "<target-repo-path>" ignore suggest --json`
- `pnpm playbook --repo "<target-repo-path>" ignore apply --safe-defaults`
- `pnpm playbook --repo "<target-repo-path>" ignore apply --safe-defaults --json`

`--repo` is a global option and must appear before the command name. Placed after `ignore`, it is ignored and the command runs against the current working directory. Omit it to target the current directory.

## Behavior

`ignore suggest` reads `.playbook/runtime/current/ignore-recommendations.json` (written when any Playbook command finishes in the target repository, for example `pnpm playbook --repo "<target-repo-path>" index` or `pnpm playbook pilot --repo "<target-repo-path>"`; the command fails if it is missing) and reports:

- ranked recommendations
- safety level
- rationale
- expected scan impact
- whether each recommendation is already covered by `.playbookignore`

`ignore apply --safe-defaults`:

- creates `.playbookignore` when needed
- preserves user-authored lines outside the managed block
- writes only missing `safe-default` entries
- keeps `likely-safe` and `review-first` recommendations in suggestion-only output
- avoids duplicate entries across user content and the managed block
- rewrites the managed block deterministically so reruns are idempotent
- records outcome telemetry to `.playbook/runtime/current/ignore-apply.json` and `.playbook/runtime/cycles/<cycle_id>/ignore-apply.json` with explicit fields:
  - `applied_count`
  - `already_present_count`
  - `safe_default_deferred_count`
  - `review_first_count`
  - `applied_paths`
  - `already_present_paths`
  - `safe_default_deferred_paths`
  - `review_first_paths`
- retains compact historical rollups in `.playbook/runtime/history/ignore-apply-stats.json` (`*_total` and `last_*` fields), updated only when the apply changed `.playbookignore`
- keeps compatibility aliases for existing artifact readers:
  - `deferred_count` (legacy, now mirrors `review_first_count`)
  - `deferred_paths` (legacy, now mirrors `review_first_paths`)

`ignore apply` without `--safe-defaults` exits `1` (only safe-default recommendations are ever auto-applied), as does an unknown subcommand; `ignore` with no subcommand prints usage and exits `1`. `ignore suggest` and `ignore apply --safe-defaults` exit `0`.

Managed block format:

- start marker: `# PLAYBOOK:IGNORE_START`
- end marker: `# PLAYBOOK:IGNORE_END`

Rule - Apply Only Trusted Ignore Recommendations.

Pattern - Recommendation Before Application, Safe Defaults Before Review.

Failure Mode - Auto-Applying Ambiguous Ignores.

Failure Mode - Non-Idempotent Ignore Management.
