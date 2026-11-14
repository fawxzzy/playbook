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

describe('computePlanArtifactDigest covers what a task writes', () => {
  const base = {
    id: 'task-w',
    ruleId: 'docs-consolidation.managed-write',
    file: 'docs/a.md',
    action: 'write block',
    autoFix: true,
    task_kind: 'docs-managed-write',
    write: { operation: 'replace-managed-block', blockId: 'b', startMarker: '<!-- S -->', endMarker: '<!-- E -->', content: 'approved content' },
    preconditions: { target_path: 'docs/a.md', target_file_fingerprint: 'abc', approved_fragment_ids: ['f1'], planned_operation: 'replace-managed-block' }
  };
  const digest = (task: Record<string, unknown>) => computePlanArtifactDigest([task as never]);

  it('changes when a hand-edited plan changes write content, operation, markers or preconditions under the same task id', () => {
    const original = digest(base);
    expect(digest({ ...base, write: { ...base.write, content: 'attacker content' } })).not.toBe(original);
    expect(digest({ ...base, write: { ...base.write, operation: 'append-managed-block' } })).not.toBe(original);
    expect(digest({ ...base, write: { ...base.write, startMarker: '<!-- X -->' } })).not.toBe(original);
    expect(digest({ ...base, preconditions: { ...base.preconditions, target_file_fingerprint: 'zzz' } })).not.toBe(original);
    expect(digest({ ...base, task_kind: 'release-package-version' })).not.toBe(original);
  });

  it('covers provenance (handlers read it, for example the release version bump) but not the advisory block', () => {
    const release = { ...base, ruleId: 'release.package-json.version', provenance: { package_name: '@scope/alpha', current_version: '1.2.3', next_version: '1.2.4' } };
    const original = digest(release);
    expect(digest({ ...release, provenance: { ...release.provenance, next_version: '9.9.9' } })).not.toBe(original);
    expect(digest({ ...release, provenance: undefined })).not.toBe(original);
    expect(digest({ ...release, provenance: null })).toBe(digest({ ...release, provenance: undefined }));
    // advisory is ranking rationale that no handler reads; it is excluded on purpose, like changeLevel.
    expect(digest({ ...release, advisory: { outcomeLearning: { rationale: 'ranked by promoted knowledge', confidence: 0.9 } } })).toBe(original);
  });

  it('is independent of key order and of the additive changeLevel label', () => {
    const reordered = {
      preconditions: { planned_operation: 'replace-managed-block', approved_fragment_ids: ['f1'], target_file_fingerprint: 'abc', target_path: 'docs/a.md' },
      write: { content: 'approved content', endMarker: '<!-- E -->', startMarker: '<!-- S -->', blockId: 'b', operation: 'replace-managed-block' },
      task_kind: 'docs-managed-write',
      autoFix: true,
      action: 'write block',
      file: 'docs/a.md',
      ruleId: 'docs-consolidation.managed-write',
      id: 'task-w',
      changeLevel: 1
    };
    expect(digest(reordered)).toBe(digest(base));
  });

  it('treats null and undefined consistently for every optional field', () => {
    const plain = { id: 't', ruleId: 'r', action: 'a', autoFix: true };
    expect(digest({ ...plain, file: null, task_kind: null, write: null, preconditions: null })).toBe(digest({ ...plain }));
    expect(digest({ ...plain, file: undefined, task_kind: undefined, write: undefined, preconditions: undefined })).toBe(digest({ ...plain, file: null }));
    expect(digest({ ...plain, write: { operation: 'x', content: 'y' } })).not.toBe(digest({ ...plain, write: null }));
  });

  it('still depends on task order and membership', () => {
    const a = { id: 'a', ruleId: 'r', file: null, action: 'a', autoFix: true };
    const b = { id: 'b', ruleId: 'r', file: null, action: 'b', autoFix: true };
    expect(computePlanArtifactDigest([a, b])).not.toBe(computePlanArtifactDigest([b, a]));
    expect(computePlanArtifactDigest([a])).not.toBe(computePlanArtifactDigest([a, b]));
  });
});

describe('plugin tasks without a declared file stay fail-closed (TM-GAP-14 does not loosen enforcement)', () => {
  it('still refuses a proposal-only scope for a plugin task that declares no file', () => {
    const bundle = buildChangeScopeBundleFromPlan({ tasks: [{ id: 'task-plugin', ruleId: 'plugin.rule', file: null, action: 'plugin fix', autoFix: true }] });
    expect(bundle.mutationScope.allowedFiles).toEqual([]);
    expect(bundle.mutationScope.boundaryChecks).toContain('proposal-only-no-write-authority');
    const scope = {
      scopeId: bundle.scopeId,
      source: bundle.source,
      allowedFiles: bundle.mutationScope.allowedFiles,
      patchSizeBudget: bundle.mutationScope.patchSizeBudget,
      boundaryChecks: bundle.mutationScope.boundaryChecks
    };

    expect(() =>
      enforceApplyChangeScope([{ id: 'task-plugin', ruleId: 'plugin.rule', file: null, action: 'plugin fix', autoFix: true }], scope)
    ).toThrow(/required boundary checks are missing/);
  });

  it('gives the built-in notes.missing plan write authority for exactly its target file', () => {
    const task = { id: 'task-notes', ruleId: 'notes.missing', file: 'docs/PLAYBOOK_NOTES.md', action: 'create playbook notes file', autoFix: true };
    const bundle = buildChangeScopeBundleFromPlan({ tasks: [task] });
    const scope = {
      scopeId: bundle.scopeId,
      source: bundle.source,
      allowedFiles: bundle.mutationScope.allowedFiles,
      patchSizeBudget: bundle.mutationScope.patchSizeBudget,
      boundaryChecks: bundle.mutationScope.boundaryChecks
    };

    expect(() => enforceApplyChangeScope([task], scope)).not.toThrow();
    expect(() => enforceApplyChangeScope([{ ...task, file: 'docs/OTHER.md' }], scope)).toThrow(/out-of-scope mutation/);
  });
});
