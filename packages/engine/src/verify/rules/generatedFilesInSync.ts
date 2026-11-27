import { matchesAny } from '../../util/globs.js';
import type { ReportFailure } from '../../report/types.js';
import type { ChangedFileStatus } from '../../git/diff.js';

export type GeneratedFilesInSyncRule = {
  inputs: string[];
  outputs: string[];
  regenerate?: string;
};

/**
 * A generated file must be regenerated in the same diff as its generator inputs: when a changed file
 * matches `inputs` and no changed file matches `outputs`, the entry fails once. A rename counts by both
 * its old and its new path, and a path that matches both lists counts as an output.
 * With no configured entry the check is a no-op, so repos that do not opt in see no change.
 */
export const generatedFilesInSync = (
  changes: ChangedFileStatus[],
  rules: GeneratedFilesInSyncRule[]
): ReportFailure[] => {
  const changedPaths = new Set<string>();
  for (const change of changes) {
    changedPaths.add(change.path);
    if (change.oldPath) changedPaths.add(change.oldPath);
  }

  const failures: ReportFailure[] = [];

  for (const rule of rules) {
    // The config is not schema-validated, so a hand-written entry may miss a key: treat it as empty.
    const inputGlobs = rule.inputs ?? [];
    const outputGlobs = rule.outputs ?? [];
    if (!inputGlobs.length || !outputGlobs.length) continue;

    let outputChanged = false;
    const changedInputs: string[] = [];
    for (const changedPath of changedPaths) {
      if (matchesAny(changedPath, outputGlobs)) {
        outputChanged = true;
        break;
      }
      if (matchesAny(changedPath, inputGlobs)) changedInputs.push(changedPath);
    }

    if (outputChanged || !changedInputs.length) continue;

    const outputs = outputGlobs.join(', ');
    failures.push({
      id: 'generatedFilesInSync',
      message: `Generator input changed but the generated file was not regenerated: ${outputs}`,
      evidence: changedInputs.sort((a, b) => a.localeCompare(b)).join(', '),
      fix: rule.regenerate ? `Run: ${rule.regenerate}` : `Regenerate ${outputs} and commit the result.`
    });
  }

  return failures.sort((a, b) => (a.evidence ?? '').localeCompare(b.evidence ?? ''));
};
