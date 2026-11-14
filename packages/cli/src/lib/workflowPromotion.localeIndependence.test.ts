import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emitPromotionReceipt, stageWorkflowArtifact } from './workflowPromotion.js';

// Promotion receipt ids and staged artifacts must come out identical on every machine, so key order may not depend on
// `localeCompare`. Receipt ids are stored, never recomputed and compared, so there is no legacy value to accept.

const receiptInput = (cwd: string) => ({
  cwd,
  promotionKind: 'story' as const,
  workflowKind: 'story-promotion',
  generatedAt: '1970-01-01T00:00:00.000Z',
  sourceRef: 'repo/demo/story-candidates/c1',
  sourceFingerprint: 'a'.repeat(64),
  targetArtifactPath: '.playbook/stories.json',
  targetId: 'story-1',
  beforeFingerprint: null,
  afterFingerprint: 'b'.repeat(64),
  outcome: 'promoted' as const,
  summary: 'Promoted story-1'
});

const tempDir = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-workflow-promotion-'));

const reverseLocaleCompare = (): void => {
  vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (this: string, other: string): number {
    const left = String(this);
    return left < other ? 1 : left > other ? -1 : 0;
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('promotion receipts and staged artifacts are locale independent', () => {
  it('keeps the receipt id emitted before the change', () => {
    // Captured from the build before this change (localeCompare key order). It must not move.
    expect(emitPromotionReceipt(receiptInput(tempDir()) as never).receipt_id).toBe('promotion-receipt:74adb8cc88757cdd');
  });

  it('emits the same receipt id when localeCompare orders strings differently (another locale)', () => {
    const before = emitPromotionReceipt(receiptInput(tempDir()) as never).receipt_id;

    reverseLocaleCompare();

    expect(emitPromotionReceipt(receiptInput(tempDir()) as never).receipt_id).toBe(before);
  });

  it('stages artifacts with keys in code-unit order whatever the locale', () => {
    const artifact = { scoredAt: 2, scoreVersion: 1, B: 3, a: 4, _c: 5, nested: { Z: 1, z: 2, a_b: 3, aB: 4 } };
    // Validation is made to fail so the staged file stays in place and can be read back.
    const stage = (cwd: string): string => {
      stageWorkflowArtifact({
        cwd,
        workflowKind: 'story-promotion',
        candidateRelativePath: '.playbook/staged/stories.json',
        committedRelativePath: '.playbook/stories.json',
        artifact,
        validate: () => ['held for the test'],
        generatedAt: '1970-01-01T00:00:00.000Z',
        successSummary: 'ok',
        blockedSummary: 'blocked'
      });
      return fs.readFileSync(path.join(cwd, '.playbook/staged/stories.json'), 'utf8');
    };

    const before = stage(tempDir());
    expect(Object.keys(JSON.parse(before) as Record<string, unknown>)).toEqual(['B', '_c', 'a', 'nested', 'scoreVersion', 'scoredAt']);

    reverseLocaleCompare();

    expect(stage(tempDir())).toBe(before);
  });
});
