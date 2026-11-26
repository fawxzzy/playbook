# Verify rules

## `requireNotesOnChanges`

This rule enforces that when application code paths change, `docs/PLAYBOOK_NOTES.md` must be updated in the same change.

Code paths checked by default:

- `src/**`
- `app/**`
- `server/**`
- `supabase/**`

## Example failure output

```text
✖ Verification failed
Base: origin/main

[requireNotesOnChanges] Code changes require a notes update.
Evidence: src/foo.ts
Fix: Update docs/PLAYBOOK_NOTES.md with a note describing WHAT changed and WHY.
```

## `migrationsAppendOnly`

Opt-in rule that keeps applied migrations immutable. Within the configured globs a change may only **add** files; a modified, renamed or deleted file fails verification. A rename counts as removing the base path, so renaming an applied migration fails, while renaming a file into the migration folder is an addition.

It is off by default (`verify.rules.migrationsAppendOnly` defaults to `[]`). Enable it in `playbook.config.json`:

```json
{
  "verify": {
    "rules": {
      "migrationsAppendOnly": [{ "globs": ["supabase/migrations/**/*.sql"] }]
    }
  }
}
```

The diff is the same `base..HEAD` range the other diff-based rules use (the resolved base, `origin/main` by default). With no resolved base the rule reports nothing. There is no escape hatch: ship the change as a new migration.

Example failure output:

```text
[migrationsAppendOnly] Applied migration supabase/migrations/20260101_init.sql was modified; create a new migration instead of editing an applied one.
Evidence: modified: supabase/migrations/20260101_init.sql
Fix: Revert the change to supabase/migrations/20260101_init.sql and create a new migration instead of editing an applied one.
```

## `generatedFilesInSync`

Opt-in rule that catches a committed generated file left stale. Each entry names generator `inputs` and generated `outputs` (globs). When at least one changed file matches `inputs` and no changed file matches `outputs`, the entry fails once. Any change counts (added, modified, deleted), and a rename counts by both its old and its new path. A file that matches both lists counts as an output. The rule never runs the generator; it only reads the diff.

**Limit: only switch it on for generators whose output changes whenever an input changes**, for example an output that embeds a hash of its inputs. For any other generator, an input edit that leaves the output identical (a comment, whitespace, a field the generator ignores) fails anyway, and there is no escape hatch to silence it.

It is off by default (`verify.rules.generatedFilesInSync` defaults to `[]`). Enable it in `playbook.config.json`:

```json
{
  "verify": {
    "rules": {
      "generatedFilesInSync": [
        {
          "inputs": ["docs/roadmap/ROADMAP.json"],
          "outputs": ["exports/project-board.json"],
          "regenerate": "pnpm board:export"
        }
      ]
    }
  }
}
```

`regenerate` is optional; when set, the fix names that command. The diff is the same `base..HEAD` range the other diff-based rules use. With no entries or no resolved base the rule reports nothing and makes no git call.

Example failure output:

```text
[generatedFilesInSync] Generator input changed but the generated file was not regenerated: exports/project-board.json
Evidence: docs/roadmap/ROADMAP.json
Fix: Run: pnpm board:export
```

Without `regenerate` the fix reads `Regenerate exports/project-board.json and commit the result.`

## `requireTestRegistration`

Opt-in rule for repos whose CI runs an explicit list of test files: a new test that is not on any list would never run. Each entry names `tests` (globs for test files), `registries` (repo-relative paths of the files that list tests, such as `package.json` or a workflow) and optional `covered` globs (folders CI already runs as a whole).

A test file added in the diff, or renamed into the `tests` globs (the new path is checked), that matches no `covered` glob must appear in the text of at least one registry file. The match is the file's repo-relative path with forward slashes, found literally, and the character before it must not be a letter, digit, `_`, `.`, `/` or `-`, so `xtests/a.test.ts` or `sub/tests/a.test.ts` does not count for `tests/a.test.ts` (and neither does `./tests/a.test.ts`). A registry that is a directory means every file directly inside it (not subfolders). Registries are read from the working tree; a missing registry is skipped.

Only added files are checked, so tests that already exist without being listed are left alone; modified and deleted files never fail. The rule never runs any command.

It is off by default (`verify.rules.requireTestRegistration` defaults to `[]`). Enable it in `playbook.config.json`:

```json
{
  "verify": {
    "rules": {
      "requireTestRegistration": [
        {
          "tests": ["tests/**/*.test.mjs"],
          "registries": ["package.json", ".github/workflows"],
          "covered": ["tests/unit/**"]
        }
      ]
    }
  }
}
```

With no entries or no resolved base the rule reports nothing and makes no git call.

Example failure output:

```text
[requireTestRegistration] New test file is not listed in any CI test list, so CI would never run it.
Evidence: tests/new-feature.test.mjs
Fix: Add tests/new-feature.test.mjs to one of: package.json, .github/workflows (or cover its folder with a glob the config lists under "covered").
```

## `verify.rule.tests.required`

This rule enforces test coverage for newly added CLI command modules and verify-rule modules.

Validation behavior:

- New command module at `packages/cli/src/commands/<command>.ts` requires `packages/cli/src/commands/<command>.test.ts`
- New verify rule at `packages/engine/src/verify/rules/<rule>.ts` requires `packages/engine/test/<rule>.test.ts`

Example failure output:

```text
[verify.rule.tests.required] Missing test file for command: plan
Evidence: packages/cli/src/commands/plan.ts
Fix: Create packages/cli/src/commands/plan.test.ts
```
