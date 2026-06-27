import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { runSession } from './session.js';
import { resolveSessionMergeInputs } from './sessionMergeInputs.js';

const createFile = (filePath: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '{}\n', 'utf8');
};

const writeExecutionRunsFixture = (repo: string): void => {
  const runsDir = path.join(repo, '.playbook', 'execution-runs');
  fs.mkdirSync(runsDir, { recursive: true });
  fs.writeFileSync(
    path.join(runsDir, 'pb-exec-0001.json'),
    JSON.stringify(
      {
        schemaVersion: '1.0',
        kind: 'orchestration-execution-run-state',
        run_id: 'pb-exec-0001',
        source_launch_plan_fingerprint: 'abc123',
        eligible_lanes: ['lane-1'],
        status: 'completed',
        lanes: {
          'lane-1': {
            lane_id: 'lane-1',
            status: 'completed',
            blocker_refs: [],
            receipt_refs: ['execution-state:pb-exec-0001:lane:lane-1:worker:worker-lane-1'],
            worker_id: 'worker-lane-1',
            started_at: '2026-01-01T00:00:00.000Z',
            completed_at: '2026-01-01T00:01:00.000Z',
            updated_at: '2026-01-01T00:01:00.000Z'
          }
        },
        metadata: { runtime: 'execution-supervisor', resumed_from_interrupted_run: false, reconcile_revision: 1 },
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:01:00.000Z',
        completed_at: '2026-01-01T00:01:00.000Z'
      },
      null,
      2
    )
  );
};

const writeSessionFixture = (repo: string): void => {
  const sessionPath = path.join(repo, '.playbook', 'session.json');
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(
    sessionPath,
    JSON.stringify(
      {
        version: 1,
        sessionId: 'session-test',
        repoRoot: repo,
        activeGoal: 'inspect continuity',
        selectedRunId: 'pb-exec-0001',
        pinnedArtifacts: [{ artifact: '.playbook/policy-apply-result.json', kind: 'artifact', pinnedAt: '2026-01-01T00:00:00.000Z' }],
        currentStep: 'resume',
        unresolvedQuestions: [],
        constraints: [],
        evidenceEnvelope: {
          version: 1,
          session_id: 'session-test',
          selected_run_id: 'pb-exec-0001',
          cycle_id: null,
          generated_from_last_updated_time: '2026-01-01T00:02:00.000Z',
          artifacts: [{ path: '.playbook/session.json', kind: 'session', present: true }],
          proposal_ids: [],
          policy_decisions: [],
          execution_result: null,
          lineage: []
        },
        lastUpdatedTime: '2026-01-01T00:02:00.000Z'
      },
      null,
      2
    )
  );
};

const writeLongitudinalStateFixture = (repo: string): void => {
  const statePath = path.join(repo, '.playbook', 'longitudinal-state.json');
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(
    statePath,
    JSON.stringify(
      {
        schemaVersion: '1.0',
        kind: 'playbook-longitudinal-state',
        generatedAt: '2026-01-01T00:03:00.000Z',
        unresolved_risk_summary: { total_open: 3, high: 1, medium: 1, low: 1 },
        recurring_finding_clusters: [{ cluster_id: 'cluster-auth', occurrences: 4, unresolved: 2 }],
        verification_lineage: {
          latest_verification_ref: '.playbook/verify-report.json',
          latest_verified_at: '2026-01-01T00:03:00.000Z',
          latest_approval_refs: ['.playbook/improvement-approvals.json']
        },
        knowledge_lifecycle_summary: { candidate: 2, promoted: 5, superseded: 1 }
      },
      null,
      2
    )
  );
};

describe('resolveSessionMergeInputs', () => {
  it('supports explicit file inputs', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-cli-session-'));
    createFile(path.join(cwd, '.playbook/sessions/one.json'));
    createFile(path.join(cwd, '.playbook/sessions/two.json'));

    const resolved = resolveSessionMergeInputs(cwd, ['.playbook/sessions/one.json', '.playbook/sessions/two.json']);

    expect(resolved).toEqual([
      path.join(cwd, '.playbook/sessions/one.json'),
      path.join(cwd, '.playbook/sessions/two.json')
    ]);
  });

  it('supports directory inputs by expanding top-level json files', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-cli-session-dir-'));
    createFile(path.join(cwd, '.playbook/sessions/b.json'));
    createFile(path.join(cwd, '.playbook/sessions/a.json'));
    createFile(path.join(cwd, '.playbook/sessions/ignore.txt'));

    const resolved = resolveSessionMergeInputs(cwd, ['.playbook/sessions']);

    expect(resolved).toEqual([
      path.join(cwd, '.playbook/sessions/a.json'),
      path.join(cwd, '.playbook/sessions/b.json')
    ]);
  });

  it('supports glob inputs', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-cli-session-glob-'));
    createFile(path.join(cwd, '.playbook/sessions/2.json'));
    createFile(path.join(cwd, '.playbook/sessions/1.json'));

    const resolved = resolveSessionMergeInputs(cwd, ['.playbook/sessions/*.json']);

    expect(resolved).toEqual([
      path.join(cwd, '.playbook/sessions/1.json'),
      path.join(cwd, '.playbook/sessions/2.json')
    ]);
  });

  it('warns when a glob input has no matches', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-cli-session-empty-glob-'));
    const warn = vi.fn();

    const resolved = resolveSessionMergeInputs(cwd, ['.playbook/sessions/*.json'], { warn });

    expect(resolved).toEqual([]);
    expect(warn).toHaveBeenCalledWith('No snapshot files matched glob pattern: .playbook/sessions/*.json');
  });
});

describe('runSession', () => {
  it('adds doctrine bootstrap metadata to empty session show output', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-cli-session-show-empty-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runSession(cwd, ['show'], { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.command).toBe('session.show');
    expect(payload.summary).toBe('No active repo-scoped session found.');
    expect(payload.continuity).toEqual({
      doctrine: {
        role: 'core_continuity_doctrine',
        path: 'docs/contracts/PLAYBOOK-CONTRACT.md',
        export_path: 'exports/playbook.contract.example.v1.json',
        registration_state: 'registered'
      },
      active_session_refs: [],
      pinned_evidence_refs: [],
      latest_run_id: null,
      latest_receipt_refs: [],
      missing_session_refs: ['.playbook/session.json'],
      stale_or_missing_state: ['session_missing']
    });
    expect(payload.longitudinal_state).toBeDefined();

    logSpy.mockRestore();
  });

  it('adds doctrine bootstrap metadata to session show continuity output', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-cli-session-show-'));
    writeExecutionRunsFixture(cwd);
    writeSessionFixture(cwd);
    writeLongitudinalStateFixture(cwd);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runSession(cwd, ['show'], { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.command).toBe('session.show');
    expect(payload.continuity).toEqual({
      doctrine: {
        role: 'core_continuity_doctrine',
        path: 'docs/contracts/PLAYBOOK-CONTRACT.md',
        export_path: 'exports/playbook.contract.example.v1.json',
        registration_state: 'registered'
      },
      active_session_refs: ['.playbook/session.json'],
      pinned_evidence_refs: ['.playbook/policy-apply-result.json'],
      latest_run_id: 'pb-exec-0001',
      latest_receipt_refs: ['execution-state:pb-exec-0001:lane:lane-1:worker:worker-lane-1'],
      missing_session_refs: [],
      stale_or_missing_state: []
    });
    expect(payload.longitudinal_state).toMatchObject({
      unresolved_risk_summary: { total_open: 3, high: 1, medium: 1, low: 1 },
      recurring_finding_clusters: [{ cluster_id: 'cluster-auth', occurrences: 4, unresolved: 2 }]
    });

    logSpy.mockRestore();
  });
});
