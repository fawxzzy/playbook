import { matchesAny } from '../../util/globs.js';
import type { ReportFailure } from '../../report/types.js';
import type { ChangedFileStatus } from '../../git/diff.js';

export type MigrationsAppendOnlyRule = {
  globs: string[];
};

const STATUS_LABEL: Record<'M' | 'D' | 'R', string> = {
  M: 'modified',
  D: 'deleted',
  R: 'renamed'
};

/**
 * Applied migrations are append-only: inside the configured globs a PR may only add files.
 * Modified, deleted and renamed files (a rename removes the base path) are failures.
 * With no configured rule the check is a no-op, so repos that do not opt in see no change.
 */
export const migrationsAppendOnly = (
  changes: ChangedFileStatus[],
  rules: MigrationsAppendOnlyRule[]
): ReportFailure[] => {
  const failures: ReportFailure[] = [];
  const reported = new Set<string>();

  for (const rule of rules) {
    if (!rule.globs.length) continue;

    for (const change of changes) {
      if (change.status === 'A') continue;

      // For a rename the file that existed at the base is the old path.
      const baseFile = change.status === 'R' ? change.oldPath ?? change.path : change.path;
      if (!matchesAny(baseFile, rule.globs)) continue;

      const key = `${change.status}:${baseFile}`;
      if (reported.has(key)) continue;
      reported.add(key);

      const label = STATUS_LABEL[change.status];
      failures.push({
        id: 'migrationsAppendOnly',
        message: `Applied migration ${baseFile} was ${label}; create a new migration instead of editing an applied one.`,
        evidence: change.status === 'R' ? `${label}: ${baseFile} -> ${change.path}` : `${label}: ${baseFile}`,
        fix: `Revert the change to ${baseFile} and create a new migration instead of editing an applied one.`
      });
    }
  }

  return failures.sort((a, b) => (a.evidence ?? '').localeCompare(b.evidence ?? ''));
};
