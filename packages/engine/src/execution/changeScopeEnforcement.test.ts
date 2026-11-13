import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildChangeScopeBundleFromAnalyzePr,
  buildChangeScopeBundleFromPlan,
  computePlanArtifactDigest,
  writeChangeScopeArtifact
} from '../changeScope.js';
import { assertApplyChangeScopeBinding, enforceApplyChangeScope, readApplyChangeScope, type ApplyChangeScope } from './changeScopeEnforcement.js';
import type { PlanTask } from './types.js';

const createScope = (overrides: Partial<ApplyChangeScope> = {}): ApplyChangeScope => ({
  scopeId: 'scope-test',
  source: { command: 'plan', artifactPath: '.playbook/plan.json', artifactDigest: 'sha256:test' },
  allowedFiles: ['packages/cli/src/commands/apply.ts'],
  patchSizeBudget: {
    maxFiles: 1,
    maxHunks: 2,
    maxAddedLines: 20,
    maxRemovedLines: 20
  },
  boundaryChecks: ['no-mutation-authority-escalation', 'writes-must-stay-inside-allowedFiles'],
  ...overrides
});

const managedWriteTask: PlanTask = {
  id: 'task-1',
  ruleId: 'docs-consolidation.managed-write',
  file: 'packages/cli/src/commands/apply.ts',
  action: 'update file',
  autoFix: true,
  write: {
    operation: 'replace-managed-block',
    blockId: 'block',
    startMarker: '<!-- START -->',
    endMarker: '<!-- END -->',
    content: 'line-1\nline-2\n'
  }
};

describe('enforceApplyChangeScope', () => {
  it('accepts in-scope mutation within budget', () => {
    expect(() => enforceApplyChangeScope([managedWriteTask], createScope())).not.toThrow();
  });

  it('fails when task file is outside allowedFiles', () => {
    const outOfScopeTask: PlanTask = {
      ...managedWriteTask,
      file: 'packages/engine/src/index.ts'
    };
    expect(() => enforceApplyChangeScope([outOfScopeTask], createScope())).toThrow(/out-of-scope mutation requested/);
  });

  it('fails when estimated patch budget is exceeded', () => {
    const tightScope = createScope({
      patchSizeBudget: {
        maxFiles: 1,
        maxHunks: 1,
        maxAddedLines: 1,
        maxRemovedLines: 20
      }
    });

    expect(() => enforceApplyChangeScope([managedWriteTask], tightScope)).toThrow(/patch budget exceeded/);
  });

  it('fails when required boundary checks are missing or red', () => {
    expect(() =>
      enforceApplyChangeScope([managedWriteTask], createScope({ boundaryChecks: ['writes-must-stay-inside-allowedFiles:red'] }))
    ).toThrow(/required boundary checks are missing/);

    expect(() =>
      enforceApplyChangeScope(
        [managedWriteTask],
        createScope({ boundaryChecks: ['no-mutation-authority-escalation:red', 'writes-must-stay-inside-allowedFiles'] })
      )
    ).toThrow(/boundary checks are red/);
  });
});


describe('assertApplyChangeScopeBinding (change-scope is bound to the plan being applied)', () => {
  const planTasks = [
    { id: 'task-a', ruleId: 'notes.missing', file: null, action: 'create notes', autoFix: true },
    { id: 'task-b', ruleId: 'plugin.rule', file: 'docs/b.md', action: 'fix b', autoFix: true }
  ];

  const writeAndRead = (bundle: ReturnType<typeof buildChangeScopeBundleFromPlan>) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-scope-binding-'));
    writeChangeScopeArtifact(root, bundle);
    const scope = readApplyChangeScope(root);
    if (!scope) throw new Error('expected a change-scope artifact');
    return scope;
  };

  it('accepts the scope written by `plan` for exactly that plan', () => {
    const scope = writeAndRead(buildChangeScopeBundleFromPlan({ tasks: planTasks }));
    expect(scope.source.command).toBe('plan');
    expect(() => assertApplyChangeScopeBinding(scope, computePlanArtifactDigest(planTasks))).not.toThrow();
  });

  it('keeps the digest stable when additive labels such as changeLevel are attached', () => {
    const labeled = planTasks.map((task) => ({ ...task, changeLevel: 2 }));
    expect(computePlanArtifactDigest(labeled)).toBe(computePlanArtifactDigest(planTasks));
  });

  it('refuses a scope derived from a different plan instead of enforcing it', () => {
    const scope = writeAndRead(buildChangeScopeBundleFromPlan({ tasks: planTasks }));
    const otherPlan = [...planTasks, { id: 'task-c', ruleId: 'plugin.rule', file: 'docs/c.md', action: 'fix c', autoFix: true }];
    expect(() => assertApplyChangeScopeBinding(scope, computePlanArtifactDigest(otherPlan))).toThrow(/derived from a different plan/);
  });

  it('refuses a scope whose task list differs only in a task file', () => {
    const scope = writeAndRead(buildChangeScopeBundleFromPlan({ tasks: planTasks }));
    const moved = planTasks.map((task) => (task.id === 'task-b' ? { ...task, file: 'docs/elsewhere.md' } : task));
    expect(() => assertApplyChangeScopeBinding(scope, computePlanArtifactDigest(moved))).toThrow(/different plan/);
  });

  it('refuses a scope last written by another command (analyze-pr overwrote the plan scope)', () => {
    const analyzeBundle = buildChangeScopeBundleFromAnalyzePr({
      changedFiles: ['docs/b.md'],
      risk: { level: 'low' },
      rules: { related: [] },
      reviewGuidance: [],
      docs: { changed: [] }
    } as never);
    const scope = writeAndRead(analyzeBundle as never);
    expect(scope.source.command).toBe('analyze-pr');
    expect(() => assertApplyChangeScopeBinding(scope, computePlanArtifactDigest(planTasks))).toThrow(/written by "analyze-pr"/);
  });

  it('refuses a legacy scope that has no plan digest', () => {
    const bundle = buildChangeScopeBundleFromPlan({ tasks: planTasks });
    delete bundle.source.artifactDigest;
    const scope = writeAndRead(bundle);
    expect(() => assertApplyChangeScopeBinding(scope, computePlanArtifactDigest(planTasks))).toThrow(/no plan digest/);
  });
});
