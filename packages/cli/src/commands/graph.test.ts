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
