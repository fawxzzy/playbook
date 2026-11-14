import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateExecutionMergeGuards } from './mergeGuards.js';
import { computeLaunchPlanFingerprint, deriveOrchestrationRunId, launchPlanFingerprintMatches } from './orchestrationRunState.js';
import type { WorkerLaunchPlanArtifact } from '../orchestration/workerLaunchPlan.js';

// The launch-plan fingerprint is stored in run state and recomputed later to decide whether the run is stale.
// It must not depend on `localeCompare`, and a fingerprint stored by an older version must still be recognised.

const lane = {
  lane_id: 'lane-1',
  worker_id: 'worker-1',
  worker_type: 'docs',
  launchEligible: true,
  blockers: [],
  requiredCapabilities: ['docs.write'],
  allowedWriteSurfaces: ['docs/a.md'],
  declaredChangeScope: { scopeId: 'scope-0372c1a5138e', allowedWriteSurfaces: ['docs/a.md'], patchSizeBudget: { maxFiles: 1, maxHunks: 3, maxAddedLines: 40, maxRemovedLines: 20 }, enforced: true },
  protectedSingletonImpact: { hasProtectedSingletonWork: false, targets: [], consolidationStage: 'not_applicable', unresolved: false },
  requiredReceipts: [],
  releaseReadyPreconditions: []
};

const realisticLaunchPlan = {
  schemaVersion: '1.0',
  kind: 'worker-launch-plan',
  proposalOnly: true,
  generatedAt: '1970-01-01T00:00:00.000Z',
  sourceArtifacts: { worksetPlanPath: '.playbook/workset-plan.json', laneStatePath: '.playbook/lane-state.json', workerAssignmentsPath: '.playbook/worker-assignments.json' },
  summary: { launchEligibleLanes: ['lane-1'], blockedLanes: ['lane-2'], failClosedReasons: [] },
  lanes: [
    lane,
    {
      ...lane,
      lane_id: 'lane-2',
      worker_id: null,
      worker_type: null,
      launchEligible: false,
      blockers: ['verify:notes.missing'],
      requiredCapabilities: [],
      allowedWriteSurfaces: [],
      declaredChangeScope: { scopeId: null, allowedWriteSurfaces: [], patchSizeBudget: null, enforced: false }
    }
  ]
} as unknown as WorkerLaunchPlanArtifact;

// A plan-shaped object with sibling keys that locale collation orders differently from UTF-16 code units.
const collidingLaunchPlan = { ...realisticLaunchPlan, scoredAt: 2, scoreVersion: 1, B: 3, a: 4, _c: 5 } as unknown as WorkerLaunchPlanArtifact;

const localeCanonicalize = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(localeCanonicalize)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value as Record<string, unknown>)
            .sort((left, right) => left.localeCompare(right))
            .map((key) => [key, localeCanonicalize((value as Record<string, unknown>)[key])])
        )
      : value;
/** The fingerprint a previous version stored: keys ordered with localeCompare, pretty-printed with a trailing newline. */
const legacyFingerprint = (launchPlan: unknown): string =>
  createHash('sha256').update(`${JSON.stringify(localeCanonicalize(launchPlan), null, 2)}\n`, 'utf8').digest('hex');

const reverseLocaleCompare = (): void => {
  vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (this: string, other: string): number {
    const left = String(this);
    return left < other ? 1 : left > other ? -1 : 0;
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('launch-plan fingerprint is locale independent', () => {
  it('keeps the fingerprint and run id that existed before the change for a real launch-plan shape', () => {
    // Values captured from the build before this change (localeCompare key order). They must not move.
    expect(computeLaunchPlanFingerprint(realisticLaunchPlan)).toBe('076ac901c0e9d4e4ff31ff2426689fe85595edd89b5d64db19c6edd25f4ba4c0');
    expect(deriveOrchestrationRunId(realisticLaunchPlan)).toBe('pb-exec-076ac901c0e9');
    expect(legacyFingerprint(realisticLaunchPlan)).toBe(computeLaunchPlanFingerprint(realisticLaunchPlan));
  });

  it('does not change when localeCompare orders strings differently (another locale)', () => {
    const before = computeLaunchPlanFingerprint(collidingLaunchPlan);

    reverseLocaleCompare();

    expect(computeLaunchPlanFingerprint(collidingLaunchPlan)).toBe(before);
    expect(launchPlanFingerprintMatches(before, collidingLaunchPlan)).toBe(true);
  });

  it('recognises a fingerprint stored with the previous locale-collation key order, and rejects any other value', () => {
    const stored = legacyFingerprint(collidingLaunchPlan);
    // Guard: only meaningful where the runtime collates these keys differently from code units (any ICU build).
    expect(stored).not.toBe(computeLaunchPlanFingerprint(collidingLaunchPlan));

    expect(launchPlanFingerprintMatches(stored, collidingLaunchPlan)).toBe(true);
    expect(launchPlanFingerprintMatches(stored, { ...collidingLaunchPlan, generatedAt: '2020-01-01T00:00:00.000Z' })).toBe(false);
    expect(launchPlanFingerprintMatches('0'.repeat(64), collidingLaunchPlan)).toBe(false);
  });

  it('merge guards do not report a run stale when its stored fingerprint used the previous key order', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'execution-merge-guards-legacy-fingerprint-'));
    const writeJson = (relativePath: string, value: unknown): void => {
      const absolutePath = path.join(repo, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    };
    const runState = (fingerprint: string) => ({
      schemaVersion: '1.0',
      kind: 'orchestration-execution-run-state',
      run_id: 'pb-exec-test',
      source_launch_plan_fingerprint: fingerprint,
      eligible_lanes: ['lane-1'],
      status: 'completed',
      lanes: {
        'lane-1': {
          lane_id: 'lane-1',
          status: 'completed',
          blocker_refs: [],
          receipt_refs: [],
          worker_id: 'worker-1',
          started_at: '1970-01-01T00:00:00.000Z',
          completed_at: '1970-01-01T00:00:10.000Z',
          updated_at: '1970-01-01T00:00:10.000Z'
        }
      },
      metadata: { runtime: 'execution-supervisor', resumed_from_interrupted_run: false, reconcile_revision: 1 },
      created_at: '1970-01-01T00:00:00.000Z',
      updated_at: '1970-01-01T00:00:10.000Z',
      completed_at: '1970-01-01T00:00:10.000Z'
    });
    writeJson('.playbook/worker-launch-plan.json', collidingLaunchPlan);

    writeJson('.playbook/execution-runs/pb-exec-test.json', runState(legacyFingerprint(collidingLaunchPlan)));
    const accepted = evaluateExecutionMergeGuards(repo).runs[0];
    expect(accepted?.blockingReasons.some((reason) => reason.includes('run-state-launch-plan-fingerprint-mismatch'))).toBe(false);

    writeJson('.playbook/execution-runs/pb-exec-test.json', runState('0'.repeat(64)));
    const rejected = evaluateExecutionMergeGuards(repo).runs[0];
    expect(rejected?.blockingReasons.some((reason) => reason.includes('run-state-launch-plan-fingerprint-mismatch'))).toBe(true);
  });
});
