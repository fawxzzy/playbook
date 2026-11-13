import type { ChangeLevel, FixHandler, FixHandlerResult, PlanTask } from './types.js';
import { redactSecretsForLogs, validateRemediationPlan, validateRepoBoundary } from '../security/guards.js';
import {
  assertCeilingAuthorized,
  assertReportedWritesWithinCeiling,
  ChangeLevelWriteViolationError,
  classifyPathChangeLevel,
  DEFAULT_MAX_APPLY_CHANGE_LEVEL,
  resolveTaskChangeLevel
} from './changeLevel.js';

export type ApplyTaskStatus = 'applied' | 'skipped' | 'unsupported' | 'failed';

export type HandlerSource = 'builtin' | 'plugin';

export type ResolvedHandler = {
  source: HandlerSource;
  handlerId: string;
  handler: FixHandler;
};

export type HandlerRegistry = {
  builtIn: Record<string, FixHandler>;
  plugin?: Record<string, FixHandler | undefined>;
};

export type ApplyTaskResult = {
  id: string;
  ruleId: string;
  file: string | null;
  action: string;
  autoFix: boolean;
  status: ApplyTaskStatus;
  message?: string;
  details?: Record<string, unknown>;
};

export type ApplySummary = {
  applied: number;
  skipped: number;
  unsupported: number;
  failed: number;
};

export type FixExecutionResult = {
  results: ApplyTaskResult[];
  summary: ApplySummary;
  /**
   * Present only when the ceiling was raised above the default: ids of tasks that ran only because of the override,
   * either declared above Level 2 or caught by the reported-write check (a handler wrote to a Level 3 path).
   */
  overriddenTaskIds?: string[];
};

const toMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return redactSecretsForLogs(error.message);
  }

  return redactSecretsForLogs(String(error));
};

const validateFilesChanged = (filesChanged: unknown): string[] => {
  if (!Array.isArray(filesChanged)) {
    throw new Error('Fix handler contract violation: filesChanged must be an array.');
  }

  if (filesChanged.some((file) => typeof file !== 'string' || file.trim().length === 0)) {
    throw new Error('Fix handler contract violation: filesChanged entries must be non-empty strings.');
  }

  return filesChanged;
};

const validateAppliedHandlerResult = (result: FixHandlerResult, task: PlanTask, repoRoot: string, maxChangeLevel: ChangeLevel): void => {
  const filesChanged = validateFilesChanged(result.filesChanged);

  if (typeof result.summary !== 'string' || result.summary.trim().length === 0) {
    throw new Error('Fix handler contract violation: summary must be a non-empty string for applied handlers.');
  }

  for (const changedFile of filesChanged) {
    validateRepoBoundary(repoRoot, changedFile);
  }

  if (task.file && !filesChanged.includes(task.file)) {
    throw new Error(`Fix handler contract violation: filesChanged must include ${task.file}.`);
  }

  // The ceiling gates the declared task.file before the handler runs; this gates what the handler says it wrote.
  assertReportedWritesWithinCeiling(filesChanged, maxChangeLevel, { repoRoot });
};

const validateNonAppliedHandlerResult = (result: FixHandlerResult, status: 'skipped' | 'unsupported'): void => {
  if (typeof result.message !== 'string' || result.message.trim().length === 0) {
    throw new Error(`Fix handler contract violation: message must be a non-empty string for ${status} handlers.`);
  }

  if (result.filesChanged !== undefined) {
    throw new Error(`Fix handler contract violation: ${status} handlers must not return filesChanged.`);
  }
};

const validateHandlerResult = (result: FixHandlerResult, task: PlanTask, repoRoot: string, maxChangeLevel: ChangeLevel): void => {
  if (!result || typeof result !== 'object') {
    throw new Error('Fix handler contract violation: handler must return an object result.');
  }

  if (result.status === 'applied') {
    validateAppliedHandlerResult(result, task, repoRoot, maxChangeLevel);
    return;
  }

  if (result.status === 'skipped' || result.status === 'unsupported') {
    validateNonAppliedHandlerResult(result, result.status);
    return;
  }

  throw new Error('Fix handler contract violation: status must be one of applied, skipped, or unsupported.');
};

const summarize = (results: ApplyTaskResult[]): ApplySummary => ({
  applied: results.filter((result) => result.status === 'applied').length,
  skipped: results.filter((result) => result.status === 'skipped').length,
  unsupported: results.filter((result) => result.status === 'unsupported').length,
  failed: results.filter((result) => result.status === 'failed').length
});

export class HandlerResolver {
  constructor(private readonly registry: HandlerRegistry) {}

  /** Rule ids whose handler is plugin-registered; a plugin handler overrides the built-in one. */
  pluginRuleIds(): Set<string> {
    return new Set(Object.entries(this.registry.plugin ?? {}).filter(([, handler]) => Boolean(handler)).map(([ruleId]) => ruleId));
  }

  resolve(task: PlanTask): ResolvedHandler | null {
    const pluginHandler = this.registry.plugin?.[task.ruleId];
    if (pluginHandler) {
      return {
        source: 'plugin',
        handlerId: task.ruleId,
        handler: pluginHandler
      };
    }

    const builtInHandler = this.registry.builtIn[task.ruleId];
    if (builtInHandler) {
      return {
        source: 'builtin',
        handlerId: task.ruleId,
        handler: builtInHandler
      };
    }

    return null;
  }
}

export class FixExecutor {
  constructor(private readonly resolver: HandlerResolver) {}

  async apply(
    tasks: PlanTask[],
    options: { repoRoot: string; dryRun: boolean; maxChangeLevel?: ChangeLevel; changeLevelReason?: string }
  ): Promise<FixExecutionResult> {
    const results: ApplyTaskResult[] = [];
    const maxChangeLevel = options.maxChangeLevel ?? DEFAULT_MAX_APPLY_CHANGE_LEVEL;
    // Raising the ceiling above the default requires a recorded reason at every entry point, not just the CLI.
    assertCeilingAuthorized(maxChangeLevel, options.changeLevelReason);
    const pluginRuleIds = this.resolver.pluginRuleIds();
    validateRemediationPlan(options.repoRoot, tasks, { pluginRuleIds, maxChangeLevel, changeLevelReason: options.changeLevelReason });
    const raised = maxChangeLevel > DEFAULT_MAX_APPLY_CHANGE_LEVEL;
    const overriddenTaskIds = new Set<string>(
      raised
        ? tasks
            .filter((task) => task.autoFix)
            .filter((task) => resolveTaskChangeLevel(task, { repoRoot: options.repoRoot, pluginHandler: pluginRuleIds.has(task.ruleId) }) > DEFAULT_MAX_APPLY_CHANGE_LEVEL)
            .map((task) => task.id)
        : []
    );
    let halted = false;

    for (const task of tasks) {
      if (halted) {
        results.push({
          id: task.id,
          ruleId: task.ruleId,
          file: task.file,
          action: task.action,
          autoFix: task.autoFix,
          status: 'skipped',
          message: 'Not executed: an earlier task reported a write above the change-level ceiling.'
        });
        continue;
      }

      if (!task.autoFix) {
        results.push({
          id: task.id,
          ruleId: task.ruleId,
          file: task.file,
          action: task.action,
          autoFix: task.autoFix,
          status: 'skipped',
          message: 'Task is not marked auto-fixable.'
        });
        continue;
      }

      const resolved = this.resolver.resolve(task);
      if (!resolved) {
        results.push({
          id: task.id,
          ruleId: task.ruleId,
          file: task.file,
          action: task.action,
          autoFix: task.autoFix,
          status: 'unsupported',
          message: 'No deterministic handler is registered for this task.'
        });
        continue;
      }

      try {
        const handlerResult = await resolved.handler({ repoRoot: options.repoRoot, dryRun: options.dryRun, task });
        validateHandlerResult(handlerResult, task, options.repoRoot, maxChangeLevel);
        if (raised && handlerResult.status === 'applied' && (handlerResult.filesChanged ?? []).some((file) => classifyPathChangeLevel(file, { repoRoot: options.repoRoot }) > DEFAULT_MAX_APPLY_CHANGE_LEVEL)) {
          overriddenTaskIds.add(task.id);
        }
        results.push({
          id: task.id,
          ruleId: task.ruleId,
          file: task.file,
          action: task.action,
          autoFix: task.autoFix,
          status: handlerResult.status,
          message: handlerResult.message,
          details: handlerResult.details
        });
      } catch (error) {
        if (error instanceof ChangeLevelWriteViolationError) {
          halted = true;
        }
        results.push({
          id: task.id,
          ruleId: task.ruleId,
          file: task.file,
          action: task.action,
          autoFix: task.autoFix,
          status: 'failed',
          message: toMessage(error)
        });
      }
    }

    return {
      results,
      summary: summarize(results),
      ...(raised ? { overriddenTaskIds: [...overriddenTaskIds].sort((left, right) => left.localeCompare(right)) } : {})
    };
  }
}
