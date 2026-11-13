import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as engine from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
import { runApply } from './apply.js';
import { runPlan } from './plan.js';

vi.setConfig({ testTimeout: 60_000 });

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

const git = (...args: string[]): void => {
  const result = spawnSync('git', args, { cwd: repoDir, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
};

/** Real `plan --json`: writes .playbook/plan.json and .playbook/change-scope.json; returns the emitted plan payload. */
const runRealPlan = async (): Promise<{ tasks: Array<{ id: string; ruleId: string; file: string | null; action: string }> }> => {
  const before = logSpy.mock.calls.length;
  await runPlan(repoDir, { format: 'json', ci: false, quiet: true });
  return JSON.parse(String(logSpy.mock.calls[before]?.[0]));
};

describe('plan --json -> apply --from-plan for notes.missing (TM-GAP-14, real engine)', () => {
  it('runs the whole verify -> plan -> apply -> verify loop with a change-scope file present', async () => {
    fs.mkdirSync(path.join(repoDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'docs', 'PROJECT_GOVERNANCE.md'), '# Governance\n');

    const plan = await runRealPlan();
    expect(plan.tasks).toEqual([expect.objectContaining({ ruleId: 'notes.missing', file: 'docs/PLAYBOOK_NOTES.md', autoFix: true })]);

    const scope = JSON.parse(fs.readFileSync(path.join(repoDir, '.playbook', 'change-scope.json'), 'utf8')).bundles[0];
    expect(scope.mutationScope.allowedFiles).toEqual(['docs/PLAYBOOK_NOTES.md']);
    expect(scope.mutationScope.boundaryChecks).toContain('writes-must-stay-inside-allowedFiles');
    expect(scope.mutationScope.boundaryChecks).not.toContain('proposal-only-no-write-authority');

    const exitCode = await runFromPlan({ fromPlan: '.playbook/plan.json' });

    expect(exitCode).toBe(ExitCode.Success);
    expect(lastJson().summary).toMatchObject({ applied: 1, failed: 0 });
    expect(fs.existsSync(path.join(repoDir, 'docs', 'PLAYBOOK_NOTES.md'))).toBe(true);

    // verify (the last step of the loop) is clean now.
    const before = logSpy.mock.calls.length;
    const replanned = await runRealPlan();
    expect(replanned.tasks.some((task) => task.ruleId === 'notes.missing')).toBe(false);
    expect(logSpy.mock.calls.length).toBeGreaterThan(before);
  });

  it('applies the same plan with no --from-plan (regenerated tasks) while the scope file is present', async () => {
    fs.mkdirSync(path.join(repoDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'docs', 'PROJECT_GOVERNANCE.md'), '# Governance\n');
    await runRealPlan();

    const exitCode = await runApply(repoDir, { format: 'json', ci: false, quiet: true, skipReleaseGovernanceBoundary: true });

    expect(exitCode).toBe(ExitCode.Success);
    expect(fs.existsSync(path.join(repoDir, 'docs', 'PLAYBOOK_NOTES.md'))).toBe(true);
  });
});

describe('plan --json -> apply --from-plan roundtrip (real engine)', () => {
  // A committed runtime artifact makes verify/plan emit a file-bearing task (PB013 -> .gitignore) next to notes.missing.
  const setupRepoWithFileBearingPlan = async () => {
    fs.mkdirSync(path.join(repoDir, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(repoDir, '.playbook'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'docs', 'PROJECT_GOVERNANCE.md'), '# Governance\n');
    fs.writeFileSync(path.join(repoDir, '.playbook', 'repo-index.json'), '{}\n');
    git('init', '-b', 'main');
    git('config', 'user.email', 'playbook@example.com');
    git('config', 'user.name', 'Playbook Test');
    git('add', '-f', '.');
    git('commit', '-m', 'initial');
    const plan = await runRealPlan();
    expect(plan.tasks.some((task) => task.ruleId === 'PB013' && task.file === '.gitignore')).toBe(true);
    return plan;
  };

  it('applies the plan it just wrote: scope digest binds and the tasks run', async () => {
    await setupRepoWithFileBearingPlan();

    const scope = JSON.parse(fs.readFileSync(path.join(repoDir, '.playbook', 'change-scope.json'), 'utf8')).bundles[0];
    expect(scope.source.command).toBe('plan');
    expect(scope.source.artifactDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

    const exitCode = await runFromPlan({ fromPlan: '.playbook/plan.json' });

    expect(exitCode).toBe(ExitCode.Success);
    expect(lastJson().summary.applied).toBeGreaterThanOrEqual(1);
    expect(fs.readFileSync(path.join(repoDir, '.gitignore'), 'utf8')).toContain('.playbook/repo-index.json');
  });

  it('refuses a hand-edited plan.json under the scope the real plan wrote, and mutates nothing', async () => {
    await setupRepoWithFileBearingPlan();
    const planPath = path.join(repoDir, '.playbook', 'plan.json');
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
    plan.tasks = plan.tasks.map((task: { ruleId: string; action: string }) => (task.ruleId === 'PB013' ? { ...task, action: 'edited after review' } : task));
    fs.writeFileSync(planPath, JSON.stringify(plan));

    await expect(runFromPlan({ fromPlan: '.playbook/plan.json' })).rejects.toThrow(/Change-scope binding failed.*different plan.*or remove \.playbook\/change-scope\.json/s);

    expect(fs.existsSync(path.join(repoDir, '.gitignore'))).toBe(false);
  });

  it('with no --from-plan, enforces scope limits but does not block on a digest mismatch', async () => {
    await setupRepoWithFileBearingPlan();
    // Change the repo after planning so the regenerated tasks no longer match the written plan digest.
    fs.writeFileSync(path.join(repoDir, 'docs', 'PLAYBOOK_NOTES.md'), '# Notes\n\n- reviewed\n');
    const scopePath = path.join(repoDir, '.playbook', 'change-scope.json');
    const scope = JSON.parse(fs.readFileSync(scopePath, 'utf8'));
    expect(scope.bundles[0].source.artifactDigest).toBeDefined();

    const exitCode = await runApply(repoDir, { format: 'json', ci: false, quiet: true, skipReleaseGovernanceBoundary: true });

    expect(exitCode).toBe(ExitCode.Success);
  });
});

describe('a leftover plan-sourced change-scope does not block first-party non-plan applies (real engine)', () => {
  const leaveBehindPlanSourcedScope = async () => {
    fs.mkdirSync(path.join(repoDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'docs', 'PROJECT_GOVERNANCE.md'), '# Governance\n');
    await runRealPlan();
    const scope = JSON.parse(fs.readFileSync(path.join(repoDir, '.playbook', 'change-scope.json'), 'utf8')).bundles[0];
    expect(scope.source.command).toBe('plan');
    // The scope only allows the notes file, so a release or fix plan that read it would be rejected as out of scope.
    expect(scope.mutationScope.allowedFiles).toEqual(['docs/PLAYBOOK_NOTES.md']);
  };

  it('release sync path: applies a release-plan artifact that bumps a real package.json', async () => {
    await leaveBehindPlanSourcedScope();
    fs.mkdirSync(path.join(repoDir, 'packages', 'alpha'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'packages', 'alpha', 'package.json'), JSON.stringify({ name: '@scope/alpha', version: '1.2.3' }, null, 2) + '\n');
    const releasePlan = {
      schemaVersion: '1.0',
      kind: 'playbook-release-plan',
      generatedAt: '2026-03-22T00:00:00.000Z',
      summary: { recommendedBump: 'patch', reasons: ['shipped internal code changed'] },
      packages: [{ name: '@scope/alpha', path: 'packages/alpha', currentVersion: '1.2.3', recommendedBump: 'patch', versionGroup: 'lockstep', reasons: ['changed'], evidence: [] }],
      versionGroups: [{ name: 'lockstep', packages: ['@scope/alpha'], recommendedBump: 'patch', reasons: ['changed'] }],
      tasks: [
        {
          id: 'task-release-alpha',
          ruleId: 'release.package-json.version',
          file: 'packages/alpha/package.json',
          action: 'Update @scope/alpha package.json to 1.2.4',
          autoFix: true,
          task_kind: 'release-package-version',
          provenance: {
            package_name: '@scope/alpha',
            package_path: 'packages/alpha',
            current_version: '1.2.3',
            next_version: '1.2.4',
            version_group: 'lockstep',
            linked_workspace_versions: [{ name: '@scope/alpha', currentVersion: '1.2.3', nextVersion: '1.2.4' }]
          }
        }
      ]
    };
    fs.writeFileSync(path.join(repoDir, '.playbook', 'release-plan.json'), JSON.stringify(releasePlan));

    const exitCode = await runFromPlan({ fromPlan: '.playbook/release-plan.json' });

    expect(exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(fs.readFileSync(path.join(repoDir, 'packages', 'alpha', 'package.json'), 'utf8')).version).toBe('1.2.4');
  });

  it('test-autofix path: applies a test-fix-plan artifact without consulting the scope', async () => {
    await leaveBehindPlanSourcedScope();
    const fixPlan = {
      schemaVersion: '1.0',
      kind: 'test-fix-plan',
      command: 'test-fix-plan',
      generatedAt: '1970-01-01T00:00:00.000Z',
      tasks: [{ id: 'task-test-fix', ruleId: 'test-triage.snapshot-refresh', file: 'packages/cli/src/commands/schema.test.ts', action: 'refresh snapshot', autoFix: true }],
      excluded: [],
      summary: { total_findings: 1, eligible_findings: 1, excluded_findings: 0, auto_fix_tasks: 1 }
    };
    fs.writeFileSync(path.join(repoDir, '.playbook', 'test-fix-plan.json'), JSON.stringify(fixPlan));

    const exitCode = await runFromPlan({ fromPlan: '.playbook/test-fix-plan.json' });

    // No built-in handler exists for this rule, so the task is reported unsupported; the point is it was not blocked by the scope.
    expect(exitCode).toBe(ExitCode.Success);
    expect(lastJson().summary).toMatchObject({ applied: 0, failed: 0, unsupported: 1 });
  });
});

describe('apply override on maintenance plans (real engine)', () => {
  it('rejects --allow-level/--reason on a maintenance plan with a clear error instead of silently ignoring it', async () => {
    const row = { maintenanceId: 'm1', maintenanceType: 'docs-audit-maintenance', boundedTargetSurface: 'docs/', sourceEvidenceRefs: [] };
    fs.mkdirSync(path.join(repoDir, '.playbook'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'plan.json'), JSON.stringify({ schemaVersion: '1.0', kind: 'playbook-maintenance-plan', maintenanceRows: [row] }));
    fs.writeFileSync(
      path.join(repoDir, '.playbook', 'maintenance-approvals.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        kind: 'playbook-maintenance-approvals',
        generatedAt: new Date(0).toISOString(),
        approvals: [{ maintenanceId: 'm1', approved: true, approvalRef: 'approval:1', approvedBy: 'owner', boundedTargetSurface: 'docs/' }]
      })
    );
    fs.writeFileSync(path.join(repoDir, '.playbook', 'policy-evaluation.json'), JSON.stringify({ evaluations: [{ proposal_id: 'maintenance:m1', decision: 'safe', reason: 'approved' }] }));

    await expect(runFromPlan({ allowLevel: '3', reason: 'owner approved' })).rejects.toThrow(/cannot be used with maintenance-plan execution/);

    expect(fs.existsSync(path.join(repoDir, '.playbook', 'maintenance-execution-receipt.json'))).toBe(false);
  });

  it('rejects the override before any execution run is created', async () => {
    const row = { maintenanceId: 'm1', maintenanceType: 'docs-audit-maintenance', boundedTargetSurface: 'docs/', sourceEvidenceRefs: [] };
    fs.mkdirSync(path.join(repoDir, '.playbook'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'plan.json'), JSON.stringify({ schemaVersion: '1.0', kind: 'playbook-maintenance-plan', maintenanceRows: [row] }));
    fs.writeFileSync(
      path.join(repoDir, '.playbook', 'maintenance-approvals.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        kind: 'playbook-maintenance-approvals',
        generatedAt: new Date(0).toISOString(),
        approvals: [{ maintenanceId: 'm1', approved: true, approvalRef: 'approval:1', approvedBy: 'owner', boundedTargetSurface: 'docs/' }]
      })
    );
    fs.writeFileSync(path.join(repoDir, '.playbook', 'policy-evaluation.json'), JSON.stringify({ evaluations: [{ proposal_id: 'maintenance:m1', decision: 'safe', reason: 'approved' }] }));
    const before = fs.readdirSync(path.join(repoDir, '.playbook')).sort();

    await expect(runFromPlan({ allowLevel: '3', reason: 'owner approved' })).rejects.toThrow(/cannot be used with maintenance-plan execution/);

    // resolveRunId would have created .playbook/runs/...; a refused request must leave no new files behind.
    expect(fs.readdirSync(path.join(repoDir, '.playbook')).sort()).toEqual(before);
    expect(fs.existsSync(path.join(repoDir, '.playbook', 'runs'))).toBe(false);
  });
});
