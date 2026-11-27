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

// A match only counts as the whole path: the text around it must not continue a longer one
// (so `xtests/a.test.ts`, `sub/tests/a.test.ts`, `tests/a.test.tsx` or `tests/a.test.ts.snap`
// never registers `tests/a.test.ts`). A leading `./` is the same repo-relative path and counts.
const PATH_CHARACTER = /[A-Za-z0-9_./-]/;
const NAME_CHARACTER = /[A-Za-z0-9_/-]/;

const startsPath = (text: string, index: number): boolean => {
  if (index === 0 || !PATH_CHARACTER.test(text.charAt(index - 1))) return true;
  if (text.charAt(index - 1) !== '/' || text.charAt(index - 2) !== '.') return false;
  return index === 2 || !PATH_CHARACTER.test(text.charAt(index - 3));
};

// A trailing `.` only continues the path when a name follows it (`.snap`), not as sentence punctuation.
const endsPath = (text: string, end: number): boolean => {
  const next = text.charAt(end);
  if (next === '') return true;
  if (next === '.') return !NAME_CHARACTER.test(text.charAt(end + 1));
  return !NAME_CHARACTER.test(next);
};

const listsPath = (text: string, filePath: string): boolean => {
  for (let index = text.indexOf(filePath); index !== -1; index = text.indexOf(filePath, index + 1)) {
    if (startsPath(text, index) && endsPath(text, index + filePath.length)) return true;
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
    // The config is not schema-validated, so a hand-written entry may miss a key: treat it as empty.
    const tests = rule.tests ?? [];
    const registries = rule.registries ?? [];
    const covered = rule.covered ?? [];
    if (!tests.length) continue;

    const candidates = changes
      .filter((change) => change.status === 'A' || change.status === 'R')
      .map((change) => change.path)
      .filter((filePath) => matchesAny(filePath, tests) && !matchesAny(filePath, covered));
    if (!candidates.length) continue;

    const registryTexts = readRegistryTexts(repoRoot, registries);
    if (!registryTexts.length) {
      // No list could be read at all: that is a wrong path in the config, not an unlisted test.
      failures.push({
        id: 'requireTestRegistration',
        message: 'None of the configured CI test lists exists, so new test files cannot be checked.',
        evidence: registries.join(', '),
        fix: 'Correct "registries" in verify.rules.requireTestRegistration so it names the files that list the CI tests.'
      });
      continue;
    }

    for (const filePath of candidates) {
      if (registryTexts.some((text) => listsPath(text, filePath))) continue;
      failures.push({
        id: 'requireTestRegistration',
        message: 'New test file is not listed in any CI test list, so CI would never run it.',
        evidence: filePath,
        fix: `Add ${filePath} to one of: ${registries.join(', ')} (or cover its folder with a glob the config lists under "covered").`
      });
    }
  }

  return failures.sort((a, b) => (a.evidence ?? '').localeCompare(b.evidence ?? ''));
};
