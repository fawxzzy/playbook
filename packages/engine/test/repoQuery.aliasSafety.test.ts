import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeJsonArtifact } from '../src/artifacts/artifactIO.js';
import { queryRepositoryIndex } from '../src/query/repoQuery.js';

const index = {
  schemaVersion: '1.0',
  framework: 'node',
  language: 'typescript',
  architecture: 'modular-monolith',
  modules: [{ name: 'core', dependencies: [] }],
  dependencies: [],
  workspace: [],
  tests: [],
  configs: [],
  database: 'none',
  rules: []
};

const inheritedFields = ['constructor', 'CONSTRUCTOR', '__proto__', '__PROTO__'];

describe('queryRepositoryIndex alias safety (PB-V03-QUERY-001)', () => {
  let root: string;
  let indexPath: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-query-alias-safety-'));
    indexPath = path.join(root, '.playbook', 'repo-index.json');
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  for (const format of ['raw', 'enveloped'] as const) {
    describe(format, () => {
      beforeEach(() => {
        if (format === 'enveloped') {
          writeJsonArtifact(indexPath, index);
        } else {
          fs.mkdirSync(path.dirname(indexPath), { recursive: true });
          fs.writeFileSync(indexPath, JSON.stringify(index));
        }
      });

      it.each(inheritedFields)('rejects inherited property %s as an unsupported field', (field) => {
        expect(() => queryRepositoryIndex(root, field)).toThrow('playbook query: unsupported field');
      });

      it.each([
        ['modules', 'modules'],
        ['MODULES', 'modules'],
        ['list modules', 'modules'],
        ['deps', 'dependencies'],
        ['DEPS', 'dependencies']
      ] as const)('preserves supported field or alias %s', (input, field) => {
        expect(queryRepositoryIndex(root, input)).toEqual({ field, result: index[field] });
      });

      it.each(['modules dependencies', 'not-a-field'])('preserves rejection of %s', (field) => {
        expect(() => queryRepositoryIndex(root, field)).toThrow('playbook query: unsupported field');
      });
    });
  }

  it.each(['constructor', '__proto__'])('rejects %s before requiring an index', (field) => {
    expect(() => queryRepositoryIndex(root, field)).toThrow('playbook query: unsupported field');
    expect(fs.existsSync(indexPath)).toBe(false);
  });

  it('preserves the missing-index diagnostic for supported fields', () => {
    expect(() => queryRepositoryIndex(root, 'modules')).toThrow('playbook query: missing repository index');
  });
});
