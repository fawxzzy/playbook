import type { ChangeLevel, PlanTask } from './types.js';

/**
 * Change-level classification for remediation tasks.
 *
 * Contract: docs/architecture/REMEDIATION_TRUST_MODEL.md ("Change levels").
 * - Level 1: docs/tests/generated artifacts (and other low-risk, broadly reversible writes).
 * - Level 2: scoped module code or manifest writes.
 * - Level 3: security-sensitive surfaces. Never auto-applied by default.
 *
 * Level 0 (read-only analysis) never appears on a task because tasks describe mutations.
 */
export const CHANGE_LEVELS: readonly ChangeLevel[] = [1, 2, 3];

/** Highest level `apply` will execute without an explicit override. Level 3 stays advisory-only. */
export const DEFAULT_MAX_APPLY_CHANGE_LEVEL: ChangeLevel = 2;

/** Built-in handler rule ids with a fixed, reviewed level. */
const RULE_CHANGE_LEVELS: Readonly<Record<string, ChangeLevel>> = {
  'notes.missing': 1,
  'notes.empty': 1,
  PB012: 1,
  PB013: 1,
  PB014: 1,
  'docs-consolidation.managed-write': 1,
  'release.package-json.version': 2
};

const SECURITY_SENSITIVE_PREFIXES = ['.github/', '.git/', '.husky/'] as const;
const SECURITY_SENSITIVE_BASENAMES = new Set(['.npmrc', '.yarnrc', '.yarnrc.yml']);
const LEVEL_ONE_BASENAMES = new Set(['.gitignore', '.playbookignore']);

const normalizeTaskPath = (file: string): string => file.replaceAll('\\', '/').replace(/^(\.\/)+/, '').toLowerCase();

const basename = (normalized: string): string => normalized.slice(normalized.lastIndexOf('/') + 1);

export const isChangeLevel = (value: unknown): value is ChangeLevel => value === 1 || value === 2 || value === 3;

const isSecuritySensitivePath = (normalized: string): boolean => {
  const base = basename(normalized);
  return (
    SECURITY_SENSITIVE_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    base === '.env' ||
    base.startsWith('.env.') ||
    SECURITY_SENSITIVE_BASENAMES.has(base) ||
    normalized.split('/').includes('secrets')
  );
};

const isLevelOnePath = (normalized: string): boolean => {
  const base = basename(normalized);
  return (
    normalized.startsWith('docs/') ||
    normalized.startsWith('.playbook/') ||
    normalized.endsWith('.md') ||
    LEVEL_ONE_BASENAMES.has(base) ||
    /(^|\/)(test|tests|__tests__)\//.test(normalized) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized)
  );
};

export type ChangeLevelClassification = {
  level: ChangeLevel;
  reason: string;
};

/**
 * Pure, deterministic classification from `ruleId` and `file` only. Precedence:
 * security-sensitive path (3) > reviewed built-in rule id > path shape (1) > default (2).
 */
export const classifyTaskChangeLevel = (task: Pick<PlanTask, 'ruleId' | 'file'>): ChangeLevelClassification => {
  const normalized = task.file === null ? null : normalizeTaskPath(task.file);

  if (normalized !== null && isSecuritySensitivePath(normalized)) {
    return { level: 3, reason: 'security-sensitive path' };
  }

  const ruleLevel = RULE_CHANGE_LEVELS[task.ruleId];
  if (ruleLevel !== undefined) {
    return { level: ruleLevel, reason: `built-in rule ${task.ruleId}` };
  }

  if (normalized === null) {
    return { level: 2, reason: 'no declared target file for a non-built-in rule' };
  }

  if (isLevelOnePath(normalized)) {
    return { level: 1, reason: 'docs, tests, or generated artifact path' };
  }

  return { level: 2, reason: 'scoped module or manifest path' };
};

/**
 * Effective level = max(declared, classified). A plan artifact may raise a task's level but can never lower
 * it below what Playbook classifies from the task itself.
 */
export const resolveTaskChangeLevel = (task: Pick<PlanTask, 'ruleId' | 'file' | 'changeLevel'>): ChangeLevel => {
  const classified = classifyTaskChangeLevel(task).level;
  const declared = isChangeLevel(task.changeLevel) ? task.changeLevel : 1;
  return Math.max(classified, declared) as ChangeLevel;
};

/**
 * Fail closed before any mutation: every executable (`autoFix`) task must resolve at or below `maxLevel`.
 * Non-auto-fix tasks are skipped by apply and never mutate, so they are not gated here.
 */
export const enforceChangeLevelCeiling = (
  tasks: ReadonlyArray<Pick<PlanTask, 'id' | 'ruleId' | 'file' | 'autoFix' | 'changeLevel'>>,
  maxLevel: ChangeLevel = DEFAULT_MAX_APPLY_CHANGE_LEVEL
): void => {
  const rejected = tasks
    .filter((task) => task.autoFix)
    .map((task) => ({ id: task.id, level: resolveTaskChangeLevel(task) }))
    .filter((entry) => entry.level > maxLevel)
    .sort((left, right) => left.id.localeCompare(right.id));

  if (rejected.length > 0) {
    const detail = rejected.map((entry) => `${entry.id} (level ${entry.level})`).join(', ');
    throw new Error(
      `Invalid remediation plan: change level exceeds the apply ceiling (level ${maxLevel}) for ${detail}. Level 3 changes are advisory-only and require human review.`
    );
  }
};
