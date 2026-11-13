import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { runRules } from './rules.js';

// The first import of the CLI loader pulls in the engine; allow for a cold module graph.
vi.setConfig({ testTimeout: 30000 });

const roots: string[] = [];

const makePluginFreeRepo = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-rules-command-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
  return root;
};

const run = async (cwd: string, options: { format: 'text' | 'json'; quiet: boolean; explain: boolean }) => {
  const lines: string[] = [];
  const errors: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void lines.push(args.join(' ')));
  const error = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void errors.push(args.join(' ')));
  try {
    const exitCode = await runRules(cwd, options);
    return { exitCode, lines, errors };
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('runRules', () => {
  it('emits the rules JSON contract with an additive source field and no stderr output', async () => {
    const { exitCode, lines, errors } = await run(makePluginFreeRepo(), { format: 'json', quiet: false, explain: false });
    const payload = JSON.parse(lines.join('\n')) as {
      schemaVersion: string;
      command: string;
      verify: Array<{ id: string; description: string; explanation?: string; source?: string }>;
      analyze: Array<{ id: string; description: string }>;
    };

    expect(exitCode).toBe(ExitCode.Success);
    expect(errors).toEqual([]);
    expect(payload.schemaVersion).toBe('1.0');
    expect(payload.command).toBe('rules');
    expect(payload.verify.map((rule) => rule.id)).toEqual([
      'notes.missing',
      'notes.empty',
      'requireNotesOnChanges',
      'verify.rule.tests.required',
      'protected-doc.governance',
      'release.version-governance',
      'requireNotesFileWhenGovernanceExists'
    ]);
    expect(payload.verify.every((rule) => rule.source === 'core')).toBe(true);
    expect(payload.verify.every((rule) => rule.explanation === undefined)).toBe(true);
    expect(payload.analyze.map((rule) => rule.id)).toEqual(['analyze-no-signals', 'analyze-run-init', 'analyze-run-verify']);
  });

  it('adds explanations only with --explain', async () => {
    const { lines } = await run(makePluginFreeRepo(), { format: 'json', quiet: false, explain: true });
    const payload = JSON.parse(lines.join('\n')) as { verify: Array<{ id: string; explanation?: string }> };

    expect(payload.verify.find((rule) => rule.id === 'notes.missing')?.explanation).toMatch(/PLAYBOOK_NOTES/);
  });

  it('prints headings in text mode and nothing when quiet', async () => {
    const root = makePluginFreeRepo();
    const loud = await run(root, { format: 'text', quiet: false, explain: false });
    expect(loud.lines).toEqual(expect.arrayContaining(['Verify Rules', 'Analyze Rules']));

    const quiet = await run(root, { format: 'text', quiet: true, explain: false });
    expect(quiet.lines).toEqual([]);
  });
});
