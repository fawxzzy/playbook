import { readGraphImpact, readRepositoryGraph, summarizeRepositoryGraph } from '@zachariahredfield/playbook-engine';

// Structural copies of the engine graph-impact types (the CLI build declares the engine module loosely).
type GraphImpactDirection = 'dependents' | 'dependencies' | 'both';
type GraphImpactEntry = { module: string; depth: number; edgeKinds: string[]; path: string[] };
type GraphImpactReport = {
  schemaVersion: '1.0';
  target: { input: string; resolvedAs: 'module' | 'file'; module: string; file?: string };
  direction: GraphImpactDirection;
  depthLimit: number | null;
  limit: number;
  truncated: boolean;
  totals: { dependents?: number; dependencies?: number };
  dependents?: GraphImpactEntry[];
  dependencies?: GraphImpactEntry[];
  graph: { schemaVersion: string; generatedAt: string };
};
import { ExitCode } from '../lib/cliContract.js';

type GraphOptions = {
  format: 'text' | 'json';
  quiet: boolean;
  /** Raw arguments after `graph`; only `graph impact ...` is interpreted. */
  args?: string[];
};

type GraphSummaryResult = {
  schemaVersion: '1.1';
  command: 'graph';
  graph: ReturnType<typeof summarizeRepositoryGraph>;
};

const printText = (result: GraphSummaryResult): void => {
  console.log('Repository Knowledge Graph');
  console.log('──────────────────────────');
  console.log(`Kind: ${result.graph.kind}`);
  console.log(`Schema: ${result.graph.schemaVersion}`);
  console.log(`Generated: ${result.graph.generatedAt}`);
  console.log(`Nodes: ${result.graph.stats.nodeCount}`);
  console.log(`Edges: ${result.graph.stats.edgeCount}`);
  console.log(`Node kinds: ${result.graph.nodeKinds.join(', ') || 'none'}`);
  console.log(`Edge kinds: ${result.graph.edgeKinds.join(', ') || 'none'}`);

  if (result.graph.topDependencyHubs.length > 0) {
    console.log('Top dependency hubs:');
    for (const hub of result.graph.topDependencyHubs) {
      console.log(`- ${hub.module} (${hub.incomingDependencies})`);
    }
  }
};

const IMPACT_VALUE_FLAGS = ['--depth', '--direction', '--limit'] as const;

type ImpactArgs = { target: string; depth?: number; direction?: GraphImpactDirection; limit?: number };

const readFlagValue = (args: string[], flag: string): string | undefined => {
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`playbook graph impact: ${flag} requires a value.`);
  }
  return value;
};

const parseIntegerFlag = (args: string[], flag: string): number | undefined => {
  const raw = readFlagValue(args, flag);
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`playbook graph impact: invalid ${flag} "${raw}". Use a positive integer.`);
  }
  return Number(raw);
};

const parseImpactArgs = (args: string[]): ImpactArgs => {
  const rest = args.slice(args.findIndex((arg) => !arg.startsWith('-')) + 1);
  const positionals: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (IMPACT_VALUE_FLAGS.includes(arg as (typeof IMPACT_VALUE_FLAGS)[number])) {
      index += 1;
      continue;
    }
    if (!arg.startsWith('-')) positionals.push(arg);
  }

  if (positionals.length !== 1) {
    throw new Error('playbook graph impact: expected exactly one target. Usage: playbook graph impact <module|file-path> [--depth N] [--direction dependents|dependencies|both] [--limit N] [--json]');
  }

  const direction = readFlagValue(rest, '--direction');
  if (direction !== undefined && direction !== 'dependents' && direction !== 'dependencies' && direction !== 'both') {
    throw new Error(`playbook graph impact: invalid --direction "${direction}". Use dependents, dependencies, or both.`);
  }

  return {
    target: positionals[0],
    depth: parseIntegerFlag(rest, '--depth'),
    direction: direction as GraphImpactDirection | undefined,
    limit: parseIntegerFlag(rest, '--limit')
  };
};

const printImpactList = (title: string, entries: GraphImpactEntry[], total: number): void => {
  console.log(`${title} (${entries.length}${total > entries.length ? ` of ${total}` : ''}):`);
  if (entries.length === 0) {
    console.log('- none');
    return;
  }
  for (const entry of entries) {
    console.log(`- ${entry.module} (depth ${entry.depth}) via ${entry.path.join(' -> ')}`);
  }
};

const printImpactText = (report: GraphImpactReport): void => {
  console.log('Graph Impact');
  console.log('────────────');
  console.log(`Target: ${report.target.module}${report.target.file ? ` (from file ${report.target.file})` : ''}`);
  console.log(`Direction: ${report.direction}; depth limit: ${report.depthLimit ?? 'none'}; result limit: ${report.limit}`);
  if (report.dependents) printImpactList('Dependents', report.dependents, report.totals.dependents ?? 0);
  if (report.dependencies) printImpactList('Dependencies', report.dependencies, report.totals.dependencies ?? 0);
  if (report.truncated) console.log('Results truncated; raise --limit (max 1000) or lower --depth.');
};

const runGraphImpact = async (cwd: string, args: string[], options: GraphOptions): Promise<number> => {
  try {
    const parsed = parseImpactArgs(args);
    const report = readGraphImpact(cwd, parsed.target, {
      depth: parsed.depth,
      direction: parsed.direction,
      limit: parsed.limit
    }) as GraphImpactReport;

    if (options.format === 'json') {
      console.log(JSON.stringify({ command: 'graph', subcommand: 'impact', ...report }, null, 2));
      return ExitCode.Success;
    }

    if (!options.quiet) {
      printImpactText(report);
    }
    return ExitCode.Success;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.format === 'json') {
      console.log(JSON.stringify({ schemaVersion: '1.0', command: 'graph', subcommand: 'impact', error: message }, null, 2));
    } else {
      console.error(message);
    }
    return ExitCode.Failure;
  }
};

export const runGraph = async (cwd: string, options: GraphOptions): Promise<number> => {
  const args = options.args ?? [];
  if (args.find((arg) => !arg.startsWith('-')) === 'impact') {
    return runGraphImpact(cwd, args, options);
  }

  try {
    const graph = readRepositoryGraph(cwd);
    const result: GraphSummaryResult = {
      schemaVersion: '1.1',
      command: 'graph',
      graph: summarizeRepositoryGraph(graph)
    };

    if (options.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return ExitCode.Success;
    }

    if (!options.quiet) {
      printText(result);
    }

    return ExitCode.Success;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (options.format === 'json') {
      console.log(
        JSON.stringify(
          {
            schemaVersion: '1.1',
            command: 'graph',
            error: message
          },
          null,
          2
        )
      );
    } else {
      console.error(message);
    }

    return ExitCode.Failure;
  }
};
