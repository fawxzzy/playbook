import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createEmptyRunCycle } from '../src/knowledge/run-cycle.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const readDoc = (relativePath: string): string => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('createEmptyRunCycle', () => {
  const args = { id: 'cycle-1', goal: 'close the loop', inputContextSnapshotId: 'snapshot-1' };

  it('carries the identity fields and defaults optional lists to empty', () => {
    const cycle = createEmptyRunCycle(args);
    expect(cycle.id).toBe('cycle-1');
    expect(cycle.goal).toBe('close the loop');
    expect(cycle.inputContextSnapshotId).toBe('snapshot-1');
    expect(cycle.constraints).toEqual([]);
    expect(cycle.contracts).toEqual([]);
  });

  it('copies provided constraints and contracts instead of aliasing them', () => {
    const constraints = ['no network'];
    const contracts = ['docs/architecture/TOROIDAL_FLOW.md'];
    const cycle = createEmptyRunCycle({ ...args, constraints, contracts });
    expect(cycle.constraints).toEqual(constraints);
    expect(cycle.contracts).toEqual(contracts);
    expect(cycle.constraints).not.toBe(constraints);
    expect(cycle.contracts).not.toBe(contracts);
  });

  it('starts with empty execution, intelligence, and governance phase outputs', () => {
    const { phaseOutputs } = createEmptyRunCycle(args);
    expect(phaseOutputs).toEqual({
      execution: { observe: [], verify: [], plan: [], apply: [] },
      intelligence: { extract: [], canonicalize: [], compact: [] },
      governance: { promote: [], retire: [] }
    });
  });

  it('starts with empty result lists and null or zero metrics', () => {
    const cycle = createEmptyRunCycle(args);
    for (const key of ['evidenceRefs', 'extractedFindings', 'compactedDeltas', 'promotedPatternIds', 'retiredPatternIds', 'nextContextDelta'] as const) {
      expect(cycle[key]).toEqual([]);
    }
    expect(cycle.metrics.durationMs).toBeNull();
    expect(Object.keys(cycle.metrics.phaseDurationsMs).sort()).toEqual(
      ['apply', 'canonicalize', 'compact', 'extract', 'observe', 'plan', 'promote', 'retire', 'verify']
    );
    expect(Object.values(cycle.metrics.phaseDurationsMs).every((value) => value === null)).toBe(true);
    expect([cycle.metrics.findingsCount, cycle.metrics.compactedDeltaCount, cycle.metrics.promotedCount, cycle.metrics.retiredCount]).toEqual([0, 0, 0, 0]);
  });

  it('returns independent arrays per call', () => {
    const first = createEmptyRunCycle(args);
    const second = createEmptyRunCycle(args);
    first.phaseOutputs.execution.observe.push('observed');
    first.evidenceRefs.push('.playbook/verify.json');
    first.phaseOutputs.governance.promote.push('pattern-1');
    expect(second.phaseOutputs.execution.observe).toEqual([]);
    expect(second.evidenceRefs).toEqual([]);
    expect(second.phaseOutputs.governance.promote).toEqual([]);
    expect(second.phaseOutputs).not.toBe(first.phaseOutputs);
    expect(second.metrics).not.toBe(first.metrics);
  });
});

describe('Toroidal Flow documentation links', () => {
  it('keeps the Toroidal Flow overlay doc and links it from ARCHITECTURE.md', () => {
    expect(fs.existsSync(path.join(repoRoot, 'docs/architecture/TOROIDAL_FLOW.md'))).toBe(true);
    expect(readDoc('docs/ARCHITECTURE.md')).toContain('./architecture/TOROIDAL_FLOW.md');
  });

  it('documents the phases that RunCycle models', () => {
    const doc = readDoc('docs/architecture/TOROIDAL_FLOW.md').toLowerCase();
    for (const phase of ['observe', 'verify', 'plan', 'apply', 'extract', 'canonicalize', 'compact', 'promote', 'retire']) {
      expect(doc, `TOROIDAL_FLOW.md should mention ${phase}`).toContain(phase);
    }
  });
});
