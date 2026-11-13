import { describe, expect, it } from 'vitest';
import { MAX_OVERRIDE_REASON_LENGTH, parseChangeLevelOverride, parseOverrideArgs } from './changeLevelOverride.js';

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

  it.each([
    ['empty', ''],
    ['whitespace only', ' \t '],
    ['ideographic space only', '　　'],
    ['zero-width only', '​​'],
    ['over the length limit', 'x'.repeat(MAX_OVERRIDE_REASON_LENGTH + 1)],
    ['newline', 'a\nb'],
    ['carriage return', 'a\rb'],
    ['C1 control (NEL)', 'next\u0085line'],
    ['bidi override', 'looks fine‮gnp.exe'],
    ['bidi isolate', 'a⁦b'],
    ['zero-width space', 'zero​width'],
    ['zero-width joiner', 'zero‍width'],
    ['embedded byte order mark', 'rea﻿son'],
    ['line separator', 'a b'],
    ['paragraph separator', 'a b']
  ])('rejects a reason that is %s', (_label, reason) => {
    expect(() => parseChangeLevelOverride({ allowLevel: '3', reason })).toThrow();
  });

  it('accepts a reason of exactly the maximum length', () => {
    expect(parseChangeLevelOverride({ allowLevel: '3', reason: 'x'.repeat(MAX_OVERRIDE_REASON_LENGTH) })?.reason).toHaveLength(MAX_OVERRIDE_REASON_LENGTH);
  });
});

describe('parseOverrideArgs', () => {
  it('returns nothing when neither flag is present', () => {
    expect(parseOverrideArgs(['--from-plan', 'plan.json', '--task', 't1'])).toEqual({});
  });

  it('reads the separate-value form', () => {
    expect(parseOverrideArgs(['--allow-level', '3', '--reason', 'approved by owner', '--from-plan', 'p.json'])).toEqual({
      allowLevel: '3',
      reason: 'approved by owner'
    });
  });

  it('reads the --flag=value form, including values containing "="', () => {
    expect(parseOverrideArgs(['--allow-level=3', '--reason=owner said x=y'])).toEqual({ allowLevel: '3', reason: 'owner said x=y' });
  });

  it('errors on a missing value instead of swallowing the next option', () => {
    expect(() => parseOverrideArgs(['--reason', '--task', 't1'])).toThrow(/--reason flag requires a value/);
    expect(() => parseOverrideArgs(['--allow-level', '--reason', 'why'])).toThrow(/--allow-level flag requires a value/);
    expect(() => parseOverrideArgs(['--allow-level', '3', '--reason'])).toThrow(/--reason flag requires a value/);
  });

  it('errors on duplicate flags in either form', () => {
    expect(() => parseOverrideArgs(['--reason', 'a', '--reason', 'b'])).toThrow(/--reason flag was provided 2 times/);
    expect(() => parseOverrideArgs(['--allow-level=3', '--allow-level', '3'])).toThrow(/--allow-level flag was provided 2 times/);
    expect(() => parseOverrideArgs(['--reason=a', '--reason=b'])).toThrow(/provided 2 times/);
  });

  it('passes an empty --flag= value through so the override parser rejects it', () => {
    expect(parseOverrideArgs(['--allow-level=3', '--reason='])).toEqual({ allowLevel: '3', reason: '' });
    expect(() => parseChangeLevelOverride(parseOverrideArgs(['--allow-level=3', '--reason=']))).toThrow(/visible non-space/);
  });

  it('does not treat a flag-like prefix as the flag (--reasoning is not --reason)', () => {
    expect(parseOverrideArgs(['--reasoning', 'x'])).toEqual({});
  });
});
