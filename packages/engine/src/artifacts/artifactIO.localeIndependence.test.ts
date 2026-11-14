import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { INVALID_ARTIFACT_ERROR, readJsonArtifact, writeJsonArtifact } from './artifactIO.js';

// The envelope checksum is recomputed when an artifact is read. If key order depended on `localeCompare`, an artifact
// written on one machine could fail verification on another (different locale or ICU build) with "Invalid Playbook artifact".

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

const tempArtifact = (): string => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-artifact-io-')), 'custom.json');

// Sibling keys that locale collation orders differently from UTF-16 code units.
const collidingData = { scoredAt: 2, scoreVersion: 1, B: 3, a: 4, _c: 5, é: 6, nested: { Z: 1, z: 2, a_b: 3, aB: 4 } };
const collidingCanonical = '{"B":3,"_c":5,"a":4,"nested":{"Z":1,"aB":4,"a_b":3,"z":2},"scoreVersion":1,"scoredAt":2,"é":6}';

/** Makes every `localeCompare` call return the opposite order, as a stand-in for "a different locale". */
const reverseLocaleCompare = (): void => {
  vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (this: string, other: string): number {
    const left = String(this);
    return left < other ? 1 : left > other ? -1 : 0;
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('artifact envelope checksum is locale independent', () => {
  it('writes the checksum over keys in code-unit order (pinned against an independently built canonical form)', () => {
    const artifactPath = tempArtifact();
    writeJsonArtifact(artifactPath, collidingData);

    const envelope = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as { checksum: string; data: Record<string, unknown> };
    expect(envelope.checksum).toBe(sha256(collidingCanonical));
    expect(Object.keys(envelope.data)).toEqual(['B', '_c', 'a', 'nested', 'scoreVersion', 'scoredAt', 'é']);
  });

  it('reads an artifact back when localeCompare orders strings differently from the machine that wrote it', () => {
    const artifactPath = tempArtifact();
    writeJsonArtifact(artifactPath, collidingData);

    reverseLocaleCompare();

    expect(readJsonArtifact(artifactPath)).toEqual(collidingData);
  });

  it('keeps the checksum that existed before the change for lowercase ASCII keys', () => {
    const artifactPath = tempArtifact();
    const data = { command: 'custom', ok: true, summary: { failures: 0, warnings: 1 }, tasks: [{ action: 'a', id: 't1', rule_id: 'r' }] };
    writeJsonArtifact(artifactPath, data);

    const envelope = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as { checksum: string };
    // Same canonical form under locale collation and code units, so existing artifacts of this shape verify unchanged.
    expect(envelope.checksum).toBe(sha256('{"command":"custom","ok":true,"summary":{"failures":0,"warnings":1},"tasks":[{"action":"a","id":"t1","rule_id":"r"}]}'));
  });

  it('still accepts an artifact whose checksum was written with the previous locale-collation key order', () => {
    const artifactPath = tempArtifact();
    // Rebuild the canonical form a previous version produced: keys ordered with localeCompare at every level.
    const localeCanonicalize = (value: unknown): unknown =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.keys(value as Record<string, unknown>)
              .sort((left, right) => left.localeCompare(right))
              .map((key) => [key, localeCanonicalize((value as Record<string, unknown>)[key])])
          )
        : value;
    const legacyChecksum = sha256(JSON.stringify(localeCanonicalize(collidingData)));
    // Guard: only meaningful where the runtime collates these keys differently from code units (any ICU build).
    expect(legacyChecksum).not.toBe(sha256(collidingCanonical));

    fs.writeFileSync(
      artifactPath,
      JSON.stringify({ artifact: 'playbook.artifact', version: 1, generated_at: new Date(0).toISOString(), checksum: legacyChecksum, data: collidingData })
    );

    expect(readJsonArtifact(artifactPath)).toEqual(collidingData);
  });

  it('still rejects an artifact whose data was changed after the checksum was written', () => {
    const artifactPath = tempArtifact();
    writeJsonArtifact(artifactPath, collidingData);
    const envelope = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as { data: Record<string, unknown> };
    envelope.data.a = 999;
    fs.writeFileSync(artifactPath, JSON.stringify(envelope));

    expect(() => readJsonArtifact(artifactPath)).toThrow(INVALID_ARTIFACT_ERROR);
  });
});
