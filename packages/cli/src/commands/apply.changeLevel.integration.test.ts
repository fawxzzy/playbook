import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as engine from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
import { runApply } from './apply.js';

// Real engine, real filesystem: no engine mocks. These tests exercise the whole `apply --from-plan` path.

const OVERRIDE_REASON = 'Release owner approved the workflow edit (ticket 42)';

let repoDir: string;
let logSpy: ReturnType<typeof vi.spyOn>;

const writePlan = (tasks: unknown[], name = 'plan.json'): void => {
  fs.writeFileSync(
    path.join(repoDir, name),
    JSON.stringify({
      schemaVersion: '1.0',
      command: 'plan',
      remediation: { status: 'ready', totalSteps: tasks.length, unresolvedFailures: 0 },
      tasks
    })
  );
};

const workflowManagedWriteTask = (spelling: string, original: string) => ({
  id: 'task-workflow-managed-write',
  ruleId: 'docs-consolidation.managed-write',
  file: spelling,
  action: 'append managed block',
  autoFix: true,
  write: {
    operation: 'append-managed-block',
    blockId: 'approved',
    startMarker: '# <!-- START -->',
    endMarker: '# <!-- END -->',
    content: '# <!-- START -->\n# approved\n# <!-- END -->'
  },
  preconditions: {
    target_path: spelling,
    target_file_fingerprint: createHash('sha256').update(original, 'utf8').digest('hex'),
    approved_fragment_ids: [],
    planned_operation: 'append-managed-block'
  }
});

const runFromPlan = (extra: Record<string, unknown> = {}) =>
  runApply(repoDir, { format: 'json', ci: false, quiet: true, fromPlan: 'plan.json', skipReleaseGovernanceBoundary: true, ...extra });

const lastJson = (): { summary: { applied: number }; changeLevelOverride?: unknown } => JSON.parse(String(logSpy.mock.calls.at(-1)?.[0]));

const overrideEvents = (): Array<{ summary: string }> => {
  const dir = path.join(repoDir, '.playbook', 'memory', 'events', 'runtime');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8')) as { eventType: string; summary: string })
    .filter((event) => event.eventType === 'apply.change-level-override.v1');
};

beforeEach(() => {
  repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-apply-integration-'));
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
  fs.rmSync(repoDir, { recursive: true, force: true });
});

describe('apply change-level override (real engine)', () => {
  const setupWorkflow = (): { workflow: string; original: string } => {
    const workflow = path.join(repoDir, '.github', 'workflows', 'ci.yml');
    fs.mkdirSync(path.dirname(workflow), { recursive: true });
    const original = 'name: ci\n';
    fs.writeFileSync(workflow, original);
    return { workflow, original };
  };

  it.each(['.github/workflows/ci.yml', 'docs/../.github/workflows/ci.yml', './/.github/workflows/ci.yml'])(
    'rejects a Level 3 task aimed at %s when neither flag is given, and leaves the file untouched',
    async (spelling) => {
      const { workflow, original } = setupWorkflow();
      writePlan([workflowManagedWriteTask(spelling, original)]);

      await expect(runFromPlan()).rejects.toThrow(/change level exceeds the apply ceiling/);

      expect(fs.readFileSync(workflow, 'utf8')).toBe(original);
      expect(overrideEvents()).toEqual([]);
    }
  );

  it('rejects when only --allow-level or only --reason is given', async () => {
    const { workflow, original } = setupWorkflow();
    writePlan([workflowManagedWriteTask('.github/workflows/ci.yml', original)]);

    await expect(runFromPlan({ allowLevel: '3' })).rejects.toThrow(/provided together/);
    await expect(runFromPlan({ reason: OVERRIDE_REASON })).rejects.toThrow(/provided together/);
    await expect(runFromPlan({ allowLevel: '2', reason: OVERRIDE_REASON })).rejects.toThrow(/only accepts 3/);

    expect(fs.readFileSync(workflow, 'utf8')).toBe(original);
  });

  it('applies the Level 3 task with both flags and records the reason in the result and a memory event', async () => {
    const { workflow, original } = setupWorkflow();
    writePlan([workflowManagedWriteTask('docs/../.github/workflows/ci.yml', original)]);

    const exitCode = await runFromPlan({ allowLevel: '3', reason: OVERRIDE_REASON });

    expect(exitCode).toBe(ExitCode.Success);
    expect(fs.readFileSync(workflow, 'utf8')).toContain('# approved');
    const payload = lastJson();
    expect(payload.summary.applied).toBe(1);
    expect(payload.changeLevelOverride).toEqual({
      allowLevel: 3,
      reason: OVERRIDE_REASON,
      overriddenTaskIds: ['task-workflow-managed-write']
    });
    const events = overrideEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.summary).toContain(OVERRIDE_REASON);
  });

  it('leaves default behavior unchanged for Level 1 tasks (no override fields, no override event)', async () => {
    writePlan([{ id: 'task-notes', ruleId: 'notes.missing', file: null, action: 'create playbook notes file', autoFix: true }]);

    const exitCode = await runFromPlan();

    expect(exitCode).toBe(ExitCode.Success);
    expect(fs.existsSync(path.join(repoDir, 'docs', 'PLAYBOOK_NOTES.md'))).toBe(true);
    expect(lastJson()).not.toHaveProperty('changeLevelOverride');
    expect(overrideEvents()).toEqual([]);
  });
});

describe('apply change-scope binding (real engine)', () => {
  const notesTask = { id: 'task-notes', ruleId: 'notes.missing', file: null, action: 'create playbook notes file', autoFix: true };
  const otherTask = { id: 'task-other', ruleId: 'plugin.other', file: 'docs/other.md', action: 'fix other', autoFix: true };

  const writeScopeFor = (tasks: Array<{ id: string; ruleId: string; file: string | null; action: string; autoFix: boolean }>): void => {
    engine.writeChangeScopeArtifact(repoDir, engine.buildChangeScopeBundleFromPlan({ tasks }));
  };

  it('applies when the change-scope was written for exactly this plan', async () => {
    const gitignoreTask = { id: 'task-gitignore', ruleId: 'PB013', file: '.gitignore', action: 'ignore runtime artifacts', autoFix: true };
    writePlan([gitignoreTask]);
    writeScopeFor([gitignoreTask]);

    const exitCode = await runFromPlan();

    expect(exitCode).toBe(ExitCode.Success);
    expect(lastJson().summary.applied).toBe(1);
    expect(fs.existsSync(path.join(repoDir, '.gitignore'))).toBe(true);
  });

  it('refuses, and mutates nothing, when the change-scope belongs to a different plan', async () => {
    writePlan([notesTask]);
    writeScopeFor([otherTask]);

    await expect(runFromPlan()).rejects.toThrow(/Change-scope binding failed.*different plan/);

    expect(fs.existsSync(path.join(repoDir, 'docs', 'PLAYBOOK_NOTES.md'))).toBe(false);
  });

  it('refuses a change-scope last written by analyze-pr', async () => {
    writePlan([notesTask]);
    engine.writeChangeScopeArtifact(
      repoDir,
      engine.buildChangeScopeBundleFromAnalyzePr({
        changedFiles: ['docs/PLAYBOOK_NOTES.md'],
        risk: { level: 'low' },
        rules: { related: [] },
        reviewGuidance: [],
        docs: { changed: [] }
      })
    );

    await expect(runFromPlan()).rejects.toThrow(/written by "analyze-pr"/);
    expect(fs.existsSync(path.join(repoDir, 'docs', 'PLAYBOOK_NOTES.md'))).toBe(false);
  });
});

describe('apply maintenance branch validation (real engine)', () => {
  it('rejects maintenance tasks that fail plan validation before any maintenance command runs', async () => {
    const row = {
      maintenanceId: 'm1',
      maintenanceType: 'docs-audit-maintenance',
      boundedTargetSurface: 'docs/',
      sourceEvidenceRefs: []
    };
    fs.mkdirSync(path.join(repoDir, '.playbook'), { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, 'plan.json'),
      JSON.stringify({ schemaVersion: '1.0', kind: 'playbook-maintenance-plan', maintenanceRows: [row, row] })
    );
    fs.writeFileSync(
      path.join(repoDir, '.playbook', 'maintenance-approvals.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        kind: 'playbook-maintenance-approvals',
        generatedAt: new Date(0).toISOString(),
        approvals: [{ maintenanceId: 'm1', approved: true, approvalRef: 'approval:1', approvedBy: 'owner', boundedTargetSurface: 'docs/' }]
      })
    );
    fs.writeFileSync(
      path.join(repoDir, '.playbook', 'policy-evaluation.json'),
      JSON.stringify({ evaluations: [{ proposal_id: 'maintenance:m1', decision: 'safe', reason: 'approved' }] })
    );

    // Duplicate task ids are a plan-validation failure that previously went unchecked on this branch.
    await expect(runFromPlan()).rejects.toThrow(/duplicate task id/);

    expect(fs.existsSync(path.join(repoDir, '.playbook', 'maintenance-execution-receipt.json'))).toBe(false);
    expect(fs.existsSync(path.join(repoDir, '.playbook', 'maintenance-execution-state.json'))).toBe(false);
  });
});
