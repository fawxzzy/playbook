import { readGraphImpact, readRepositoryGraph, summarizeRepositoryGraph } from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
const printText = (result) => {
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
const IMPACT_VALUE_FLAGS = ['--depth', '--direction', '--limit'];
const readFlagValue = (args, flag) => {
    const inline = args.find((arg) => arg.startsWith(`${flag}=`));
    if (inline)
        return inline.slice(flag.length + 1);
    const index = args.indexOf(flag);
    if (index < 0)
        return undefined;
    const value = args[index + 1];
    if (value === undefined || value.startsWith('-')) {
        throw new Error(`playbook graph impact: ${flag} requires a value.`);
    }
    return value;
};
const parseIntegerFlag = (args, flag) => {
    const raw = readFlagValue(args, flag);
    if (raw === undefined)
        return undefined;
    if (!/^\d+$/.test(raw)) {
        throw new Error(`playbook graph impact: invalid ${flag} "${raw}". Use a positive integer.`);
    }
    return Number(raw);
};
const parseImpactArgs = (args) => {
    const rest = args.slice(args.findIndex((arg) => !arg.startsWith('-')) + 1);
    const positionals = [];
    for (let index = 0; index < rest.length; index += 1) {
        const arg = rest[index];
        if (IMPACT_VALUE_FLAGS.includes(arg)) {
            index += 1;
            continue;
        }
        if (!arg.startsWith('-'))
            positionals.push(arg);
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
        direction: direction,
        limit: parseIntegerFlag(rest, '--limit')
    };
};
const printImpactList = (title, entries, total) => {
    console.log(`${title} (${entries.length}${total > entries.length ? ` of ${total}` : ''}):`);
    if (entries.length === 0) {
        console.log('- none');
        return;
    }
    for (const entry of entries) {
        console.log(`- ${entry.module} (depth ${entry.depth}) via ${entry.path.join(' -> ')}`);
    }
};
const printImpactText = (report) => {
    console.log('Graph Impact');
    console.log('────────────');
    console.log(`Target: ${report.target.module}${report.target.file ? ` (from file ${report.target.file})` : ''}`);
    console.log(`Direction: ${report.direction}; depth limit: ${report.depthLimit ?? 'none'}; result limit: ${report.limit}`);
    if (report.dependents)
        printImpactList('Dependents', report.dependents, report.totals.dependents ?? 0);
    if (report.dependencies)
        printImpactList('Dependencies', report.dependencies, report.totals.dependencies ?? 0);
    if (report.truncated)
        console.log('Results truncated; raise --limit (max 1000) or lower --depth.');
};
const runGraphImpact = async (cwd, args, options) => {
    try {
        const parsed = parseImpactArgs(args);
        const report = readGraphImpact(cwd, parsed.target, {
            depth: parsed.depth,
            direction: parsed.direction,
            limit: parsed.limit
        });
        if (options.format === 'json') {
            console.log(JSON.stringify({ command: 'graph', subcommand: 'impact', ...report }, null, 2));
            return ExitCode.Success;
        }
        if (!options.quiet) {
            printImpactText(report);
        }
        return ExitCode.Success;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.format === 'json') {
            console.log(JSON.stringify({ schemaVersion: '1.0', command: 'graph', subcommand: 'impact', error: message }, null, 2));
        }
        else {
            console.error(message);
        }
        return ExitCode.Failure;
    }
};
export const runGraph = async (cwd, options) => {
    const args = options.args ?? [];
    if (args.find((arg) => !arg.startsWith('-')) === 'impact') {
        return runGraphImpact(cwd, args, options);
    }
    try {
        const graph = readRepositoryGraph(cwd);
        const result = {
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (options.format === 'json') {
            console.log(JSON.stringify({
                schemaVersion: '1.1',
                command: 'graph',
                error: message
            }, null, 2));
        }
        else {
            console.error(message);
        }
        return ExitCode.Failure;
    }
};
//# sourceMappingURL=graph.js.map