import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { listRegisteredCommands } from './index.js';
import { runGraph } from './graph.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

describe('runGraph', () => {
  it('prints deterministic JSON graph summary when artifact exists', async () => {
    const repo = createRepo('playbook-cli-graph');
    fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, '.playbook', 'repo-graph.json'),
      `${JSON.stringify(
        {
          schemaVersion: '1.1',
          kind: 'playbook-repo-graph',
          generatedAt: '2026-01-01T00:00:00.000Z',
          nodes: [
            { id: 'repository:root', kind: 'repository', name: 'root' },
            { id: 'module:auth', kind: 'module', name: 'auth' },
            { id: 'module:workouts', kind: 'module', name: 'workouts' },
            { id: 'rule:PB001', kind: 'rule', name: 'PB001' }
          ],
          edges: [
            { kind: 'contains', from: 'repository:root', to: 'module:auth' },
            { kind: 'contains', from: 'repository:root', to: 'module:workouts' },
            { kind: 'contains', from: 'repository:root', to: 'rule:PB001' },
            { kind: 'depends_on', from: 'module:workouts', to: 'module:auth' },
            { kind: 'governed_by', from: 'module:auth', to: 'rule:PB001' },
            { kind: 'governed_by', from: 'module:workouts', to: 'rule:PB001' }
          ],
          stats: { nodeCount: 4, edgeCount: 6 }
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runGraph(repo, { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload).toEqual({
      schemaVersion: '1.1',
      command: 'graph',
      graph: {
        schemaVersion: '1.1',
        kind: 'playbook-repo-graph',
        generatedAt: '2026-01-01T00:00:00.000Z',
        stats: { nodeCount: 4, edgeCount: 6 },
        nodeKinds: ['module', 'repository', 'rule'],
        edgeKinds: ['contains', 'depends_on', 'governed_by'],
        topDependencyHubs: [
          { module: 'auth', incomingDependencies: 1 },
          { module: 'workouts', incomingDependencies: 0 }
        ],
        architectureRoleInference: {
          schemaVersion: '1.0',
          roles: [
            {
              module: 'auth',
              role: 'foundation',
              evidence: { incomingDependencies: 1, outgoingDependencies: 0, dependencyDirection: 'inbound' }
            },
            {
              module: 'workouts',
              role: 'interface',
              evidence: { incomingDependencies: 0, outgoingDependencies: 1, dependencyDirection: 'outbound' }
            }
          ]
        }
      }
    });

    logSpy.mockRestore();
  });

  it('returns deterministic missing-artifact error in JSON mode', async () => {
    const repo = createRepo('playbook-cli-graph-missing');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const exitCode = await runGraph(repo, { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Failure);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload).toEqual({
      schemaVersion: '1.1',
      command: 'graph',
      error: 'playbook graph: missing repository graph at .playbook/repo-graph.json. Run "playbook index" first.'
    });

    logSpy.mockRestore();
  });
});

describe('command registry', () => {
  it('registers the graph command', () => {
    const command = listRegisteredCommands().find((entry) => entry.name === 'graph');

    expect(command).toBeDefined();
    expect(command?.description).toBe('Summarize machine-readable repository knowledge graph from .playbook/repo-graph.json');
  });
});

describe('runGraph impact', () => {
  const writeGraph = (repo: string): void => {
    fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, '.playbook', 'repo-graph.json'),
      JSON.stringify({
        schemaVersion: '1.1',
        kind: 'playbook-repo-graph',
        generatedAt: '2026-01-01T00:00:00.000Z',
        nodes: [
          { id: 'repository:root', kind: 'repository', name: 'root' },
          { id: 'module:auth', kind: 'module', name: 'auth' },
          { id: 'module:billing', kind: 'module', name: 'billing' },
          { id: 'module:workouts', kind: 'module', name: 'workouts' }
        ],
        edges: [
          { kind: 'depends_on', from: 'module:billing', to: 'module:auth' },
          { kind: 'depends_on', from: 'module:workouts', to: 'module:billing' }
        ],
        stats: { nodeCount: 4, edgeCount: 2 }
      })
    );
  };

  const run = async (repo: string, args: string[], format: 'text' | 'json' = 'json') => {
    const lines: string[] = [];
    const errors: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => void lines.push(parts.join(' ')));
    const error = vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => void errors.push(parts.join(' ')));
    try {
      const exitCode = await runGraph(repo, { format, quiet: false, args });
      return { exitCode, lines, errors };
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  };

  it('prints transitive dependents as JSON', async () => {
    const repo = createRepo('playbook-cli-graph-impact');
    writeGraph(repo);

    const { exitCode, lines } = await run(repo, ['impact', 'auth']);
    const payload = JSON.parse(lines.join('\n'));

    expect(exitCode).toBe(ExitCode.Success);
    expect(payload).toMatchObject({
      schemaVersion: '1.0',
      command: 'graph',
      subcommand: 'impact',
      target: { input: 'auth', resolvedAs: 'module', module: 'auth' },
      direction: 'dependents',
      depthLimit: null,
      truncated: false,
      graph: { schemaVersion: '1.1', generatedAt: '2026-01-01T00:00:00.000Z' }
    });
    expect(payload.dependents).toEqual([
      { module: 'billing', depth: 1, edgeKinds: ['depends_on'], path: ['auth', 'billing'] },
      { module: 'workouts', depth: 2, edgeKinds: ['depends_on', 'depends_on'], path: ['auth', 'billing', 'workouts'] }
    ]);
  });

  it('honors --depth, --direction and --limit (separate and = forms) and resolves file targets', async () => {
    const repo = createRepo('playbook-cli-graph-impact-flags');
    writeGraph(repo);

    const limited = JSON.parse((await run(repo, ['impact', 'auth', '--depth', '1'])).lines.join('\n'));
    expect(limited.dependents.map((entry: { module: string }) => entry.module)).toEqual(['billing']);

    const both = JSON.parse((await run(repo, ['impact', '--direction=both', 'billing', '--limit=1'])).lines.join('\n'));
    expect(both.dependents.map((entry: { module: string }) => entry.module)).toEqual(['workouts']);
    expect(both.dependencies.map((entry: { module: string }) => entry.module)).toEqual(['auth']);
    expect(both.limit).toBe(1);

    const file = JSON.parse((await run(repo, ['impact', 'src/auth/session.ts'])).lines.join('\n'));
    expect(file.target).toEqual({ input: 'src/auth/session.ts', resolvedAs: 'file', module: 'auth', file: 'src/auth/session.ts' });
  });

  it('fails closed with a nonzero exit for a missing graph, an unknown target and bad arguments', async () => {
    const empty = createRepo('playbook-cli-graph-impact-missing');
    const missing = await run(empty, ['impact', 'auth']);
    expect(missing.exitCode).toBe(ExitCode.Failure);
    expect(JSON.parse(missing.lines.join('\n'))).toMatchObject({
      command: 'graph',
      subcommand: 'impact',
      error: expect.stringContaining('Run "playbook index"')
    });

    const repo = createRepo('playbook-cli-graph-impact-errors');
    writeGraph(repo);
    for (const [args, pattern] of [
      [['impact', 'nope'], /unknown target "nope".*playbook index/],
      [['impact'], /expected exactly one target/],
      [['impact', 'a', 'b'], /expected exactly one target/],
      [['impact', 'auth', '--depth', '0'], /invalid --depth/],
      [['impact', 'auth', '--depth', 'x'], /invalid --depth "x"/],
      [['impact', 'auth', '--direction', 'sideways'], /invalid --direction/],
      [['impact', 'auth', '--depth'], /--depth requires a value/]
    ] as const) {
      const result = await run(repo, [...args]);
      expect(result.exitCode, args.join(' ')).toBe(ExitCode.Failure);
      expect(JSON.parse(result.lines.join('\n')).error, args.join(' ')).toMatch(pattern);
    }
  });

  it('prints text output to stdout and errors to stderr in text mode', async () => {
    const repo = createRepo('playbook-cli-graph-impact-text');
    writeGraph(repo);

    const ok = await run(repo, ['impact', 'auth'], 'text');
    expect(ok.exitCode).toBe(ExitCode.Success);
    expect(ok.lines).toEqual(expect.arrayContaining(['Graph Impact', 'Target: auth']));
    expect(ok.lines.join('\n')).toContain('- workouts (depth 2) via auth -> billing -> workouts');

    const bad = await run(repo, ['impact', 'nope'], 'text');
    expect(bad.exitCode).toBe(ExitCode.Failure);
    expect(bad.errors.join('\n')).toMatch(/unknown target/);
  });

  it('leaves the plain graph summary untouched when no impact subcommand is given', async () => {
    const repo = createRepo('playbook-cli-graph-impact-unchanged');
    writeGraph(repo);

    const { lines } = await run(repo, ['--json']);
    expect(JSON.parse(lines.join('\n')).command).toBe('graph');
    expect(JSON.parse(lines.join('\n')).subcommand).toBeUndefined();
  });
});

describe('runGraph boundaries and risks', () => {
  // cli -> engine -> core, core -> cli (out of direction for a foundation), which also closes a cycle.
  const writeGraph = (repo: string): void => {
    fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, '.playbook', 'repo-graph.json'),
      JSON.stringify({
        schemaVersion: '1.1',
        kind: 'playbook-repo-graph',
        generatedAt: '2026-01-01T00:00:00.000Z',
        nodes: [
          { id: 'repository:root', kind: 'repository', name: 'root' },
          { id: 'module:cli', kind: 'module', name: 'cli' },
          { id: 'module:core', kind: 'module', name: 'core' },
          { id: 'module:engine', kind: 'module', name: 'engine' }
        ],
        edges: [
          { kind: 'depends_on', from: 'module:cli', to: 'module:core' },
          { kind: 'depends_on', from: 'module:cli', to: 'module:engine' },
          { kind: 'depends_on', from: 'module:core', to: 'module:cli' },
          { kind: 'depends_on', from: 'module:engine', to: 'module:core' }
        ],
        stats: { nodeCount: 4, edgeCount: 4 }
      })
    );
  };

  const writeIndex = (repo: string, nodes: Array<{ workspace: string; inferredRole: string }>): void => {
    fs.writeFileSync(
      path.join(repo, '.playbook', 'repo-index.json'),
      JSON.stringify({
        schemaVersion: '1.0',
        architectureRoleInference: {
          classificationMode: 'observation-only',
          classifierVersion: 'role-heuristic-v1',
          policyEnforcement: 'none',
          dependencyMatrix: {
            interface: ['foundation', 'adapter'],
            orchestration: ['interface', 'foundation', 'adapter'],
            foundation: ['foundation'],
            adapter: ['interface', 'foundation']
          },
          nodes,
          dependencyObservations: []
        }
      })
    );
  };

  const run = async (repo: string, args: string[], format: 'text' | 'json' = 'json') => {
    const lines: string[] = [];
    const errors: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => void lines.push(parts.join(' ')));
    const error = vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => void errors.push(parts.join(' ')));
    try {
      const exitCode = await runGraph(repo, { format, quiet: false, args });
      return { exitCode, lines, errors };
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  };

  it('graph boundaries reports violations of the declared matrix and still exits 0', async () => {
    const repo = createRepo('playbook-cli-graph-boundaries');
    writeGraph(repo);
    writeIndex(repo, [
      { workspace: 'cli', inferredRole: 'interface' },
      { workspace: 'core', inferredRole: 'foundation' },
      { workspace: 'engine', inferredRole: 'orchestration' }
    ]);

    const { exitCode, lines } = await run(repo, ['boundaries']);
    const payload = JSON.parse(lines.join('\n'));

    // Findings never change the exit code: this is a report, not a gate.
    expect(exitCode).toBe(ExitCode.Success);
    expect(Object.keys(payload).slice(0, 4)).toEqual(['schemaVersion', 'command', 'subcommand', 'enforced']);
    expect(payload).toMatchObject({
      schemaVersion: '1.0',
      command: 'graph',
      subcommand: 'boundaries',
      enforced: false,
      rules: { declared: true, source: '.playbook/repo-index.json#architectureRoleInference', policyEnforcement: 'none' },
      summary: { modules: 3, edges: 4, allowed: 2, violations: 2, unclassified: 0, observed: 0 },
      graph: { schemaVersion: '1.1', generatedAt: '2026-01-01T00:00:00.000Z' }
    });
    expect(payload.violations).toEqual([
      { from: 'cli', to: 'engine', fromRole: 'interface', toRole: 'orchestration', status: 'out_of_direction' },
      { from: 'core', to: 'cli', fromRole: 'foundation', toRole: 'interface', status: 'out_of_direction' }
    ]);
  });

  it('graph boundaries only observes when the repository declares no rules', async () => {
    const repo = createRepo('playbook-cli-graph-boundaries-norules');
    writeGraph(repo);

    const noIndex = JSON.parse((await run(repo, ['boundaries'])).lines.join('\n'));
    expect(noIndex.enforced).toBe(false);
    expect(noIndex.rules).toMatchObject({ declared: false, source: 'none', reason: 'no repository index at .playbook/repo-index.json', dependencyMatrix: null });
    expect(noIndex.violations).toEqual([]);
    expect(noIndex.observations.map((edge: { status: string }) => edge.status)).toEqual(['observed', 'observed', 'observed', 'observed']);
    expect(noIndex.roles.every((role: { source: string }) => role.source === 'graph-inferred')).toBe(true);

    // A non-workspace repository: the index carries the matrix but no role nodes.
    writeIndex(repo, []);
    const noRoles = JSON.parse((await run(repo, ['boundaries', '--limit', '1'])).lines.join('\n'));
    expect(noRoles.rules.declared).toBe(false);
    expect(noRoles.rules.reason).toMatch(/declares no module roles/);
    expect(noRoles.observations).toHaveLength(1);
    expect(noRoles.truncated).toBe(true);
    expect(noRoles.totals).toEqual({ violations: 0, observations: 4 });
  });

  it('graph risks ranks modules with the documented formula and lists cycles', async () => {
    const repo = createRepo('playbook-cli-graph-risks');
    writeGraph(repo);

    const { exitCode, lines } = await run(repo, ['risks']);
    const payload = JSON.parse(lines.join('\n'));

    expect(exitCode).toBe(ExitCode.Success);
    expect(payload).toMatchObject({
      schemaVersion: '1.0',
      command: 'graph',
      subcommand: 'risks',
      formula: {
        hubScore: 'fanIn * fanOut',
        score: '2 * transitiveDependents + fanIn + fanOut + hubScore + 3 * cycleSize',
        weights: { transitiveDependents: 2, fanIn: 1, fanOut: 1, hubScore: 1, cycleSize: 3 }
      },
      totals: { modules: 3, cycles: 1 },
      truncated: false
    });
    // All three modules sit on one cycle (cli -> engine -> core -> cli).
    expect(payload.cycles).toEqual([['cli', 'core', 'engine']]);
    expect(payload.modules.map((entry: { module: string; score: number }) => [entry.module, entry.score])).toEqual([
      // cli: 2*2 + fanIn 1 + fanOut 2 + hub 2 + 3*3 = 18; core: 2*2 + 2 + 1 + 2 + 9 = 18; engine: 2*2 + 1 + 1 + 1 + 9 = 16
      ['cli', 18],
      ['core', 18],
      ['engine', 16]
    ]);
    expect(payload.modules[0]).toEqual({
      module: 'cli',
      score: 18,
      fanIn: 1,
      fanOut: 2,
      transitiveDependents: 2,
      transitiveDependencies: 2,
      inCycle: true,
      cycleSize: 3,
      depth: 0,
      hubScore: 2
    });

    const limited = JSON.parse((await run(repo, ['risks', '--limit=1'])).lines.join('\n'));
    expect(limited.modules).toHaveLength(1);
    expect(limited.truncated).toBe(true);
  });

  it('both subcommands fail closed with a nonzero exit on a missing or invalid graph and on bad arguments', async () => {
    const empty = createRepo('playbook-cli-graph-reports-missing');
    for (const subcommand of ['boundaries', 'risks']) {
      const missing = await run(empty, [subcommand]);
      expect(missing.exitCode, subcommand).toBe(ExitCode.Failure);
      expect(JSON.parse(missing.lines.join('\n'))).toEqual({
        schemaVersion: '1.0',
        command: 'graph',
        subcommand,
        error: `playbook graph ${subcommand}: missing repository graph at .playbook/repo-graph.json. Run "playbook index" first.`
      });
    }

    const repo = createRepo('playbook-cli-graph-reports-invalid');
    fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.playbook', 'repo-graph.json'), JSON.stringify({ kind: 'playbook-repo-graph', schemaVersion: '2.0' }));
    const unsupported = await run(repo, ['risks']);
    expect(unsupported.exitCode).toBe(ExitCode.Failure);
    expect(JSON.parse(unsupported.lines.join('\n')).error).toMatch(/unsupported repository graph schemaVersion "2.0"/);

    writeGraph(repo);
    for (const [args, pattern] of [
      [['boundaries', 'extra'], /unexpected argument "extra"/],
      [['risks', '--limit', '0'], /invalid --limit/],
      [['risks', '--limit', 'many'], /invalid --limit "many"/],
      [['boundaries', '--limit'], /--limit requires a value/],
      [['boundaries', '--limit', '5000'], /invalid --limit/]
    ] as const) {
      const result = await run(repo, [...args]);
      expect(result.exitCode, args.join(' ')).toBe(ExitCode.Failure);
      expect(JSON.parse(result.lines.join('\n')).error, args.join(' ')).toMatch(pattern);
    }
  });

  it('prints text reports and sends errors to stderr in text mode', async () => {
    const repo = createRepo('playbook-cli-graph-reports-text');
    writeGraph(repo);

    const boundaries = await run(repo, ['boundaries'], 'text');
    expect(boundaries.exitCode).toBe(ExitCode.Success);
    expect(boundaries.lines).toEqual(expect.arrayContaining(['Graph Boundaries', 'Enforced: no (report only)']));
    expect(boundaries.lines.join('\n')).toContain('Rules: none declared');

    const risks = await run(repo, ['risks'], 'text');
    expect(risks.lines).toEqual(expect.arrayContaining(['Graph Risks', 'Hub score: fanIn * fanOut', '- cli, core, engine']));

    const failed = await run(createRepo('playbook-cli-graph-reports-text-missing'), ['risks'], 'text');
    expect(failed.exitCode).toBe(ExitCode.Failure);
    expect(failed.errors.join('\n')).toMatch(/playbook graph risks: missing repository graph/);
  });
});
