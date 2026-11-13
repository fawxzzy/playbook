/**
 * `playbook apply --allow-level 3 --reason "<text>"`: explicit, recorded authorization to apply tasks above the
 * default change-level ceiling (Level 2). Both flags are required together; only Level 3 can be allowed.
 *
 * The reason rules mirror `normalizeOverrideReason` in the engine (packages/engine/src/execution/changeLevel.ts),
 * which library callers hit directly; both are covered by the same adversarial inputs in their tests.
 */
export type ChangeLevelOverride = {
  allowLevel: 3;
  reason: string;
};

export const MAX_OVERRIDE_REASON_LENGTH = 400;

type RawOverrideFlags = {
  allowLevel?: string | number;
  reason?: string;
};

export const parseChangeLevelOverride = (flags: RawOverrideFlags): ChangeLevelOverride | null => {
  const hasLevel = flags.allowLevel !== undefined;
  const hasReason = flags.reason !== undefined;

  if (!hasLevel && !hasReason) {
    return null;
  }

  if (hasLevel !== hasReason) {
    throw new Error('The --allow-level and --reason flags must be provided together (for example: --allow-level 3 --reason "<why>").');
  }

  if (String(flags.allowLevel).trim() !== '3') {
    throw new Error('The --allow-level flag only accepts 3. Level 1 and 2 tasks already run by default; Level 3 requires explicit review.');
  }

  const reason = (flags.reason ?? '').trim();
  if (!/[\p{L}\p{N}\p{P}\p{S}]/u.test(reason)) {
    throw new Error('The --reason flag must contain at least one visible letter, number, punctuation, or symbol character recorded with the Level 3 override.');
  }
  if (reason.length > MAX_OVERRIDE_REASON_LENGTH) {
    throw new Error(`The --reason flag must be at most ${MAX_OVERRIDE_REASON_LENGTH} characters.`);
  }
  if (/[\p{C}\p{Zl}\p{Zp}\u115F\u1160\u3164\uFFA0\u2800\u17B4\u17B5\u034F]/u.test(reason)) {
    throw new Error(
      'The --reason flag must be a single line without control, format (bidi override, zero-width), separator, unassigned, private-use, or invisible filler characters.'
    );
  }
  if (/(?:^|\s)\p{M}/u.test(reason)) {
    throw new Error('The --reason flag must not contain a combining mark without a base character.');
  }

  return { allowLevel: 3, reason };
};

/**
 * Extract `--allow-level` / `--reason` from raw command args. Supports both `--flag value` and `--flag=value`.
 * Errors (rather than guessing) on a missing value (the next token is absent or another `--option`, so
 * `--reason --task t` never swallows `--task`), and on a duplicated flag.
 */
export const parseOverrideArgs = (commandArgs: readonly string[]): { allowLevel?: string; reason?: string } => {
  const read = (name: string): string | undefined => {
    let found: string | undefined;
    let count = 0;
    for (let index = 0; index < commandArgs.length; index += 1) {
      const token = commandArgs[index] ?? '';
      if (token === name) {
        count += 1;
        const next = commandArgs[index + 1];
        if (next === undefined || next.startsWith('--')) {
          throw new Error(`The ${name} flag requires a value (for example: ${name} ${name === '--allow-level' ? '3' : '"<why>"'}).`);
        }
        found = next;
      } else if (token.startsWith(`${name}=`)) {
        count += 1;
        found = token.slice(name.length + 1);
      }
    }
    if (count > 1) {
      throw new Error(`The ${name} flag was provided ${count} times; provide it exactly once.`);
    }
    return found;
  };

  const allowLevel = read('--allow-level');
  const reason = read('--reason');
  return {
    ...(allowLevel !== undefined ? { allowLevel } : {}),
    ...(reason !== undefined ? { reason } : {})
  };
};
