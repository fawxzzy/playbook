import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runFailure } from './failure.js';
import { ExitCode } from '../lib/cliContract.js';

const makeRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-failure-'));

describe('runFailure', () => {
  afterEach(() => vi.restoreAllMocks());

  it('ingests, writes the artifact under .playbook, then suggests', async () => {
    const cwd = makeRepo();
    fs.mkdirSync(path.join(cwd, '.playbook', 'failures'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.playbook/failures/sample.json'), JSON.stringify({ failures: [{ id: 'a', message: 'Test timed out in 5000ms' }] }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(await runFailure(cwd, ['ingest'], { format: 'json', quiet: false, input: '.playbook/failures/sample.json' })).toBe(ExitCode.Success);
    const ingested = JSON.parse(String(log.mock.calls[0][0]));
    expect(ingested.failures[0].category).toBe('test.timeout');
    expect(fs.existsSync(path.join(cwd, '.playbook/failure-taxonomy.json'))).toBe(true);

    log.mockClear();
    expect(await runFailure(cwd, ['suggest'], { format: 'json', quiet: false })).toBe(ExitCode.Success);
    expect(JSON.parse(String(log.mock.calls[0][0])).suggestions[0].category).toBe('test.timeout');
  });

  it('fails deterministically on missing input and missing artifact', async () => {
    const cwd = makeRepo();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(await runFailure(cwd, ['ingest'], { format: 'json', quiet: false })).toBe(ExitCode.Failure);
    expect(await runFailure(cwd, ['suggest'], { format: 'json', quiet: false })).toBe(ExitCode.Failure);
    expect(String(log.mock.calls[1][0])).toContain('not found');
  });

  it('classify writes reports, check enforces closure, scaffold is propose-only under .playbook', async () => {
    const cwd = makeRepo();
    fs.mkdirSync(path.join(cwd, '.playbook', 'failures'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.playbook/failures/sample.json'), JSON.stringify({ failures: [{ id: 'a', message: 'Test timed out in 5000ms' }, { id: 'b', message: 'novel' }] }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const base = { format: 'json' as const, quiet: false };

    expect(await runFailure(cwd, ['check'], base)).toBe(ExitCode.Success);
    expect(JSON.parse(String(log.mock.calls[0][0])).checked).toBe(0);

    log.mockClear();
    expect(await runFailure(cwd, ['classify'], { ...base, input: '.playbook/failures/sample.json' })).toBe(ExitCode.Success);
    const summary = JSON.parse(String(log.mock.calls[0][0]));
    expect(summary.total).toBe(2);
    const reportPath = path.join(cwd, summary.reports[0].path);
    expect(fs.existsSync(reportPath)).toBe(true);

    log.mockClear();
    expect(await runFailure(cwd, ['check'], base)).toBe(ExitCode.Failure);
    expect(JSON.parse(String(log.mock.calls[0][0])).violations).toHaveLength(2);

    for (const entry of summary.reports) {
      const file = path.join(cwd, entry.path);
      const report = JSON.parse(fs.readFileSync(file, 'utf8'));
      report.closure = { status: 'closed', preventionTargets: ['rule:x'] };
      fs.writeFileSync(file, JSON.stringify(report));
    }
    log.mockClear();
    expect(await runFailure(cwd, ['classify'], { ...base, input: '.playbook/failures/sample.json' })).toBe(ExitCode.Success);
    expect(await runFailure(cwd, ['check'], base)).toBe(ExitCode.Success);

    log.mockClear();
    const before = fs.readdirSync(cwd).sort();
    expect(await runFailure(cwd, ['scaffold'], { ...base, input: '.playbook/failures/sample.json', failureId: 'a' })).toBe(ExitCode.Success);
    expect(JSON.parse(String(log.mock.calls[0][0])).entries).toHaveLength(1);
    expect(fs.existsSync(path.join(cwd, '.playbook/failure-scaffolds.json'))).toBe(true);
    expect(fs.readdirSync(cwd).sort()).toEqual(before);
    expect(await runFailure(cwd, ['scaffold'], { ...base, input: '.playbook/failures/sample.json', failureId: 'zzz' })).toBe(ExitCode.Failure);
  });
});
