import { describe, expect, it } from 'vitest';
import { MAX_OVERRIDE_REASON_LENGTH, parseChangeLevelOverride } from './changeLevelOverride.js';

describe('parseChangeLevelOverride', () => {
  it('returns null when neither flag is present', () => {
    expect(parseChangeLevelOverride({})).toBeNull();
  });

  it('accepts Level 3 with a reason and trims the reason', () => {
    expect(parseChangeLevelOverride({ allowLevel: '3', reason: '  approved by release owner  ' })).toEqual({
      allowLevel: 3,
      reason: 'approved by release owner'
    });
    expect(parseChangeLevelOverride({ allowLevel: 3, reason: 'numeric level' })).toEqual({ allowLevel: 3, reason: 'numeric level' });
  });

  it('requires both flags together', () => {
    expect(() => parseChangeLevelOverride({ allowLevel: '3' })).toThrow(/provided together/);
    expect(() => parseChangeLevelOverride({ reason: 'why' })).toThrow(/provided together/);
  });

  it('only allows Level 3', () => {
    for (const level of ['1', '2', '4', 'three', '', '03.0']) {
      expect(() => parseChangeLevelOverride({ allowLevel: level, reason: 'why' })).toThrow(/only accepts 3/);
    }
  });

  it('rejects empty, oversized and multi-line reasons', () => {
    expect(() => parseChangeLevelOverride({ allowLevel: '3', reason: '' })).toThrow(/non-empty/);
    expect(() => parseChangeLevelOverride({ allowLevel: '3', reason: ' \t ' })).toThrow(/non-empty|control/);
    expect(() => parseChangeLevelOverride({ allowLevel: '3', reason: 'x'.repeat(MAX_OVERRIDE_REASON_LENGTH + 1) })).toThrow(/at most 400/);
    expect(() => parseChangeLevelOverride({ allowLevel: '3', reason: 'a\nb' })).toThrow(/single line/);
    expect(parseChangeLevelOverride({ allowLevel: '3', reason: 'x'.repeat(MAX_OVERRIDE_REASON_LENGTH) })?.reason).toHaveLength(MAX_OVERRIDE_REASON_LENGTH);
  });
});
