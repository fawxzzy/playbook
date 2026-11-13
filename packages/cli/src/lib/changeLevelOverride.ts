/**
 * `playbook apply --allow-level 3 --reason "<text>"`: explicit, recorded authorization to apply tasks above the
 * default change-level ceiling (Level 2). Both flags are required together; only Level 3 can be allowed.
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
  if (reason.length === 0) {
    throw new Error('The --reason flag must be a non-empty explanation recorded with the Level 3 override.');
  }
  if (reason.length > MAX_OVERRIDE_REASON_LENGTH) {
    throw new Error(`The --reason flag must be at most ${MAX_OVERRIDE_REASON_LENGTH} characters.`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(reason)) {
    throw new Error('The --reason flag must be a single line without control characters.');
  }

  return { allowLevel: 3, reason };
};
