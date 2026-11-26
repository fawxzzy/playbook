import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config/schema.js';
import type { ChangedFileStatus } from '../src/git/diff.js';
import { getCoreRules } from '../src/rules/coreRules.js';
import { generatedFilesInSync } from '../src/verify/rules/generatedFilesInSync.js';

const contractEntry = {
  inputs: ['schemas/**/*.json'],
  outputs: ['src/generated/contracts.ts'],
  regenerate: 'pnpm contracts:generate'
};

const boardEntry = {
  inputs: ['docs/roadmap/ROADMAP.json'],
  outputs: ['exports/board.json', 'exports/board.md']
};

describe('generatedFilesInSync', () => {
  it('fails when an input changed and no output changed', () => {
    const failures = generatedFilesInSync([{ status: 'M', path: 'schemas/user.json' }], [contractEntry]);
    expect(failures).toEqual([
      {
        id: 'generatedFilesInSync',
        message: 'Generator input changed but the generated file was not regenerated: src/generated/contracts.ts',
        evidence: 'schemas/user.json',
        fix: 'Run: pnpm contracts:generate'
      }
    ]);
  });

  it('passes when both the input and the output changed', () => {
    const changes: ChangedFileStatus[] = [
      { status: 'M', path: 'schemas/user.json' },
      { status: 'M', path: 'src/generated/contracts.ts' }
    ];
    expect(generatedFilesInSync(changes, [contractEntry])).toEqual([]);
  });

  it('passes when only the output changed', () => {
    expect(generatedFilesInSync([{ status: 'M', path: 'src/generated/contracts.ts' }], [contractEntry])).toEqual([]);
  });

  it('passes when only unrelated files changed', () => {
    expect(generatedFilesInSync([{ status: 'M', path: 'src/app.ts' }, { status: 'A', path: 'schemas/README.md' }], [contractEntry])).toEqual([]);
  });

  it('checks each entry independently and sorts failures by evidence', () => {
    const changes: ChangedFileStatus[] = [
      { status: 'M', path: 'schemas/user.json' },
      { status: 'M', path: 'src/generated/contracts.ts' },
      { status: 'M', path: 'docs/roadmap/ROADMAP.json' }
    ];
    expect(generatedFilesInSync(changes, [contractEntry, boardEntry])).toEqual([
      {
        id: 'generatedFilesInSync',
        message: 'Generator input changed but the generated file was not regenerated: exports/board.json, exports/board.md',
        evidence: 'docs/roadmap/ROADMAP.json',
        fix: 'Regenerate exports/board.json, exports/board.md and commit the result.'
      }
    ]);

    const both = generatedFilesInSync(
      [
        { status: 'M', path: 'schemas/user.json' },
        { status: 'M', path: 'docs/roadmap/ROADMAP.json' }
      ],
      [contractEntry, boardEntry]
    );
    expect(both.map((failure) => failure.evidence)).toEqual(['docs/roadmap/ROADMAP.json', 'schemas/user.json']);
  });

  it('counts a rename by either its old or its new path', () => {
    const renamedAway = generatedFilesInSync([{ status: 'R', path: 'archive/user.json', oldPath: 'schemas/user.json' }], [contractEntry]);
    expect(renamedAway.map((failure) => failure.evidence)).toEqual(['schemas/user.json']);

    const renamedIn = generatedFilesInSync([{ status: 'R', path: 'schemas/user.json', oldPath: 'drafts/user.json' }], [contractEntry]);
    expect(renamedIn.map((failure) => failure.evidence)).toEqual(['schemas/user.json']);

    const renamedWithinInputs = generatedFilesInSync(
      [{ status: 'R', path: 'schemas/b.json', oldPath: 'schemas/a.json' }],
      [contractEntry]
    );
    expect(renamedWithinInputs.map((failure) => failure.evidence)).toEqual(['schemas/a.json, schemas/b.json']);

    const outputRenamed = generatedFilesInSync(
      [
        { status: 'M', path: 'schemas/user.json' },
        { status: 'R', path: 'src/old/contracts.ts', oldPath: 'src/generated/contracts.ts' }
      ],
      [contractEntry]
    );
    expect(outputRenamed).toEqual([]);
  });

  it('fails when an input is deleted and the output is untouched', () => {
    const failures = generatedFilesInSync([{ status: 'D', path: 'schemas/user.json' }], [contractEntry]);
    expect(failures.map((failure) => failure.evidence)).toEqual(['schemas/user.json']);
  });

  it('lists every matching input, sorted, in one failure per entry', () => {
    const failures = generatedFilesInSync(
      [
        { status: 'M', path: 'schemas/z.json' },
        { status: 'A', path: 'schemas/a.json' }
      ],
      [contractEntry]
    );
    expect(failures).toHaveLength(1);
    expect(failures[0]?.evidence).toBe('schemas/a.json, schemas/z.json');
  });

  it('treats a file matching both inputs and outputs as an output', () => {
    const overlapping = { inputs: ['gen/**'], outputs: ['gen/out.ts'] };
    expect(generatedFilesInSync([{ status: 'M', path: 'gen/out.ts' }], [overlapping])).toEqual([]);

    const failures = generatedFilesInSync([{ status: 'M', path: 'gen/in.json' }], [overlapping]);
    expect(failures.map((failure) => failure.evidence)).toEqual(['gen/in.json']);
  });

  it('uses the regenerate command in the fix only when it is set', () => {
    const [withCommand] = generatedFilesInSync([{ status: 'M', path: 'schemas/user.json' }], [contractEntry]);
    expect(withCommand?.fix).toBe('Run: pnpm contracts:generate');

    const withoutCommandEntry = { inputs: contractEntry.inputs, outputs: contractEntry.outputs };
    const [withoutCommand] = generatedFilesInSync([{ status: 'M', path: 'schemas/user.json' }], [withoutCommandEntry]);
    expect(withoutCommand?.fix).toBe('Regenerate src/generated/contracts.ts and commit the result.');
  });

  it('is a no-op with no configured entries', () => {
    expect(generatedFilesInSync([{ status: 'M', path: 'schemas/user.json' }], [])).toEqual([]);
  });

  it('is off by default', () => {
    expect(defaultConfig.verify.rules.generatedFilesInSync).toEqual([]);
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

describe('generatedFilesInSync core rule against a real git diff', () => {
  it('fails on a stale output when configured and stays silent when not', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-generated-files-in-sync-'));
    git(root, 'init', '-q');
    write(root, 'schemas/user.json', '{"a":1}\n');
    write(root, 'src/generated/contracts.ts', 'export const hash = "1";\n');
    git(root, 'add', '.');
    git(root, 'commit', '-q', '-m', 'base');
    const baseSha = git(root, 'rev-parse', 'HEAD').trim();
    write(root, 'schemas/user.json', '{"a":2}\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'edit input');

    const configured = {
      ...defaultConfig,
      verify: { ...defaultConfig.verify, rules: { ...defaultConfig.verify.rules, generatedFilesInSync: [contractEntry] } }
    };
    const find = (config: typeof defaultConfig) => getCoreRules(config).find((rule) => rule.id === 'generatedFilesInSync')!;

    const failures = find(configured).check({ repoRoot: root, changedFiles: [], baseSha }).failures;
    expect(failures.map((failure) => failure.evidence)).toEqual(['schemas/user.json']);

    expect(find(defaultConfig).check({ repoRoot: root, changedFiles: [], baseSha }).failures).toEqual([]);
    expect(find(configured).check({ repoRoot: root, changedFiles: [] }).failures).toEqual([]);
  });

  it('makes no git call when unconfigured or without a diff base', () => {
    const notARepo = path.join(os.tmpdir(), 'playbook-generated-files-in-sync-missing-dir');
    const configured = {
      ...defaultConfig,
      verify: { ...defaultConfig.verify, rules: { ...defaultConfig.verify.rules, generatedFilesInSync: [contractEntry] } }
    };
    const find = (config: typeof defaultConfig) => getCoreRules(config).find((rule) => rule.id === 'generatedFilesInSync')!;
    expect(find(defaultConfig).check({ repoRoot: notARepo, changedFiles: [], baseSha: 'deadbeef' }).failures).toEqual([]);
    expect(find(configured).check({ repoRoot: notARepo, changedFiles: [] }).failures).toEqual([]);
  });
});
