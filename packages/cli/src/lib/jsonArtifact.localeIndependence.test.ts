import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as engine from '@zachariahredfield/playbook-engine';
import { writeJsonArtifact } from './jsonArtifact.js';

// The CLI writes the artifact envelope and the engine verifies its checksum on read (real engine, no mocks).
// Both must order keys the same way on every machine, so neither may depend on `localeCompare`.

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

// Sibling keys that locale collation orders differently from UTF-16 code units.
const collidingData = { scoredAt: 2, scoreVersion: 1, B: 3, a: 4, _c: 5, nested: { Z: 1, z: 2, a_b: 3, aB: 4 } };
const collidingCanonical = '{"B":3,"_c":5,"a":4,"nested":{"Z":1,"aB":4,"a_b":3,"z":2},"scoreVersion":1,"scoredAt":2}';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CLI artifact envelope checksum is locale independent', () => {
  it('writes the checksum over keys in code-unit order', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-cli-artifact-'));
    const target = writeJsonArtifact(cwd, 'custom.json', collidingData, 'custom');

    const envelope = JSON.parse(fs.readFileSync(target, 'utf8')) as { checksum: string; data: Record<string, unknown> };
    expect(envelope.checksum).toBe(sha256(collidingCanonical));
    expect(Object.keys(envelope.data)).toEqual(['B', '_c', 'a', 'nested', 'scoreVersion', 'scoredAt']);
  });

  it('is accepted by the engine reader when localeCompare orders strings differently from the machine that wrote it', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-cli-artifact-'));
    const target = writeJsonArtifact(cwd, 'custom.json', collidingData, 'custom');

    vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (this: string, other: string): number {
      const left = String(this);
      return left < other ? 1 : left > other ? -1 : 0;
    });

    expect(engine.readArtifactJson(target)).toEqual(collidingData);
  });

  it('keeps the checksum that existed before the change for lowercase ASCII keys', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-cli-artifact-'));
    const target = writeJsonArtifact(cwd, 'custom.json', { command: 'custom', ok: true, summary: { failures: 0, warnings: 1 } }, 'custom');

    const envelope = JSON.parse(fs.readFileSync(target, 'utf8')) as { checksum: string };
    expect(envelope.checksum).toBe(sha256('{"command":"custom","ok":true,"summary":{"failures":0,"warnings":1}}'));
  });
});
