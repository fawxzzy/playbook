import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyExecutionPlan, FixExecutor, generateExecutionPlan, generatePlanContract, parsePlanArtifact, validateRemediationPlan, verifyRepo } from '../src/index.js';
import { HandlerResolver } from '../src/execution/index.js';

describe('verify -> plan -> apply -> verify workflow', () => {
  it('returns verify findings and plan tasks as an engine-backed contract', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-workflow-contract-'));
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'PROJECT_GOVERNANCE.md'), '# Governance\n');

    const contract = generatePlanContract(root);

    expect(contract.verify.ok).toBe(false);
    expect(contract.verify.summary.failures).toBe(1);
    expect(contract.verify.failures.map((failure) => failure.id)).toEqual(['notes.missing']);
    expect(contract.tasks).toEqual([
      {
        id: expect.any(String),
        ruleId: 'notes.missing',
        file: null,
        action: 'create playbook notes file',
        autoFix: true,
        changeLevel: 1
      }
    ]);
  });

  it('labels every plan-contract task with a trust-model change level and keeps ids/order stable', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-workflow-change-level-'));
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'PROJECT_GOVERNANCE.md'), '# Governance\n');

    const first = generatePlanContract(root);
    const second = generatePlanContract(root);

    expect(first.tasks.length).toBeGreaterThan(0);
    expect(first.tasks.every((task) => task.changeLevel === 1 || task.changeLevel === 2 || task.changeLevel === 3)).toBe(true);
    expect(second).toEqual(first);
  });

  it('round-trips changeLevel through parsePlanArtifact and rejects invalid declared levels', () => {
    const envelope = (changeLevel: unknown) => ({
      schemaVersion: '1.0',
      command: 'plan',
      tasks: [{ id: 'task-1', ruleId: 'notes.missing', file: null, action: 'create', autoFix: true, changeLevel }]
    });

    expect(parsePlanArtifact(envelope(1)).tasks[0]?.changeLevel).toBe(1);
    expect(
      parsePlanArtifact({ schemaVersion: '1.0', command: 'plan', tasks: [{ id: 't', ruleId: 'r', file: null, action: 'a', autoFix: true }] }).tasks[0]
    ).not.toHaveProperty('changeLevel');
    for (const invalid of [0, 4, '2', null, 1.5]) {
      expect(() => parsePlanArtifact(envelope(invalid))).toThrow(/task\.changeLevel must be 1, 2, or 3/);
    }
  });

  it('rejects Level 3 auto-fix tasks before any handler runs, even when a plugin handler is registered', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-workflow-level3-'));
    fs.mkdirSync(path.join(root, '.github', 'workflows'), { recursive: true });
    let handlerRan = false;

    const task = { id: 'task-l3', ruleId: 'plugin.workflow', file: '.github/workflows/ci.yml', action: 'edit workflow', autoFix: true };
    expect(() => validateRemediationPlan(root, [task])).toThrow(/change level exceeds the apply ceiling/);

    await expect(
      applyExecutionPlan(root, [task], {
        dryRun: false,
        handlers: {
          'plugin.workflow': async () => {
            handlerRan = true;
            return { status: 'applied', filesChanged: ['.github/workflows/ci.yml'], summary: 'edited' };
          }
        }
      })
    ).rejects.toThrow(/Level 3 changes are advisory-only/);

    expect(handlerRan).toBe(false);
    expect(fs.existsSync(path.join(root, '.github', 'workflows', 'ci.yml'))).toBe(false);
  });

  it.each([
    'docs/../.github/workflows/ci.yml',
    './/.github/workflows/ci.yml',
    '.github./workflows/ci.yml',
    '.GITHUB/workflows/ci.yml'
  ])('rejects a docs-consolidation managed write aimed at %s before the handler mutates it', async (spelling) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-workflow-level3-docs-exploit-'));
    const workflow = path.join(root, '.github', 'workflows', 'ci.yml');
    fs.mkdirSync(path.dirname(workflow), { recursive: true });
    const original = 'name: ci\n';
    fs.writeFileSync(workflow, original);

    // Every precondition matches, so without the Level 3 ceiling the built-in handler would append the block.
    const task = {
      id: 'task-docs-exploit',
      ruleId: 'docs-consolidation.managed-write',
      file: spelling,
      action: 'append managed block',
      autoFix: true,
      write: {
        operation: 'append-managed-block' as const,
        blockId: 'exploit',
        startMarker: '# <!-- START -->',
        endMarker: '# <!-- END -->',
        content: '# <!-- START -->\n# injected\n# <!-- END -->'
      },
      preconditions: {
        target_path: spelling,
        target_file_fingerprint: createHash('sha256').update(original, 'utf8').digest('hex'),
        approved_fragment_ids: [],
        planned_operation: 'append-managed-block' as const
      }
    };

    await expect(applyExecutionPlan(root, [task], { dryRun: false })).rejects.toThrow(/change level exceeds the apply ceiling/);
    expect(fs.readFileSync(workflow, 'utf8')).toBe(original);
  });

  it('applies the same docs-consolidation managed write to an ordinary docs path (control for the Level 3 test)', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-workflow-level1-docs-control-'));
    const target = path.join(root, 'docs', 'a.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const original = '# A\n';
    fs.writeFileSync(target, original);

    const result = await applyExecutionPlan(
      root,
      [
        {
          id: 'task-docs-control',
          ruleId: 'docs-consolidation.managed-write',
          file: 'docs/../docs/a.md',
          action: 'append managed block',
          autoFix: true,
          write: {
            operation: 'append-managed-block',
            blockId: 'control',
            startMarker: '<!-- START -->',
            endMarker: '<!-- END -->',
            content: '<!-- START -->\ncontrolled\n<!-- END -->'
          },
          preconditions: {
            target_path: 'docs/../docs/a.md',
            target_file_fingerprint: createHash('sha256').update(original, 'utf8').digest('hex'),
            approved_fragment_ids: [],
            planned_operation: 'append-managed-block'
          }
        }
      ],
      { dryRun: false }
    );

    expect(result.summary.applied).toBe(1);
    expect(fs.readFileSync(target, 'utf8')).toContain('controlled');
  });

  describe('change-level override and handler-reported writes', () => {
    const OVERRIDE = { allowLevel: 3 as const, reason: 'Release owner approved the workflow edit (ticket 42)' };

    const workflowTask = {
      id: 'task-l3-plugin',
      ruleId: 'plugin.workflow',
      file: '.github/workflows/ci.yml',
      action: 'edit workflow',
      autoFix: true
    };

    const writeWorkflowHandler = async ({ repoRoot }: { repoRoot: string }) => {
      fs.mkdirSync(path.join(repoRoot, '.github', 'workflows'), { recursive: true });
      fs.writeFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'name: edited\n');
      return { status: 'applied' as const, filesChanged: ['.github/workflows/ci.yml'], summary: 'edited workflow' };
    };

    const readOverrideEvents = (root: string): Array<{ eventType: string; summary: string }> => {
      const dir = path.join(root, '.playbook', 'memory', 'events', 'runtime');
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir)
        .filter((entry) => entry.endsWith('.json'))
        .map((entry) => JSON.parse(fs.readFileSync(path.join(dir, entry), 'utf8')) as { eventType: string; summary: string })
        .filter((event) => event.eventType === 'apply.change-level-override.v1');
    };

    it('runs a Level 3 task with the override and records the reason in a memory event', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-override-accepted-'));

      const result = await applyExecutionPlan(root, [workflowTask], {
        dryRun: false,
        handlers: { 'plugin.workflow': writeWorkflowHandler },
        changeLevelOverride: OVERRIDE
      });

      expect(result.summary).toEqual({ applied: 1, skipped: 0, unsupported: 0, failed: 0 });
      expect(fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8')).toBe('name: edited\n');
      const events = readOverrideEvents(root);
      expect(events).toHaveLength(1);
      expect(events[0]?.summary).toContain(OVERRIDE.reason);
    });

    it('requires a recorded reason at the library entry points before the ceiling can be raised', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-override-reason-required-'));
      const options = { dryRun: false, handlers: { 'plugin.workflow': writeWorkflowHandler } };

      await expect(applyExecutionPlan(root, [workflowTask], { ...options, changeLevelOverride: { allowLevel: 3, reason: '' } })).rejects.toThrow(/visible non-space/);
      await expect(applyExecutionPlan(root, [workflowTask], { ...options, changeLevelOverride: { allowLevel: 3, reason: 'bidi\u202Eoverride' } })).rejects.toThrow(/single line/);
      await expect(applyExecutionPlan(root, [workflowTask], { ...options, changeLevelOverride: { allowLevel: 2 as never, reason: 'ok' } })).rejects.toThrow(/only allowLevel 3/);
      expect(() => validateRemediationPlan(root, [workflowTask], { maxChangeLevel: 3 })).toThrow(/requires a recorded reason/);
      expect(validateRemediationPlan(root, [workflowTask], { maxChangeLevel: 3, changeLevelReason: 'approved' })).toBeUndefined();

      const executor = new FixExecutor(new HandlerResolver({ builtIn: {}, plugin: { 'plugin.workflow': writeWorkflowHandler } }));
      await expect(executor.apply([workflowTask], { repoRoot: root, dryRun: false, maxChangeLevel: 3 })).rejects.toThrow(/requires a recorded reason/);
      expect(fs.existsSync(path.join(root, '.github', 'workflows', 'ci.yml'))).toBe(false);
    });

    it('records the override intent before any handler runs, with a secret-redacted reason', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-override-event-first-'));
      let eventsSeenByHandler = -1;
      let summaryBeforeHandler = '';

      await applyExecutionPlan(root, [workflowTask], {
        dryRun: false,
        changeLevelOverride: { allowLevel: 3, reason: 'approved token=super-secret-value-123 by owner' },
        handlers: {
          'plugin.workflow': async (context) => {
            const seen = readOverrideEvents(root);
            eventsSeenByHandler = seen.length;
            summaryBeforeHandler = seen[0]?.summary ?? '';
            return writeWorkflowHandler(context);
          }
        }
      });

      expect(eventsSeenByHandler).toBe(1);
      expect(summaryBeforeHandler).toContain('[REDACTED]');
      expect(summaryBeforeHandler).not.toContain('super-secret-value-123');
    });

    it('reports tasks that passed only because of the override, including those caught by the reported-write check', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-override-ids-'));
      const result = await applyExecutionPlan(
        root,
        [
          workflowTask,
          { id: 'task-docs-ok', ruleId: 'plugin.docs-ok', file: 'docs/ok.md', action: 'fix ok', autoFix: true },
          { id: 'task-docs-smuggler', ruleId: 'plugin.docs-smuggler', file: 'docs/s.md', action: 'fix s', autoFix: true }
        ],
        {
          dryRun: false,
          changeLevelOverride: OVERRIDE,
          handlers: {
            'plugin.workflow': writeWorkflowHandler,
            'plugin.docs-ok': async () => ({ status: 'applied', filesChanged: ['docs/ok.md'], summary: 'ok' }),
            'plugin.docs-smuggler': async () => ({ status: 'applied', filesChanged: ['docs/s.md', '.npmrc'], summary: 'smuggled' })
          }
        }
      );

      expect(result.summary.failed).toBe(0);
      expect(result.overriddenTaskIds).toEqual(['task-docs-smuggler', 'task-l3-plugin']);
    });

    it('omits overriddenTaskIds when the default ceiling is in force', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-override-ids-absent-'));
      const result = await applyExecutionPlan(root, [{ id: 'task-notes', ruleId: 'notes.missing', file: null, action: 'create notes', autoFix: true }], { dryRun: false });
      expect(result).not.toHaveProperty('overriddenTaskIds');
    });

    it('rejects the same Level 3 task with no override, writing nothing and recording no override event', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-override-absent-'));

      await expect(
        applyExecutionPlan(root, [workflowTask], { dryRun: false, handlers: { 'plugin.workflow': writeWorkflowHandler } })
      ).rejects.toThrow(/change level exceeds the apply ceiling/);

      expect(fs.existsSync(path.join(root, '.github', 'workflows', 'ci.yml'))).toBe(false);
      expect(readOverrideEvents(root)).toEqual([]);
    });

    it.each([
      'docs/../.github/workflows/ci.yml',
      './/.github/workflows/ci.yml',
      '.github./workflows/ci.yml',
      '.GITHUB/workflows/ci.yml'
    ])('still rejects the review bypass spelling %s without the override', async (spelling) => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-override-bypass-'));
      await expect(
        applyExecutionPlan(root, [{ ...workflowTask, file: spelling }], {
          dryRun: false,
          handlers: { 'plugin.workflow': writeWorkflowHandler }
        })
      ).rejects.toThrow(/change level exceeds the apply ceiling/);
    });

    it('accepts the docs-consolidation workflow exploit input only when the override is given', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-override-exploit-'));
      const workflow = path.join(root, '.github', 'workflows', 'ci.yml');
      fs.mkdirSync(path.dirname(workflow), { recursive: true });
      const original = 'name: ci\n';
      fs.writeFileSync(workflow, original);
      const spelling = 'docs/../.github/workflows/ci.yml';
      const task = {
        id: 'task-docs-exploit',
        ruleId: 'docs-consolidation.managed-write',
        file: spelling,
        action: 'append managed block',
        autoFix: true,
        write: {
          operation: 'append-managed-block' as const,
          blockId: 'approved',
          startMarker: '# <!-- START -->',
          endMarker: '# <!-- END -->',
          content: '# <!-- START -->\n# approved\n# <!-- END -->'
        },
        preconditions: {
          target_path: spelling,
          target_file_fingerprint: createHash('sha256').update(original, 'utf8').digest('hex'),
          approved_fragment_ids: [],
          planned_operation: 'append-managed-block' as const
        }
      };

      await expect(applyExecutionPlan(root, [task], { dryRun: false })).rejects.toThrow(/change level exceeds the apply ceiling/);
      expect(fs.readFileSync(workflow, 'utf8')).toBe(original);

      const result = await applyExecutionPlan(root, [task], { dryRun: false, changeLevelOverride: OVERRIDE });
      expect(result.summary.applied).toBe(1);
      expect(fs.readFileSync(workflow, 'utf8')).toContain('# approved');
    });

    it('fails the run when a handler reports a Level 3 write for a task that declared a safe file, and skips later tasks', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-reported-write-'));
      let secondRan = false;
      const tasks = [
        { id: 'task-1-docs', ruleId: 'plugin.docs', file: 'docs/a.md', action: 'fix docs', autoFix: true },
        { id: 'task-2-docs', ruleId: 'plugin.docs2', file: 'docs/b.md', action: 'fix docs b', autoFix: true }
      ];

      const result = await applyExecutionPlan(root, tasks, {
        dryRun: false,
        handlers: {
          'plugin.docs': async ({ repoRoot }) => {
            fs.mkdirSync(path.join(repoRoot, 'docs'), { recursive: true });
            fs.mkdirSync(path.join(repoRoot, '.github', 'workflows'), { recursive: true });
            fs.writeFileSync(path.join(repoRoot, 'docs', 'a.md'), '# a\n');
            fs.writeFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'name: smuggled\n');
            return { status: 'applied', filesChanged: ['docs/a.md', 'docs/../.github/workflows/ci.yml'], summary: 'fixed docs' };
          },
          'plugin.docs2': async () => {
            secondRan = true;
            return { status: 'applied', filesChanged: ['docs/b.md'], summary: 'fixed b' };
          }
        }
      });

      expect(result.summary).toEqual({ applied: 0, skipped: 1, unsupported: 0, failed: 1 });
      expect(result.results[0]?.status).toBe('failed');
      expect(result.results[0]?.message).toMatch(/Change-level violation/);
      expect(result.results[1]?.status).toBe('skipped');
      expect(result.results[1]?.message).toMatch(/earlier task reported a write above the change-level ceiling/);
      expect(secondRan).toBe(false);
    });

    it('does not fail a reported Level 3 write when the override raised the ceiling', async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-reported-write-override-'));
      const result = await applyExecutionPlan(
        root,
        [{ id: 'task-1-docs', ruleId: 'plugin.docs', file: 'docs/a.md', action: 'fix docs', autoFix: true }],
        {
          dryRun: false,
          handlers: {
            'plugin.docs': async ({ repoRoot }) => {
              fs.mkdirSync(path.join(repoRoot, 'docs'), { recursive: true });
              fs.writeFileSync(path.join(repoRoot, 'docs', 'a.md'), '# a\n');
              return { status: 'applied', filesChanged: ['docs/a.md', '.npmrc'], summary: 'fixed docs' };
            }
          },
          changeLevelOverride: OVERRIDE
        }
      );
      expect(result.summary.failed).toBe(0);
      expect(result.summary.applied).toBe(1);
    });
  });

  it('does not let a plan artifact lower a task below its classified level', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-workflow-level-floor-'));
    const parsed = parsePlanArtifact({
      schemaVersion: '1.0',
      command: 'plan',
      tasks: [{ id: 'task-floor', ruleId: 'plugin.workflow', file: '.github/workflows/ci.yml', action: 'edit workflow', autoFix: true, changeLevel: 1 }]
    });

    expect(() => validateRemediationPlan(root, parsed.tasks)).toThrow(/task-floor \(level 3\)/);
  });

  it('resolves notes.missing with engine default handlers', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-workflow-'));
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'PROJECT_GOVERNANCE.md'), '# Governance\n');

    const initialVerify = verifyRepo(root);
    expect(initialVerify.ok).toBe(false);
    expect(initialVerify.failures.map((failure) => failure.id)).toContain('notes.missing');

    const plan = generateExecutionPlan(root);
    expect(plan.tasks.map((task) => task.ruleId)).toContain('notes.missing');

    const execution = await applyExecutionPlan(root, plan.tasks, { dryRun: false });

    expect(execution.summary.applied).toBe(1);
    expect(execution.summary.failed).toBe(0);

    const finalVerify = verifyRepo(root);
    expect(finalVerify.ok).toBe(true);
  });



  it('generates deterministic pattern compaction artifact during verify', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-workflow-patterns-'));
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'PROJECT_GOVERNANCE.md'), '# Governance\n');

    const report = verifyRepo(root);
    expect(report.ok).toBe(false);

    const patternsPath = path.join(root, '.playbook', 'patterns.json');
    expect(fs.existsSync(patternsPath)).toBe(true);

    const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8')) as {
      command: string;
      patterns: Array<{ id: string }>;
    };
    expect(patterns.command).toBe('pattern-compaction');
    expect(patterns.patterns.length).toBeGreaterThan(0);
  });
  it('supports plugin-derived auto-fixable tasks when handler is provided', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-workflow-plugin-'));
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture' }));
    fs.writeFileSync(
      path.join(root, 'playbook.config.json'),
      JSON.stringify({ version: 1, plugins: ['test-plugin'] })
    );

    const pluginDir = path.join(root, 'node_modules', 'test-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'index.js'),
      `module.exports = {
        name: 'test-plugin',
        rules: [{
          id: 'plugin-rule',
          description: 'plugin rule',
          check: () => ({ failures: [{ id: 'plugin.failure', message: 'plugin finding', evidence: 'docs/PLUGIN.md', fix: 'create plugin doc' }] })
        }]
      };`
    );

    const plan = generateExecutionPlan(root);
    expect(plan.tasks).toEqual([
      {
        id: expect.any(String),
        ruleId: 'plugin.failure',
        file: 'docs/PLUGIN.md',
        action: 'create plugin doc',
        autoFix: true
      }
    ]);

    const execution = await applyExecutionPlan(root, plan.tasks, {
      dryRun: false,
      handlers: {
        'plugin.failure': async ({ repoRoot }) => {
          fs.mkdirSync(path.join(repoRoot, 'docs'), { recursive: true });
          fs.writeFileSync(path.join(repoRoot, 'docs', 'PLUGIN.md'), '# Plugin\n');
          return { status: 'applied', filesChanged: ['docs/PLUGIN.md'], summary: 'Created plugin doc.' };
        }
      }
    });

    expect(execution.summary.applied).toBe(1);
    expect(fs.existsSync(path.join(root, 'docs', 'PLUGIN.md'))).toBe(true);
  });

  it('returns no-op result for empty plans', async () => {
    const execution = await applyExecutionPlan('.', [], { dryRun: false });
    expect(execution.results).toEqual([]);
    expect(execution.summary).toEqual({ applied: 0, skipped: 0, unsupported: 0, failed: 0 });
  });

  it('keeps built-in handlers when plugin handler map includes undefined', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-workflow-undefined-handler-'));
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'PROJECT_GOVERNANCE.md'), '# Governance\n');

    const plan = generateExecutionPlan(root);
    const execution = await applyExecutionPlan(root, plan.tasks, {
      dryRun: false,
      handlers: {
        'notes.missing': undefined
      }
    });

    expect(execution.summary).toEqual({ applied: 1, skipped: 0, unsupported: 0, failed: 0 });
    expect(fs.existsSync(path.join(root, 'docs', 'PLAYBOOK_NOTES.md'))).toBe(true);
  });
});
