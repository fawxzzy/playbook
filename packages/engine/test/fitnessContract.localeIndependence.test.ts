import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitnessIntegrationContract, loadFitnessContract, type FitnessContractSourcePointer } from '../src/integrations/fitnessContract.js';

// `expectedFingerprint` is pinned in another repository (Fitness) and compared here. The fingerprint must therefore be
// identical on every machine (no `localeCompare`), and a pin taken with an older Playbook must keep validating.

const pointer = (expectedFingerprint?: string): FitnessContractSourcePointer => ({
  sourceRepo: 'ZachariahRedfield/fawxzzy-fitness',
  sourceRef: 'main',
  sourcePath: '../fawxzzy-fitness/src/lib/ecosystem/fitness-integration-contract.ts',
  syncMode: 'mirrored',
  ...(expectedFingerprint ? { expectedFingerprint } : {})
});

const load = (expectedFingerprint?: string) =>
  loadFitnessContract({ repoRoot: fs.mkdtempSync(path.join(os.tmpdir(), 'fitness-contract-locale-')), sourcePointer: pointer(expectedFingerprint) });

const stringifyWith = (compare: (left: string, right: string) => number) => {
  const run = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(run).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.keys(value as Record<string, unknown>)
        .sort(compare)
        .map((key) => `${JSON.stringify(key)}:${run((value as Record<string, unknown>)[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value);
  };
  return run;
};
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const reverseLocaleCompare = (): void => {
  vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (this: string, other: string): number {
    const left = String(this);
    return left < other ? 1 : left > other ? -1 : 0;
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fitness contract fingerprint is locale independent', () => {
  it('keeps the fingerprint emitted before the change for the mirrored contract', async () => {
    // Captured from the build before this change (localeCompare key order). A pin taken then must still be what we emit.
    const loaded = await load();
    expect(loaded.fingerprint).toBe('427a3ec549343379574207d9e1cd6f2eb34666c9365e0e0babfb2c123899cc3c');
    expect(loaded.fingerprint).toBe(sha256(stringifyWith((left, right) => left.localeCompare(right))(fitnessIntegrationContract)));
  });

  it('emits the same fingerprint when localeCompare orders strings differently (another locale)', async () => {
    const before = (await load()).fingerprint;

    reverseLocaleCompare();

    expect((await load()).fingerprint).toBe(before);
    // And a pin of that fingerprint still validates on the "other" machine.
    await expect(load(before)).resolves.toMatchObject({ fingerprint: before });
  });

  it('accepts a pin that an older Playbook emitted under a different locale order, and still rejects a wrong pin', async () => {
    reverseLocaleCompare();
    // What an older version would have emitted on a machine whose locale collates this way.
    const legacyPin = sha256(stringifyWith((left, right) => left.localeCompare(right))(fitnessIntegrationContract));
    const current = (await load()).fingerprint;
    expect(legacyPin).not.toBe(current);

    await expect(load(legacyPin)).resolves.toMatchObject({ fingerprint: current });
    await expect(load('0'.repeat(64))).rejects.toThrow(/Fitness contract drift detected/);
  });
});
