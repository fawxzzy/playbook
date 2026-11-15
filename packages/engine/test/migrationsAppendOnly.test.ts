import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/schema.js';
import { getChangedFileStatuses } from '../src/git/diff.js';
import { getCoreRules } from '../src/rules/coreRules.js';
import { migrationsAppendOnly } from '../src/verify/rules/migrationsAppendOnly.js';

const rules = [{ globs: ['supabase/migrations/**/*.sql'] }];

describe('migrationsAppendOnly', () => {
  it('allows added migrations', () => {
    expect(migrationsAppendOnly([{ status: 'A', path: 'supabase/migrations/20261115_new.sql' }], rules)).toEqual([]);
  });

  it('fails a modified migration and names the file', () => {
    const failures = migrationsAppendOnly([{ status: 'M', path: 'supabase/migrations/20260101_old.sql' }], rules);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.id).toBe('migrationsAppendOnly');
    expect(failures[0]?.message).toContain('supabase/migrations/20260101_old.sql');
    expect(failures[0]?.message).toContain('create a new migration instead of editing an applied one');
    expect(failures[0]?.evidence).toBe('modified: supabase/migrations/20260101_old.sql');
  });

  it('fails a deleted migration', () => {
    const failures = migrationsAppendOnly([{ status: 'D', path: 'supabase/migrations/20260101_old.sql' }], rules);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.evidence).toBe('deleted: supabase/migrations/20260101_old.sql');
  });

  it('fails a rename away from a migration path (base file disappears)', () => {
    const failures = migrationsAppendOnly(
      [{ status: 'R', path: 'supabase/migrations/20260102_renamed.sql', oldPath: 'supabase/migrations/20260101_old.sql' }],
      rules
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]?.evidence).toBe('renamed: supabase/migrations/20260101_old.sql -> supabase/migrations/20260102_renamed.sql');
  });

  it('allows a rename into the migration path from an unprotected path', () => {
    expect(
      migrationsAppendOnly([{ status: 'R', path: 'supabase/migrations/20260102_x.sql', oldPath: 'drafts/x.sql' }], rules)
    ).toEqual([]);
  });

  it('ignores files outside the configured globs', () => {
    expect(
      migrationsAppendOnly(
        [
          { status: 'M', path: 'src/app.ts' },
          { status: 'M', path: 'supabase/seed.sql' },
          { status: 'D', path: 'supabase/migrations/README.md' }
        ],
        rules
      )
    ).toEqual([]);
  });

  it('is a no-op when unconfigured or when globs are empty', () => {
    const changes = [{ status: 'M' as const, path: 'supabase/migrations/20260101_old.sql' }];
    expect(migrationsAppendOnly(changes, [])).toEqual([]);
    expect(migrationsAppendOnly(changes, [{ globs: [] }])).toEqual([]);
  });

  it('is off by default', () => {
    expect(defaultConfig.verify.rules.migrationsAppendOnly).toEqual([]);
  });
});

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

const write = (root: string, rel: string, content: string): void => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
};

const makeRepo = (): { root: string; baseSha: string } => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-migrations-append-only-'));
  git(root, 'init', '-q');
  write(root, 'supabase/migrations/001_a.sql', 'create table a (id int, note text, filler text, more text);\n');
  write(root, 'supabase/migrations/002_b.sql', 'create table b (id int, note text, filler text, more text);\n');
  write(root, 'supabase/migrations/003_c.sql', 'create table c (id int, note text, filler text, more text);\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  return { root, baseSha: git(root, 'rev-parse', 'HEAD').trim() };
};

describe('migrationsAppendOnly against a real git diff', () => {
  it('classifies added, modified, deleted and renamed files', () => {
    const { root, baseSha } = makeRepo();
    write(root, 'supabase/migrations/004_new.sql', 'create table d (id int);\n');
    write(root, 'supabase/migrations/001_a.sql', 'create table a (id int, note text, filler text, more text, extra int);\n');
    fs.rmSync(path.join(root, 'supabase/migrations/002_b.sql'));
    git(root, 'mv', 'supabase/migrations/003_c.sql', 'supabase/migrations/003_c_renamed.sql');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'change');

    expect(getChangedFileStatuses(root, baseSha)).toEqual([
      { status: 'M', path: 'supabase/migrations/001_a.sql' },
      { status: 'D', path: 'supabase/migrations/002_b.sql' },
      { status: 'R', path: 'supabase/migrations/003_c_renamed.sql', oldPath: 'supabase/migrations/003_c.sql' },
      { status: 'A', path: 'supabase/migrations/004_new.sql' }
    ]);
  });

  it('core rule fails on edits when configured and stays silent when not', () => {
    const { root, baseSha } = makeRepo();
    write(root, 'supabase/migrations/001_a.sql', 'create table a (id int, note text, filler text, more text, extra int);\n');
    write(root, 'supabase/migrations/004_new.sql', 'create table d (id int);\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'edit');

    const configured = {
      ...defaultConfig,
      verify: { ...defaultConfig.verify, rules: { ...defaultConfig.verify.rules, migrationsAppendOnly: rules } }
    };
    const find = (config: typeof defaultConfig) => getCoreRules(config).find((rule) => rule.id === 'migrationsAppendOnly')!;

    const failures = find(configured).check({ repoRoot: root, changedFiles: [], baseSha }).failures;
    expect(failures).toHaveLength(1);
    expect(failures[0]?.message).toContain('supabase/migrations/001_a.sql');

    expect(find(defaultConfig).check({ repoRoot: root, changedFiles: [], baseSha }).failures).toEqual([]);
    expect(find(configured).check({ repoRoot: root, changedFiles: [] }).failures).toEqual([]);
  });
});
