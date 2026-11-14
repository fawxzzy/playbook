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
});
