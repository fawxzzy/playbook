import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildFailureIngestArtifact, buildFailureSuggestArtifact } from '../../packages/engine/src/failure/failureTaxonomy.js';
import {
  buildFailureReports,
  buildFailureScaffoldArtifact,
  evaluateFailureClosure,
  mergeExistingClosure,
  resolveIngestArtifact
} from '../../packages/engine/src/failure/failureClosure.js';

const repoRoot = path.resolve(__dirname, '..', '..');
const corpus = JSON.parse(fs.readFileSync(path.join(repoRoot, 'tests/fixtures/failure-corpus/multi-failure.json'), 'utf8')) as { failures: Array<{ id: string }> };

const expected: Record<string, string> = {
  'c-01': 'build.type-error',
  'c-02': 'build.type-error',
  'c-03': 'dependency.resolution',
  'c-04': 'test.assertion',
  'c-05': 'test.assertion',
  'c-06': 'test.timeout',
  'c-07': 'test.snapshot-mismatch',
  'c-08': 'contract.schema-drift',
  'c-09': 'lint.violation',
  'c-10': 'runtime.exception',
  'c-11': 'network.unreachable',
  'c-12': 'unknown',
  'c-13': 'filesystem.permission',
  'c-14': 'dependency.resolution',
  'c-15': 'test.snapshot-mismatch'
};

describe('failure taxonomy multi-failure corpus', () => {
  const ingest = buildFailureIngestArtifact(corpus, 'corpus.json');

  it('classifies every corpus record to its expected category', () => {
    expect(ingest.total).toBe(corpus.failures.length);
    expect(Object.fromEntries(ingest.failures.map((f) => [f.id, f.category]))).toEqual(expected);
  });

  it('gives distinct signatures to distinct failures of the same category', () => {
    const [a, b] = ingest.failures.filter((f) => f.category === 'build.type-error');
    expect(a.signature).not.toBe(b.signature);
  });

  it('counts categories in code-unit order and is stable under input reversal', () => {
    const reversed = buildFailureIngestArtifact({ failures: [...corpus.failures].reverse() }, 'corpus.json');
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(ingest));
    const names = ingest.categories.map((c) => c.category);
    expect(names).toEqual([...names].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
    expect(ingest.categories.find((c) => c.category === 'test.assertion')?.count).toBe(2);
  });

  it('suggests once per present category covering every failure id', () => {
    const suggest = buildFailureSuggestArtifact(ingest, 'corpus.json');
    expect(suggest.suggestions.map((s) => s.category)).toEqual(ingest.categories.map((c) => c.category));
    expect(suggest.suggestions.flatMap((s) => s.failureIds).sort()).toEqual(corpus.failures.map((f) => f.id).sort());
  });

  it('builds one report per failure with unique paths, all codification_required', () => {
    const reports = buildFailureReports(ingest, 'corpus.json');
    expect(reports).toHaveLength(corpus.failures.length);
    expect(new Set(reports.map((r) => r.path)).size).toBe(reports.length);
    for (const r of reports) {
      expect(r.path).toMatch(/^\.playbook\/failures\/[A-Za-z0-9._-]+\.report\.json$/);
      expect(r.report.closure).toEqual({ status: 'codification_required', preventionTargets: [] });
    }
  });

  it('scaffolds rule, test and doc per failure, propose-only, with paths outside .playbook', () => {
    const artifact = buildFailureScaffoldArtifact(ingest, 'corpus.json');
    expect(artifact.proposeOnly).toBe(true);
    expect(artifact.total).toBe(corpus.failures.length);
    for (const entry of artifact.entries) {
      expect(entry.scaffolds.map((s) => s.kind)).toEqual(['rule', 'test', 'doc']);
      for (const s of entry.scaffolds) expect(s.proposedPath.startsWith('.')).toBe(false);
    }
    expect(JSON.stringify(buildFailureScaffoldArtifact(ingest, 'corpus.json'))).toBe(JSON.stringify(artifact));
    expect(buildFailureScaffoldArtifact(ingest, 'corpus.json', 'c-06').entries.map((e) => e.failureId)).toEqual(['c-06']);
    expect(() => buildFailureScaffoldArtifact(ingest, 'corpus.json', 'nope')).toThrow(/no failure with id/);
  });

  it('accepts a taxonomy artifact or raw records as classify input', () => {
    expect(resolveIngestArtifact(ingest, 'x').failures).toHaveLength(15);
    expect(resolveIngestArtifact(corpus, 'x').failures).toHaveLength(15);
    expect(() => resolveIngestArtifact({ kind: 'playbook-failure-taxonomy' }, 'x')).toThrow(/Invalid failure taxonomy artifact/);
  });

  describe('closure rule', () => {
    const reports = buildFailureReports(ingest, 'corpus.json');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const asFiles = (mutate?: (i: number, v: any) => unknown) => reports.map((r, i) => ({ path: r.path, value: mutate ? mutate(i, structuredClone(r.report)) : r.report }));

    it('fails while any report is codification_required', () => {
      const result = evaluateFailureClosure(asFiles());
      expect(result.ok).toBe(false);
      expect(result.checked).toBe(15);
      expect(result.violations.every((v) => v.reason === 'codification_required')).toBe(true);
    });

    it('passes when every report is closed with prevention targets, and ignores non-report JSON', () => {
      const files = [...asFiles((_i, v) => ({ ...v, closure: { status: 'closed', preventionTargets: ['rule:x'] } })), { path: '.playbook/failures/sample.json', value: corpus }];
      expect(evaluateFailureClosure(files)).toMatchObject({ ok: true, checked: 15, closed: 15, violations: [] });
    });

    it('rejects closed without targets and invalid status', () => {
      const result = evaluateFailureClosure(asFiles((i, v) => ({ ...v, closure: { status: i === 0 ? 'closed' : 'bogus', preventionTargets: [] } })));
      const reasons = new Set(result.violations.map((v) => v.reason));
      expect(reasons).toEqual(new Set(['closed-without-prevention-targets', 'invalid-closure-status']));
    });

    it('re-classification keeps a human closure only when the signature is unchanged', () => {
      const fresh = reports[0].report;
      const closed = { ...fresh, closure: { status: 'closed', preventionTargets: ['test:b', 'rule:a'] } };
      expect(mergeExistingClosure(fresh, closed).closure).toEqual({ status: 'closed', preventionTargets: ['rule:a', 'test:b'] });
      const drifted = { ...closed, failure: { ...fresh.failure, signature: 'failtax-0000000000000000' } };
      expect(mergeExistingClosure(fresh, drifted).closure.status).toBe('codification_required');
    });
  });
});
