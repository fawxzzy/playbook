import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/schema.js';
import type { ChangedFileStatus } from '../src/git/diff.js';
import { getCoreRules } from '../src/rules/coreRules.js';
import { requireTestRegistration } from '../src/verify/rules/requireTestRegistration.js';

const write = (root: string, rel: string, content: string): void => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
};

const makeRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-require-test-registration-'));

const entry = {
  tests: ['tests/**/*.test.ts'],
  registries: ['package.json', 'scripts/ci-tests.txt']
};

const added = (filePath: string): ChangedFileStatus => ({ status: 'A', path: filePath });

const expectedFailure = (filePath: string, registries: string[]) => ({
  id: 'requireTestRegistration',
  message: 'New test file is not listed in any CI test list, so CI would never run it.',
  evidence: filePath,
  fix: `Add ${filePath} to one of: ${registries.join(', ')} (or cover its folder with a glob the config lists under "covered").`
});

describe('requireTestRegistration', () => {
  it('passes an added test that a registry lists', () => {
    const root = makeRoot();
    write(root, 'package.json', '{ "scripts": { "test": "vitest run tests/a.test.ts" } }\n');
    expect(requireTestRegistration(root, [added('tests/a.test.ts')], [entry])).toEqual([]);
  });

  it('fails an added test that no registry lists', () => {
    const root = makeRoot();
    write(root, 'package.json', '{ "scripts": { "test": "vitest run tests/a.test.ts" } }\n');
    expect(requireTestRegistration(root, [added('tests/b.test.ts')], [entry])).toEqual([
      expectedFailure('tests/b.test.ts', entry.registries)
    ]);
  });

  it('passes an added test under a covered glob', () => {
    const root = makeRoot();
    write(root, 'package.json', '{}\n');
    const covered = { ...entry, covered: ['tests/unit/**'] };
    expect(requireTestRegistration(root, [added('tests/unit/a.test.ts')], [covered])).toEqual([]);
    expect(requireTestRegistration(root, [added('tests/e2e/a.test.ts')], [covered])).toEqual([
      expectedFailure('tests/e2e/a.test.ts', entry.registries)
    ]);
  });

  it('never fails modified or deleted tests, so existing unlisted tests are grandfathered', () => {
    const root = makeRoot();
    write(root, 'package.json', '{}\n');
    const changes: ChangedFileStatus[] = [
      { status: 'M', path: 'tests/old.test.ts' },
      { status: 'D', path: 'tests/gone.test.ts' },
      { status: 'R', path: 'archive/moved.test.ts', oldPath: 'tests/moved.test.ts' }
    ];
    expect(requireTestRegistration(root, changes, [entry])).toEqual([]);
  });

  it('ignores added files outside the tests glob', () => {
    const root = makeRoot();
    write(root, 'package.json', '{}\n');
    expect(requireTestRegistration(root, [added('src/a.ts'), added('tests/helper.ts')], [entry])).toEqual([]);
  });

  it('reads every file directly inside a directory registry, non-recursively', () => {
    const root = makeRoot();
    write(root, '.github/workflows/ci.yml', 'run: node --test tests/a.test.ts\n');
    write(root, '.github/workflows/nested/deep.yml', 'run: node --test tests/b.test.ts\n');
    const dirEntry = { tests: ['tests/**/*.test.ts'], registries: ['.github/workflows'] };
    expect(requireTestRegistration(root, [added('tests/a.test.ts')], [dirEntry])).toEqual([]);
    expect(requireTestRegistration(root, [added('tests/b.test.ts')], [dirEntry])).toEqual([
      expectedFailure('tests/b.test.ts', ['.github/workflows'])
    ]);
  });

  it('skips a missing registry and still reads the others', () => {
    const root = makeRoot();
    write(root, 'scripts/ci-tests.txt', 'tests/a.test.ts\n');
    expect(requireTestRegistration(root, [added('tests/a.test.ts')], [entry])).toEqual([]);

  });

  it('reports a wrong config once when none of the registries exists', () => {
    const emptyRoot = makeRoot();
    expect(requireTestRegistration(emptyRoot, [added('tests/a.test.ts'), added('tests/b.test.ts')], [entry])).toEqual([
      {
        id: 'requireTestRegistration',
        message: 'None of the configured CI test lists exists, so new test files cannot be checked.',
        evidence: 'package.json, scripts/ci-tests.txt',
        fix: 'Correct "registries" in verify.rules.requireTestRegistration so it names the files that list the CI tests.'
      }
    ]);
    // Nothing to check means nothing to report, even with a wrong registry path.
    expect(requireTestRegistration(emptyRoot, [added('src/a.ts')], [entry])).toEqual([]);
  });

  it('treats an entry with a missing key as empty instead of throwing', () => {
    const root = makeRoot();
    write(root, 'package.json', '{}\n');
    const noTests = { registries: ['package.json'] } as unknown as typeof entry;
    const noRegistries = { tests: ['tests/**/*.test.ts'] } as unknown as typeof entry;
    expect(requireTestRegistration(root, [added('tests/a.test.ts')], [noTests])).toEqual([]);
    expect(requireTestRegistration(root, [added('tests/a.test.ts')], [noRegistries]).map((failure) => failure.message)).toEqual([
      'None of the configured CI test lists exists, so new test files cannot be checked.'
    ]);
  });

  it('checks the new path of a rename into the tests glob', () => {
    const root = makeRoot();
    write(root, 'package.json', '{}\n');
    const renamedIn: ChangedFileStatus = { status: 'R', path: 'tests/moved.test.ts', oldPath: 'drafts/moved.test.ts' };
    expect(requireTestRegistration(root, [renamedIn], [entry])).toEqual([expectedFailure('tests/moved.test.ts', entry.registries)]);

    write(root, 'package.json', '"tests/moved.test.ts"\n');
    expect(requireTestRegistration(root, [renamedIn], [entry])).toEqual([]);
  });

  it('matches the path exactly, not as part of a longer path', () => {
    const root = makeRoot();
    write(root, 'package.json', 'xtests/a.test.ts sub/tests/a.test.ts my_tests/a.test.ts ../tests/b.test.ts x./tests/b.test.ts\n');
    expect(requireTestRegistration(root, [added('tests/a.test.ts')], [entry])).toEqual([
      expectedFailure('tests/a.test.ts', entry.registries)
    ]);
    expect(requireTestRegistration(root, [added('tests/aa.test.ts')], [entry])).toEqual([
      expectedFailure('tests/aa.test.ts', entry.registries)
    ]);
    expect(requireTestRegistration(root, [added('tests/b.test.ts')], [entry])).toEqual([
      expectedFailure('tests/b.test.ts', entry.registries)
    ]);

    // The text after the match must not continue a longer path either.
    write(root, 'package.json', 'tests/a.test.tsx tests/a.test.ts.snap tests/a.test.ts-old tests/a.test.ts/x tests/a.test.ts_2\n');
    expect(requireTestRegistration(root, [added('tests/a.test.ts')], [entry])).toEqual([
      expectedFailure('tests/a.test.ts', entry.registries)
    ]);

    // A leading "./" is the same repo-relative path; sentence punctuation after the path is fine.
    for (const text of ['node --test ./tests/a.test.ts\n', './tests/a.test.ts', '"./tests/a.test.ts"', 'run tests/a.test.ts.\n', 'tests/a.test.ts, tests/b.test.ts', 'tests/a.test.ts']) {
      write(root, 'package.json', text);
      expect(requireTestRegistration(root, [added('tests/a.test.ts')], [entry])).toEqual([]);
    }

    write(root, 'package.json', 'xtests/a.test.ts "tests/a.test.ts"\n');
    expect(requireTestRegistration(root, [added('tests/a.test.ts')], [entry])).toEqual([]);

    write(root, 'package.json', 'tests/a.test.ts\n');
    expect(requireTestRegistration(root, [added('tests/a.test.ts')], [entry])).toEqual([]);
  });

  it('sorts failures by evidence', () => {
    const root = makeRoot();
    write(root, 'package.json', '{}\n');
    const failures = requireTestRegistration(root, [added('tests/z.test.ts'), added('tests/a.test.ts')], [entry]);
    expect(failures.map((failure) => failure.evidence)).toEqual(['tests/a.test.ts', 'tests/z.test.ts']);
  });

  it('is a no-op with no configured entries', () => {
    expect(requireTestRegistration(makeRoot(), [added('tests/a.test.ts')], [])).toEqual([]);
  });

  it('is off by default', () => {
    expect(defaultConfig.verify.rules.requireTestRegistration).toEqual([]);
  });
});

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

describe('requireTestRegistration core rule against a real git diff', () => {
  it('fails an unlisted new test when configured and stays silent when not', () => {
    const root = makeRoot();
    git(root, 'init', '-q');
    write(root, 'package.json', '{ "scripts": { "test": "vitest run tests/old.test.ts" } }\n');
    write(root, 'tests/old.test.ts', 'old\n');
    write(root, 'tests/unlisted-old.test.ts', 'unlisted but grandfathered\n');
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'base');
    const baseSha = git(root, 'rev-parse', 'HEAD').trim();
    write(root, 'tests/new.test.ts', 'new\n');
    write(root, 'tests/unlisted-old.test.ts', 'edited\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'add test');

    const configured = {
      ...defaultConfig,
      verify: { ...defaultConfig.verify, rules: { ...defaultConfig.verify.rules, requireTestRegistration: [entry] } }
    };
    const find = (config: typeof defaultConfig) => getCoreRules(config).find((rule) => rule.id === 'requireTestRegistration')!;

    expect(find(configured).check({ repoRoot: root, changedFiles: [], baseSha }).failures).toEqual([
      expectedFailure('tests/new.test.ts', entry.registries)
    ]);
    expect(find(defaultConfig).check({ repoRoot: root, changedFiles: [], baseSha }).failures).toEqual([]);
    expect(find(configured).check({ repoRoot: root, changedFiles: [] }).failures).toEqual([]);
  });

  it('makes no git call when unconfigured or without a diff base', () => {
    const notARepo = path.join(os.tmpdir(), 'playbook-require-test-registration-missing-dir');
    const configured = {
      ...defaultConfig,
      verify: { ...defaultConfig.verify, rules: { ...defaultConfig.verify.rules, requireTestRegistration: [entry] } }
    };
    const find = (config: typeof defaultConfig) => getCoreRules(config).find((rule) => rule.id === 'requireTestRegistration')!;
    expect(find(defaultConfig).check({ repoRoot: notARepo, changedFiles: [], baseSha: 'deadbeef' }).failures).toEqual([]);
    expect(find(configured).check({ repoRoot: notARepo, changedFiles: [] }).failures).toEqual([]);
  });
});
