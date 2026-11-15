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
