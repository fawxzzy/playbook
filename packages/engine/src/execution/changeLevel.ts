import path from 'node:path';
import type { ChangeLevel, PlanTask } from './types.js';

/**
 * Change-level classification for remediation tasks.
 *
 * Contract: docs/architecture/REMEDIATION_TRUST_MODEL.md ("Change levels").
 * - Level 1: reviewed built-in docs/tests/generated-artifact fixes.
 * - Level 2: scoped module or manifest writes, and every task whose handler has not been reviewed
 *   (rule ids outside the built-in table, plugin-registered handlers, tasks with no target file).
 * - Level 3: security-sensitive surfaces. Never auto-applied by default.
 *
 * Level 0 (read-only analysis) never appears on a task because tasks describe mutations.
 */
export const CHANGE_LEVELS: readonly ChangeLevel[] = [1, 2, 3];

/** Highest level `apply` will execute without an explicit override. Level 3 stays advisory-only. */
export const DEFAULT_MAX_APPLY_CHANGE_LEVEL: ChangeLevel = 2;

/** Built-in handler rule ids with a fixed, reviewed level. Anything else is never below Level 2. */
const RULE_CHANGE_LEVELS: Readonly<Record<string, ChangeLevel>> = {
  'notes.missing': 1,
  'notes.empty': 1,
  PB012: 1,
  PB013: 1,
  PB014: 1,
  'docs-consolidation.managed-write': 1,
  'release.package-json.version': 2,
  // Approval-gated maintenance commands run through apply's maintenance branch; the command set is fixed and reviewed.
  'maintenance.execution': 2
};

const SECURITY_SENSITIVE_PREFIXES = ['.github/', '.git/', '.husky/'] as const;
const SECURITY_SENSITIVE_BASENAMES = new Set(['.npmrc', '.yarnrc', '.yarnrc.yml']);

export type ChangeLevelContext = {
  /** Repository root. When provided, absolute task paths inside the repository are resolved to repo-relative form. */
  repoRoot?: string;
};

export const isChangeLevel = (value: unknown): value is ChangeLevel => value === 1 || value === 2 || value === 3;

const stripTrailingDotsAndSpaces = (segment: string): string =>
  segment === '.' || segment === '..' ? segment : segment.replace(/[. ]+$/, '');

/**
 * Resolve a task path to the canonical form used for classification: repo-relative, POSIX separators,
 * `.`/`..` segments resolved, trailing dots/spaces stripped from every segment (Windows ignores them), lowercased.
 * Returns null when the path cannot be confined to the repository (escapes it, or is absolute with no repo root).
 */
export const canonicalizeTaskPath = (file: string, context: ChangeLevelContext = {}): string | null => {
  const slashed = file.replaceAll('\\', '/');
  const cleaned = slashed
    .split('/')
    .map(stripTrailingDotsAndSpaces)
    .join('/');

  let relative: string;
  if (context.repoRoot) {
    const root = path.resolve(context.repoRoot);
    relative = path.relative(root, path.resolve(root, cleaned)).split(path.sep).join('/');
    if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
      return null;
    }
  } else {
    if (cleaned.startsWith('/') || /^[a-z]:/i.test(cleaned)) {
      return null;
    }
    relative = path.posix.normalize(cleaned);
    if (relative === '..' || relative.startsWith('../')) {
      return null;
    }
  }

  const segments = relative.split('/').filter((segment) => segment.length > 0 && segment !== '.');
  return segments.join('/').toLowerCase();
};

const isSecuritySensitivePath = (canonical: string): boolean => {
  const withSlash = `${canonical}/`;
  const base = canonical.slice(canonical.lastIndexOf('/') + 1);
  return (
    SECURITY_SENSITIVE_PREFIXES.some((prefix) => withSlash.startsWith(prefix)) ||
    base === '.env' ||
    base.startsWith('.env.') ||
    SECURITY_SENSITIVE_BASENAMES.has(base) ||
    canonical.split('/').includes('secrets')
  );
};

export type ChangeLevelClassification = {
  level: ChangeLevel;
  reason: string;
};

/**
 * Pure, deterministic classification from `ruleId` and `file` only. Precedence:
 * unresolvable/escaping path (3) > security-sensitive canonical path (3) > reviewed built-in rule id >
 * default (2). A rule id outside the built-in table is never below Level 2.
 */
export const classifyTaskChangeLevel = (
  task: Pick<PlanTask, 'ruleId' | 'file'>,
  context: ChangeLevelContext = {}
): ChangeLevelClassification => {
  if (task.file !== null) {
    const canonical = canonicalizeTaskPath(task.file, context);
    if (canonical === null) {
      return { level: 3, reason: 'path cannot be confined to the repository' };
    }
    if (isSecuritySensitivePath(canonical)) {
      return { level: 3, reason: 'security-sensitive path' };
    }
  }

  const ruleLevel = RULE_CHANGE_LEVELS[task.ruleId];
  if (ruleLevel !== undefined) {
    return { level: ruleLevel, reason: `built-in rule ${task.ruleId}` };
  }

  return {
    level: 2,
    reason: task.file === null ? 'rule id has no reviewed built-in handler and no declared target file' : 'rule id has no reviewed built-in handler'
  };
};

/**
 * Path-only level for a file a handler reports having written: Level 3 when the canonical path is
 * security-sensitive or cannot be confined to the repository, otherwise Level 1 (the task-level floor still
 * comes from the task). Used to check handler-reported `filesChanged` after the write.
 */
export const classifyPathChangeLevel = (file: string, context: ChangeLevelContext = {}): ChangeLevel => {
  const canonical = canonicalizeTaskPath(file, context);
  return canonical === null || isSecuritySensitivePath(canonical) ? 3 : 1;
};

/** Thrown when a handler reports writes above the change-level ceiling. The write has already happened. */
export class ChangeLevelWriteViolationError extends Error {
  constructor(
    readonly files: string[],
    readonly maxLevel: ChangeLevel
  ) {
    super(
      `Change-level violation: handler reported writes above the apply ceiling (level ${maxLevel}) for ${files.join(', ')}. The write already happened; the run is failed and remaining tasks are not executed.`
    );
    this.name = 'ChangeLevelWriteViolationError';
  }
}

/** Level-check handler-reported `filesChanged` after the write. Throws {@link ChangeLevelWriteViolationError}. */
export const assertReportedWritesWithinCeiling = (
  files: readonly string[],
  maxLevel: ChangeLevel = DEFAULT_MAX_APPLY_CHANGE_LEVEL,
  context: ChangeLevelContext = {}
): void => {
  const offending = files.filter((file) => classifyPathChangeLevel(file, context) > maxLevel).sort((left, right) => left.localeCompare(right));
  if (offending.length > 0) {
    throw new ChangeLevelWriteViolationError(offending, maxLevel);
  }
};

export const MAX_OVERRIDE_REASON_LENGTH = 400;

/**
 * Validate the human-supplied reason recorded with a change-level override. The CLI parser applies the same rules
 * (packages/cli/src/lib/changeLevelOverride.ts); library entry points re-check so a caller cannot raise the
 * ceiling without a recorded reason. Rejects control, format (bidi overrides, zero-width), and line/paragraph
 * separator characters, and requires at least one visible non-space character.
 */
export const normalizeOverrideReason = (reason: unknown): string => {
  if (typeof reason !== 'string') {
    throw new Error('Raising the change-level ceiling above Level 2 requires a recorded reason string.');
  }
  const trimmed = reason.trim();
  if (!/[^\p{Z}\p{C}]/u.test(trimmed)) {
    throw new Error('The change-level override reason must contain at least one visible non-space character.');
  }
  if (trimmed.length > MAX_OVERRIDE_REASON_LENGTH) {
    throw new Error(`The change-level override reason must be at most ${MAX_OVERRIDE_REASON_LENGTH} characters.`);
  }
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(trimmed)) {
    throw new Error('The change-level override reason must be a single line without control, format, or separator characters.');
  }
  return trimmed;
};

/** A ceiling above the default is only accepted together with a valid recorded reason. */
export const assertCeilingAuthorized = (maxLevel: ChangeLevel, reason: unknown): void => {
  if (maxLevel > DEFAULT_MAX_APPLY_CHANGE_LEVEL) {
    normalizeOverrideReason(reason);
  }
};

/** Explicit, recorded authorization to apply tasks above the default ceiling. Only Level 3 can be allowed. */
export type ChangeLevelOverride = {
  allowLevel: 3;
  reason: string;
};

export type ResolveChangeLevelContext = ChangeLevelContext & {
  /** True when the executing handler is plugin-registered. Plugin handlers are never below Level 2. */
  pluginHandler?: boolean;
};

/**
 * Effective level = max(declared, classified, plugin floor). A plan artifact may raise a task's level but can
 * never lower it below what Playbook classifies from the task itself.
 */
export const resolveTaskChangeLevel = (
  task: Pick<PlanTask, 'ruleId' | 'file' | 'changeLevel'>,
  context: ResolveChangeLevelContext = {}
): ChangeLevel => {
  const classified = classifyTaskChangeLevel(task, context).level;
  const declared = isChangeLevel(task.changeLevel) ? task.changeLevel : 1;
  const pluginFloor = context.pluginHandler ? 2 : 1;
  return Math.max(classified, declared, pluginFloor) as ChangeLevel;
};

export type ChangeLevelCeilingContext = ChangeLevelContext & {
  /** Rule ids whose handler is plugin-registered (a plugin handler overrides the built-in one). */
  pluginRuleIds?: ReadonlySet<string>;
};

/**
 * Fail closed before any mutation: every executable (`autoFix`) task must resolve at or below `maxLevel`.
 * Non-auto-fix tasks are skipped by apply and never mutate, so they are not gated here.
 */
export const enforceChangeLevelCeiling = (
  tasks: ReadonlyArray<Pick<PlanTask, 'id' | 'ruleId' | 'file' | 'autoFix' | 'changeLevel'>>,
  maxLevel: ChangeLevel = DEFAULT_MAX_APPLY_CHANGE_LEVEL,
  context: ChangeLevelCeilingContext = {}
): void => {
  const rejected = tasks
    .filter((task) => task.autoFix)
    .map((task) => ({
      id: task.id,
      level: resolveTaskChangeLevel(task, { repoRoot: context.repoRoot, pluginHandler: context.pluginRuleIds?.has(task.ruleId) })
    }))
    .filter((entry) => entry.level > maxLevel)
    .sort((left, right) => left.id.localeCompare(right.id));

  if (rejected.length > 0) {
    const detail = rejected.map((entry) => `${entry.id} (level ${entry.level})`).join(', ');
    throw new Error(
      `Invalid remediation plan: change level exceeds the apply ceiling (level ${maxLevel}) for ${detail}. Level 3 changes are advisory-only and require human review.`
    );
  }
};
