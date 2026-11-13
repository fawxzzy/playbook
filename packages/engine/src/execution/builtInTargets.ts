/**
 * Files that built-in auto-fix rules write when the finding itself carries no `evidence` path.
 *
 * `PlanGenerator` declares these on the plan task's `file`, so a real `plan --json` carries write authority for the
 * file the handler will write (the change-scope bundle then lists it in `allowedFiles` and `apply` can verify the
 * write against it). Each entry must match the `filesChanged` the built-in handler reports; a test pins that.
 *
 * `PB014` is deliberately absent: it moves several root artifacts and has no single target (TM-GAP-15).
 */
export const BUILT_IN_WRITE_TARGETS: Readonly<Record<string, string>> = {
  'notes.missing': 'docs/PLAYBOOK_NOTES.md',
  'notes.empty': 'docs/PLAYBOOK_NOTES.md'
};
