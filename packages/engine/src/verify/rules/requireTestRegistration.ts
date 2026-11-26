import fs from 'node:fs';
import path from 'node:path';
import { matchesAny } from '../../util/globs.js';
import type { ReportFailure } from '../../report/types.js';
import type { ChangedFileStatus } from '../../git/diff.js';

export type RequireTestRegistrationRule = {
  tests: string[];
  registries: string[];
  covered?: string[];
};

// A match only counts when the character before it cannot continue a longer path
// (so `xtests/a.test.ts` or `sub/tests/a.test.ts` never registers `tests/a.test.ts`).
const PATH_CHARACTER = /[A-Za-z0-9_./-]/;

const listsPath = (text: string, filePath: string): boolean => {
  for (let index = text.indexOf(filePath); index !== -1; index = text.indexOf(filePath, index + 1)) {
    if (index === 0 || !PATH_CHARACTER.test(text.charAt(index - 1))) return true;
  }
  return false;
};

/** Text of each registry file; a directory contributes every file directly inside it, sorted. Missing paths are skipped. */
const readRegistryTexts = (repoRoot: string, registries: string[]): string[] => {
  const texts: string[] = [];
  for (const registry of registries) {
    const absolute = path.join(repoRoot, registry);
    if (!fs.existsSync(absolute)) continue;

    const stat = fs.statSync(absolute);
    if (stat.isFile()) {
      texts.push(fs.readFileSync(absolute, 'utf8'));
      continue;
    }
    if (!stat.isDirectory()) continue;

    const files = fs
      .readdirSync(absolute, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
    for (const file of files) texts.push(fs.readFileSync(path.join(absolute, file), 'utf8'));
  }
  return texts;
};

/**
 * A test file added in the diff (or renamed into the tests globs) must be listed in at least one CI
 * test list, unless a `covered` glob already runs its folder. Only additions are checked, so tests
 * that already exist unlisted are grandfathered. Registries are read from the working tree.
 * With no configured entry the check is a no-op, so repos that do not opt in see no change.
 */
export const requireTestRegistration = (
  repoRoot: string,
  changes: ChangedFileStatus[],
  rules: RequireTestRegistrationRule[]
): ReportFailure[] => {
  const failures: ReportFailure[] = [];

  for (const rule of rules) {
    if (!rule.tests.length) continue;
    const covered = rule.covered ?? [];

    const candidates = changes
      .filter((change) => change.status === 'A' || change.status === 'R')
      .map((change) => change.path)
      .filter((filePath) => matchesAny(filePath, rule.tests) && !matchesAny(filePath, covered));
    if (!candidates.length) continue;

    const registryTexts = readRegistryTexts(repoRoot, rule.registries);
    for (const filePath of candidates) {
      if (registryTexts.some((text) => listsPath(text, filePath))) continue;
      failures.push({
        id: 'requireTestRegistration',
        message: 'New test file is not listed in any CI test list, so CI would never run it.',
        evidence: filePath,
        fix: `Add ${filePath} to one of: ${rule.registries.join(', ')} (or cover its folder with a glob the config lists under "covered").`
      });
    }
  }

  return failures.sort((a, b) => (a.evidence ?? '').localeCompare(b.evidence ?? ''));
};
