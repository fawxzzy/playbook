import { readGraphBoundaries, readGraphImpact, readGraphRisks, readRepositoryGraph, summarizeRepositoryGraph } from '@zachariahredfield/playbook-engine';
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
            const { schemaVersion, ...rest } = report;
            console.log(JSON.stringify({ schemaVersion, command: 'graph', subcommand: 'impact', ...rest }, null, 2));
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
/** `graph boundaries` and `graph risks` take no target; the only option is `--limit N`. */
const parseReportLimit = (subcommand, args) => {
    const rest = args.slice(args.findIndex((arg) => !arg.startsWith('-')) + 1);
    const positionals = [];
    let limit;
    for (let index = 0; index < rest.length; index += 1) {
        const arg = rest[index];
        if (arg === '--limit') {
            limit = rest[index + 1];
            if (limit === undefined || limit.startsWith('-')) {
                throw new Error(`playbook graph ${subcommand}: --limit requires a value.`);
            }
            index += 1;
        }
        else if (arg.startsWith('--limit=')) {
            limit = arg.slice('--limit='.length);
        }
        else if (!arg.startsWith('-')) {
            positionals.push(arg);
        }
    }
    if (positionals.length > 0) {
        throw new Error(`playbook graph ${subcommand}: unexpected argument "${positionals[0]}". Usage: playbook graph ${subcommand} [--limit N] [--json]`);
    }
    if (limit === undefined)
        return undefined;
    if (!/^\d+$/.test(limit)) {
        throw new Error(`playbook graph ${subcommand}: invalid --limit "${limit}". Use a positive integer.`);
    }
    return Number(limit);
};
const printBoundariesText = (report) => {
    console.log('Graph Boundaries');
    console.log('────────────────');
    console.log(report.rules.declared
        ? `Rules: declared in ${report.rules.source} (policy enforcement: ${report.rules.policyEnforcement ?? 'none'})`
        : `Rules: none declared (${report.rules.reason ?? 'observation only'})`);
    console.log(`Enforced: ${report.enforced ? 'yes' : 'no (report only)'}`);
    console.log(`Modules: ${report.summary.modules}; dependency edges: ${report.summary.edges}; allowed: ${report.summary.allowed}; ` +
        `out of direction: ${report.summary.violations}; unclassified: ${report.summary.unclassified}; observed: ${report.summary.observed}`);
    const describe = (edge) => `- ${edge.from} (${edge.fromRole ?? 'no role'}) -> ${edge.to} (${edge.toRole ?? 'no role'}): ${edge.status}`;
    if (report.rules.declared) {
        console.log(`Out-of-direction edges (${report.violations.length}${report.totals.violations > report.violations.length ? ` of ${report.totals.violations}` : ''}):`);
        if (report.violations.length === 0)
            console.log('- none');
        for (const edge of report.violations)
            console.log(describe(edge));
    }
    else {
        console.log(`Observed edges (${report.observations.length}${report.totals.observations > report.observations.length ? ` of ${report.totals.observations}` : ''}):`);
        if (report.observations.length === 0)
            console.log('- none');
        for (const edge of report.observations)
            console.log(describe(edge));
    }
    if (report.truncated)
        console.log('Results truncated; raise --limit (max 1000).');
};
const printRisksText = (report) => {
    console.log('Graph Risks');
    console.log('───────────');
    console.log(`Score: ${report.formula.score}`);
    console.log(`Hub score: ${report.formula.hubScore}`);
    console.log(`Modules (${report.modules.length}${report.totals.modules > report.modules.length ? ` of ${report.totals.modules}` : ''}):`);
    if (report.modules.length === 0)
        console.log('- none');
    for (const entry of report.modules) {
        console.log(`- ${entry.module}: score ${entry.score} (fan-in ${entry.fanIn}, fan-out ${entry.fanOut}, transitive dependents ${entry.transitiveDependents}, ` +
            `depth ${entry.depth}, hub ${entry.hubScore}${entry.inCycle ? `, in a cycle of ${entry.cycleSize}` : ''})`);
    }
    console.log(`Cycles (${report.cycles.length}${report.totals.cycles > report.cycles.length ? ` of ${report.totals.cycles}` : ''}):`);
    if (report.cycles.length === 0)
        console.log('- none');
    for (const cycle of report.cycles)
        console.log(`- ${cycle.join(', ')}`);
    if (report.truncated)
        console.log('Results truncated; raise --limit (max 1000).');
};
const runGraphReport = async (cwd, subcommand, args, options) => {
    try {
        const limit = parseReportLimit(subcommand, args);
        const report = subcommand === 'boundaries'
            ? readGraphBoundaries(cwd, { limit })
            : readGraphRisks(cwd, { limit });
        if (options.format === 'json') {
            const { schemaVersion, ...rest } = report;
            console.log(JSON.stringify({ schemaVersion, command: 'graph', subcommand, ...rest }, null, 2));
            return ExitCode.Success;
        }
        if (!options.quiet) {
            if (subcommand === 'boundaries') {
                printBoundariesText(report);
            }
            else {
                printRisksText(report);
            }
        }
        return ExitCode.Success;
    }
    catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        // Graph read errors are prefixed "playbook graph:"; name the subcommand that failed.
        const message = raw.startsWith('playbook graph: ') ? `playbook graph ${subcommand}: ${raw.slice('playbook graph: '.length)}` : raw;
        if (options.format === 'json') {
            console.log(JSON.stringify({ schemaVersion: '1.0', command: 'graph', subcommand, error: message }, null, 2));
        }
        else {
            console.error(message);
        }
        return ExitCode.Failure;
    }
};
export const runGraph = async (cwd, options) => {
    const args = options.args ?? [];
    const subcommand = args.find((arg) => !arg.startsWith('-'));
    if (subcommand === 'impact') {
        return runGraphImpact(cwd, args, options);
    }
    if (subcommand === 'boundaries' || subcommand === 'risks') {
        return runGraphReport(cwd, subcommand, args, options);
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