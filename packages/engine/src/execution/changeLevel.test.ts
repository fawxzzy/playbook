import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertCeilingAuthorized,
  assertReportedWritesWithinCeiling,
  normalizeOverrideReason,
  ChangeLevelWriteViolationError,
  classifyPathChangeLevel,
  canonicalizeTaskPath,
  classifyTaskChangeLevel,
  DEFAULT_MAX_APPLY_CHANGE_LEVEL,
  enforceChangeLevelCeiling,
  isChangeLevel,
  resolveTaskChangeLevel
} from './changeLevel.js';

const makeRoot = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-change-level-'));

describe('change-level classification', () => {
  it('pins the default apply ceiling at Level 2 (Level 3 stays advisory-only)', () => {
    expect(DEFAULT_MAX_APPLY_CHANGE_LEVEL).toBe(2);
  });

  it.each([
    // Reviewed built-in rule ids keep their fixed level.
    ['notes.missing', null, 1],
    ['PB012', '.playbookignore', 1],
    ['PB013', '.gitignore', 1],
    ['PB014', null, 1],
    ['docs-consolidation.managed-write', 'docs/README.md', 1],
    ['release.package-json.version', 'packages/cli/package.json', 2],
    // A rule id outside the built-in table is never below Level 2, even for docs paths.
    ['plugin.docs', 'docs/PLUGIN.md', 2],
    ['plugin.src', 'packages/engine/src/index.ts', 2],
    ['plugin.unknown-target', null, 2],
    // Security-sensitive canonical paths are Level 3.
    ['plugin.workflow', '.github/workflows/ci.yml', 3],
    ['plugin.env', 'config/.env.production', 3],
    ['plugin.env', '.env.example', 3],
    ['plugin.env', '.env.sample', 3],
    ['plugin.npmrc', '.npmrc', 3],
    ['plugin.hook', '.husky/pre-commit', 3],
    ['plugin.secrets', 'ops/secrets/token.json', 3],
    // Security-sensitive path outranks a reviewed built-in rule id.
    ['notes.missing', '.github/workflows/notes.yml', 3]
  ])('classifies %s on %s as level %s', (ruleId, file, expected) => {
    expect(classifyTaskChangeLevel({ ruleId, file }).level).toBe(expected);
  });

  it.each([
    'docs/../.github/workflows/ci.yml',
    '.playbook/../.github/x.yml',
    'src/../.husky/pre-commit',
    './/.github/workflows/ci.yml',
    './././.github/workflows/ci.yml',
    '.github./workflows/ci.yml',
    '.github /workflows/ci.yml',
    '.GITHUB/workflows/ci.yml',
    '.GitHub\\Workflows\\ci.yml',
    'docs\\..\\.github\\workflows\\ci.yml',
    'a/../.npmrc',
    'a/../.NPMRC',
    'docs/../secrets/x',
    'docs/../Secrets/x',
    '.git/hooks/pre-commit.js',
    '.git./hooks/pre-commit.js',
    'pkg/.env.',
    'pkg/.ENV.local'
  ])('classifies obfuscated path form %s as level 3 without a repo root', (file) => {
    expect(classifyTaskChangeLevel({ ruleId: 'docs-consolidation.managed-write', file }).level).toBe(3);
  });

  it('classifies obfuscated and absolute path forms as level 3 with a repo root', () => {
    const root = makeRoot();
    const forms = [
      'docs/../.github/workflows/ci.yml',
      './/.github/workflows/ci.yml',
      path.join(root, '.github', 'workflows', 'ci.yml'),
      path.join(root, 'docs', '..', '.github', 'workflows', 'ci.yml'),
      '.github./workflows/ci.yml'
    ];
    for (const file of forms) {
      expect(classifyTaskChangeLevel({ ruleId: 'docs-consolidation.managed-write', file }, { repoRoot: root }).level).toBe(3);
    }
  });

  it('fails closed for paths that cannot be confined to the repository', () => {
    const root = makeRoot();
    expect(classifyTaskChangeLevel({ ruleId: 'notes.missing', file: '../outside.md' }).level).toBe(3);
    expect(classifyTaskChangeLevel({ ruleId: 'notes.missing', file: 'docs/../../outside.md' }, { repoRoot: root }).level).toBe(3);
    expect(classifyTaskChangeLevel({ ruleId: 'notes.missing', file: '/etc/hosts' }).level).toBe(3);
    expect(classifyTaskChangeLevel({ ruleId: 'notes.missing', file: 'C:\\repo\\docs\\a.md' }).level).toBe(3);
  });

  it('does not over-match ordinary paths', () => {
    for (const file of ['docs/github.md', '.gitignore', '.github-notes/readme.md', 'docs/secrets-policy.md', 'docs/envelope.md', 'src/.environment/a.ts']) {
      expect(classifyTaskChangeLevel({ ruleId: 'docs-consolidation.managed-write', file }).level).toBe(1);
    }
    expect(canonicalizeTaskPath('docs/./a/../B.md')).toBe('docs/b.md');
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

  it('floors plugin-registered handlers at Level 2 even for reviewed built-in rule ids', () => {
    expect(resolveTaskChangeLevel({ ruleId: 'notes.missing', file: null }, { pluginHandler: true })).toBe(2);
    expect(resolveTaskChangeLevel({ ruleId: 'notes.missing', file: null }, { pluginHandler: false })).toBe(1);
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
    expect(() => enforceChangeLevelCeiling([task('a', { ruleId: 'notes.missing', file: null }), task('b')])).not.toThrow();
  });

  it('rejects Level 3 executable tasks by default and names them in stable order', () => {
    expect(() =>
      enforceChangeLevelCeiling([task('z', { file: '.github/workflows/ci.yml' }), task('a', { changeLevel: 3 })])
    ).toThrow(/exceeds the apply ceiling \(level 2\) for a \(level 3\), z \(level 3\)/);
  });

  it('classifies the resolved path, so obfuscated spellings of a Level 3 path are rejected', () => {
    const root = makeRoot();
    for (const file of ['docs/../.github/workflows/ci.yml', './/.github/workflows/ci.yml', path.join(root, '.github', 'workflows', 'ci.yml')]) {
      expect(() =>
        enforceChangeLevelCeiling([task('t', { ruleId: 'docs-consolidation.managed-write', file })], 2, { repoRoot: root })
      ).toThrow(/t \(level 3\)/);
    }
  });

  it('does not gate non-auto-fix tasks because apply never executes them', () => {
    expect(() => enforceChangeLevelCeiling([task('a', { file: '.github/workflows/ci.yml', autoFix: false })])).not.toThrow();
  });

  it('honors an explicit lower ceiling, including the plugin Level 2 floor', () => {
    expect(() => enforceChangeLevelCeiling([task('a')], 1)).toThrow(/ceiling \(level 1\)/);
    expect(() => enforceChangeLevelCeiling([task('a', { ruleId: 'notes.missing', file: null })], 1)).not.toThrow();
    expect(() =>
      enforceChangeLevelCeiling([task('a', { ruleId: 'notes.missing', file: null })], 1, { pluginRuleIds: new Set(['notes.missing']) })
    ).toThrow(/a \(level 2\)/);
  });
});


describe('handler-reported writes (TM-GAP-11)', () => {
  const SPELLINGS = [
    '.github/workflows/ci.yml',
    'docs/../.github/workflows/ci.yml',
    './/.github/workflows/ci.yml',
    '.github./workflows/ci.yml',
    '.GITHUB/workflows/ci.yml',
    'a/../.npmrc',
    'docs/../secrets/x.json',
    '../outside.md'
  ];

  it.each(SPELLINGS)('classifies reported write %s as level 3', (file) => {
    expect(classifyPathChangeLevel(file)).toBe(3);
  });

  it('classifies ordinary reported writes as level 1', () => {
    expect(classifyPathChangeLevel('docs/a.md')).toBe(1);
    expect(classifyPathChangeLevel('packages/engine/src/index.ts')).toBe(1);
  });

  it('throws a ChangeLevelWriteViolationError naming every offending file, in stable order', () => {
    let caught: unknown;
    try {
      assertReportedWritesWithinCeiling(['docs/ok.md', 'docs/../.github/x.yml', '.npmrc']);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ChangeLevelWriteViolationError);
    expect((caught as ChangeLevelWriteViolationError).files).toEqual(['.npmrc', 'docs/../.github/x.yml']);
    expect((caught as Error).message).toMatch(/write already happened/);
  });

  it('allows level 3 reported writes only when the ceiling is raised to 3', () => {
    expect(() => assertReportedWritesWithinCeiling(['.github/workflows/ci.yml'], 3)).not.toThrow();
    expect(() => assertReportedWritesWithinCeiling(['.github/workflows/ci.yml'], 2)).toThrow(ChangeLevelWriteViolationError);
  });

  it('treats the reviewed maintenance.execution rule id as level 2 so maintenance tasks pass the default ceiling', () => {
    expect(classifyTaskChangeLevel({ ruleId: 'maintenance.execution', file: null }).level).toBe(2);
    expect(() => enforceChangeLevelCeiling([{ id: 'm', ruleId: 'maintenance.execution', file: null, autoFix: true }])).not.toThrow();
    expect(() => enforceChangeLevelCeiling([{ id: 'm', ruleId: 'maintenance.execution', file: null, autoFix: true, changeLevel: 3 }])).toThrow(/m \(level 3\)/);
  });
});

describe('override reason (library entry points)', () => {
  it('accepts and trims a normal one-line reason', () => {
    expect(normalizeOverrideReason('  Release owner approved (ticket 42)  ')).toBe('Release owner approved (ticket 42)');
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   \t '],
    ['ideographic space only', '\u3000\u3000'],
    ['zero-width only', '\u200B\u200B'],
    ['newline', 'line one\nline two'],
    ['carriage return', 'a\rb'],
    ['C1 control (NEL)', 'next\u0085line'],
    ['bidi override', 'looks fine\u202Egnp.exe'],
    ['bidi isolate', 'a\u2066b'],
    ['zero-width space', 'zero\u200Bwidth'],
    ['zero-width joiner', 'zero\u200Dwidth'],
    ['embedded byte order mark', 'rea\uFEFFson'],
    ['line separator', 'a\u2028b'],
    ['paragraph separator', 'a\u2029b'],
    ['over the length limit', 'x'.repeat(401)],
    ['not a string', 42 as unknown as string]
  ])('rejects %s', (_label, reason) => {
    expect(() => normalizeOverrideReason(reason)).toThrow();
  });

  it('requires a valid reason whenever the ceiling is above Level 2, and nothing at or below it', () => {
    expect(() => assertCeilingAuthorized(2, undefined)).not.toThrow();
    expect(() => assertCeilingAuthorized(3, undefined)).toThrow(/requires a recorded reason/);
    expect(() => assertCeilingAuthorized(3, '   ')).toThrow(/visible non-space/);
    expect(() => assertCeilingAuthorized(3, 'approved')).not.toThrow();
  });
});
