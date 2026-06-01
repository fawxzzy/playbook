import { describe, expect, it } from 'vitest';
import { buildFleetCodexExecutionPlan } from '../src/adoption/executionPlan.js';
import type { FleetAdoptionWorkQueue } from '../src/adoption/workQueue.js';

const queueFixture = (): FleetAdoptionWorkQueue => ({
  schemaVersion: '1.0',
  kind: 'fleet-adoption-work-queue',
  generated_at: '2026-05-31T00:00:00.000Z',
  total_repos: 1,
  work_items: [
    {
      item_id: 'playbook:apply',
      repo_id: 'playbook',
      lifecycle_stage: 'planned_apply_pending',
      blocker_codes: [],
      recommended_command: 'pnpm playbook apply --json',
      priority_stage: 'apply_pending',
      severity: 'low',
      parallel_group: 'apply lane',
      dependencies: [],
      rationale: 'Finalize governed remediation after prerequisites are satisfied.',
      wave: 'wave_1',
    },
  ],
  waves: [
    {
      wave: 'wave_1',
      item_ids: ['playbook:apply'],
      repo_ids: ['playbook'],
      action_count: 1,
    },
    {
      wave: 'wave_2',
      item_ids: [],
      repo_ids: [],
      action_count: 0,
    },
  ],
  grouped_actions: [
    {
      parallel_group: 'apply lane',
      command: 'pnpm playbook apply --json',
      repo_ids: ['playbook'],
      item_ids: ['playbook:apply'],
    },
  ],
  blocked_items: [],
});

describe('buildFleetCodexExecutionPlan', () => {
  it('emits mutating-task proof sections in packaged Codex prompts', () => {
    const plan = buildFleetCodexExecutionPlan(queueFixture(), { generatedAt: '2026-05-31T00:00:00.000Z' });
    const prompt = plan.codex_prompts[0]?.prompt ?? '';

    expect(prompt).toContain('Acceptance Criteria:');
    expect(prompt).toContain('Expected Changed Paths:');
    expect(prompt).toContain('Expected Unchanged Paths:');
    expect(prompt).toContain('Blocked / Skipped Reporting Rules:');
    expect(prompt).toContain('Summary text is not proof.');
  });
});
