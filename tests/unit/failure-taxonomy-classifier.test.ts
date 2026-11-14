import { describe, expect, it } from 'vitest';
import {
  FAILURE_CATEGORIES,
  buildFailureIngestArtifact,
  buildFailureSuggestArtifact,
  classifyFailureText,
  parseFailureInput
} from '../../packages/engine/src/failure/failureTaxonomy.js';

describe('failure taxonomy classifier', () => {
  const cases: Array<[string, string]> = [
    ["error TS2322: Type 'string' is not assignable to type 'number'", 'build.type-error'],
    ["Error: Cannot find module 'left-pad'", 'dependency.resolution'],
    ['AssertionError: expected 1 to be 2', 'test.assertion'],
    ['Snapshot `foo` mismatched', 'test.snapshot-mismatch'],
    ['Test timed out in 5000ms', 'test.timeout'],
    ['Contract surface changed or could not be checked', 'contract.schema-drift'],
    ['EACCES: permission denied, open x', 'filesystem.permission'],
    ['connect ECONNREFUSED 127.0.0.1:9', 'network.unreachable'],
    ['Invalid configuration: unknown option foo', 'config.invalid'],
    ['SyntaxError: Unexpected token }', 'build.compile-error'],
    ['3 problems (3 errors, 0 warnings) eslint', 'lint.violation'],
    ['ReferenceError: x is not defined', 'runtime.exception'],
    ['something entirely novel', 'unknown']
  ];

  it.each(cases)('classifies %s', (text, category) => {
    expect(classifyFailureText(text).category).toBe(category);
  });

  it('only emits categories from the closed taxonomy', () => {
    for (const [text] of cases) {
      expect(FAILURE_CATEGORIES).toContain(classifyFailureText(text).category);
    }
  });

  it('is deterministic and order independent', () => {
    const records = [
      { id: 'b', message: 'Test timed out in 5000ms' },
      { id: 'a', message: 'AssertionError: expected 1 to be 2' }
    ];
    const forward = buildFailureIngestArtifact(records, 'in.json');
    const reversed = buildFailureIngestArtifact([...records].reverse(), 'in.json');
    expect(JSON.stringify(forward.failures.map((f) => [f.id, f.signature, f.category]))).toBe(
      JSON.stringify(reversed.failures.map((f) => [f.id, f.signature, f.category]))
    );
    expect(forward.failures.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('normalizes paths and sources and numbers missing ids by input order', () => {
    const artifact = buildFailureIngestArtifact({ failures: [{ message: 'x', file: 'a\\b.ts', source: 'weird' }] }, 'a\\in.json');
    expect(artifact.failures[0]).toMatchObject({ id: 'failure-0001', file: 'a/b.ts', source: 'manual', category: 'unknown' });
    expect(artifact.inputPath).toBe('a/in.json');
  });

  it('rejects invalid input', () => {
    expect(() => parseFailureInput('nope')).toThrow(/Invalid failure input/);
    expect(() => parseFailureInput([{ message: '' }])).toThrow(/non-empty string "message"/);
  });

  it('groups suggestions by category in code-unit order', () => {
    const ingest = buildFailureIngestArtifact(
      [{ id: 'f2', message: 'Test timed out in 5000ms' }, { id: 'f1', message: 'AssertionError: expected 1 to be 2' }, { id: 'f3', message: 'AssertionError: expected 3 to be 4' }],
      'in.json'
    );
    const suggest = buildFailureSuggestArtifact(ingest, 'in.json');
    expect(suggest.suggestions.map((s) => s.category)).toEqual(['test.assertion', 'test.timeout']);
    expect(suggest.suggestions[0].failureIds).toEqual(['f1', 'f3']);
  });
});
