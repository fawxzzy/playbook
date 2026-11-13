import { describe, expect, it } from 'vitest';
import {
  classifyTaskChangeLevel,
  DEFAULT_MAX_APPLY_CHANGE_LEVEL,
  enforceChangeLevelCeiling,
  isChangeLevel,
  resolveTaskChangeLevel
} from './changeLevel.js';

describe('change-level classification', () => {
  it('pins the default apply ceiling at Level 2 (Level 3 stays advisory-only)', () => {
    expect(DEFAULT_MAX_APPLY_CHANGE_LEVEL).toBe(2);
  });

  it.each([
    ['notes.missing', null, 1],
    ['PB012', '.playbookignore', 1],
    ['PB014', null, 1],
    ['docs-consolidation.managed-write', 'docs/README.md', 1],
    ['release.package-json.version', 'packages/cli/package.json', 2],
    ['plugin.docs', 'docs/PLUGIN.md', 1],
    ['plugin.docs', 'docs\\PLUGIN.md', 1],
    ['plugin.tests', 'packages/engine/src/x.test.ts', 1],
    ['plugin.generated', '.playbook/plan.json', 1],
    ['plugin.src', 'packages/engine/src/index.ts', 2],
    ['plugin.unknown-target', null, 2],
    ['plugin.workflow', '.github/workflows/ci.yml', 3],
    ['plugin.workflow', './.GitHub/workflows/ci.yml', 3],
    ['plugin.env', 'config/.env.production', 3],
    ['plugin.npmrc', '.npmrc', 3],
    ['plugin.hook', '.husky/pre-commit', 3],
    ['plugin.secrets', 'ops/secrets/token.json', 3],
    // Security-sensitive path outranks a reviewed built-in rule id.
    ['notes.missing', '.github/workflows/notes.yml', 3]
  ])('classifies %s on %s as level %s', (ruleId, file, expected) => {
    expect(classifyTaskChangeLevel({ ruleId, file }).level).toBe(expected);
  });

  it('is deterministic for repeated calls', () => {
    const task = { ruleId: 'plugin.src', file: 'packages/engine/src/index.ts' };
    expect(classifyTaskChangeLevel(task)).toEqual(classifyTaskChangeLevel({ ...task }));
  });

  it('lets a declared level raise but never lower the classified level', () => {
    expect(resolveTaskChangeLevel({ ruleId: 'notes.missing', file: null, changeLevel: 3 })).toBe(3);
    expect(resolveTaskChangeLevel({ ruleId: 'plugin.workflow', file: '.github/workflows/ci.yml', changeLevel: 1 })).toBe(3);
    expect(resolveTaskChangeLevel({ ruleId: 'notes.missing', file: null })).toBe(1);
  });

  it('only accepts 1, 2, 3 as change levels', () => {
    expect([0, 1, 2, 3, 4, '1', null, undefined, 1.5].map(isChangeLevel)).toEqual([false, true, true, true, false, false, false, false, false]);
  });
});

describe('enforceChangeLevelCeiling', () => {
  const task = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    ruleId: 'plugin.src',
    file: 'packages/engine/src/index.ts',
    autoFix: true,
    ...overrides
  });

  it('accepts Level 1 and Level 2 executable tasks by default', () => {
    expect(() => enforceChangeLevelCeiling([task('a', { file: 'docs/a.md' }), task('b')])).not.toThrow();
  });

  it('rejects Level 3 executable tasks by default and names them in stable order', () => {
    expect(() =>
      enforceChangeLevelCeiling([task('z', { file: '.github/workflows/ci.yml' }), task('a', { changeLevel: 3 })])
    ).toThrow(/exceeds the apply ceiling \(level 2\) for a \(level 3\), z \(level 3\)/);
  });

  it('does not gate non-auto-fix tasks because apply never executes them', () => {
    expect(() => enforceChangeLevelCeiling([task('a', { file: '.github/workflows/ci.yml', autoFix: false })])).not.toThrow();
  });

  it('honors an explicit lower ceiling', () => {
    expect(() => enforceChangeLevelCeiling([task('a')], 1)).toThrow(/ceiling \(level 1\)/);
    expect(() => enforceChangeLevelCeiling([task('a', { file: 'docs/a.md' })], 1)).not.toThrow();
  });
});
