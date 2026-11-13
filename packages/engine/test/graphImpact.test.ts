import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GRAPH_IMPACT_DEFAULT_LIMIT,
  computeGraphImpact,
  readGraphImpact,
  resolveGraphImpactTarget
} from '../src/graph/graphImpact.js';
import { REPOSITORY_GRAPH_RELATIVE_PATH, generateRepositoryGraph } from '../src/graph/repoGraph.js';
import type { RepositoryIndex } from '../src/indexer/repoIndexer.js';

const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');

const graphOf = (modules: Array<{ name: string; dependencies: string[] }>) => {
  const index: RepositoryIndex = {
    schemaVersion: '1.0',
    framework: 'node',
    language: 'typescript',
    architecture: 'modular-monolith',
    modules,
    database: 'none',
    rules: ['PB001']
  };
  return generateRepositoryGraph(index, FIXED_DATE);
};

// a depends on b and c; b and c both depend on d.
const diamond = graphOf([
  { name: 'a', dependencies: ['b', 'c'] },
  { name: 'b', dependencies: ['d'] },
  { name: 'c', dependencies: ['d'] },
  { name: 'd', dependencies: [] }
]);

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('computeGraphImpact', () => {
  it('returns transitive dependents with depth, edge kinds and the shortest path (diamond)', () => {
    const result = computeGraphImpact(diamond, 'd');

    expect(result.direction).toBe('dependents');
    expect(result.target).toEqual({ input: 'd', resolvedAs: 'module', module: 'd' });
    expect(result.dependents).toEqual([
      { module: 'b', depth: 1, edgeKinds: ['depends_on'], path: ['d', 'b'] },
      { module: 'c', depth: 1, edgeKinds: ['depends_on'], path: ['d', 'c'] },
      // Two shortest paths exist (via b and via c); the lexicographically smallest is chosen.
      { module: 'a', depth: 2, edgeKinds: ['depends_on', 'depends_on'], path: ['d', 'b', 'a'] }
    ]);
    expect(result.dependencies).toBeUndefined();
    expect(result.totals).toEqual({ dependents: 3 });
    expect(result.truncated).toBe(false);
    expect(result.depthLimit).toBeNull();
  });

  it('returns transitive dependencies, and both directions together', () => {
    const dependencies = computeGraphImpact(diamond, 'a', { direction: 'dependencies' });
    expect(dependencies.dependencies?.map((entry) => [entry.module, entry.depth])).toEqual([
      ['b', 1],
      ['c', 1],
      ['d', 2]
    ]);
    expect(dependencies.dependencies?.at(-1)?.path).toEqual(['a', 'b', 'd']);
    expect(dependencies.dependents).toBeUndefined();

    const both = computeGraphImpact(diamond, 'b', { direction: 'both' });
    expect(both.dependents?.map((entry) => entry.module)).toEqual(['a']);
    expect(both.dependencies?.map((entry) => entry.module)).toEqual(['d']);
    expect(both.totals).toEqual({ dependents: 1, dependencies: 1 });
  });

  it('terminates on cycles, never returns the target, and reports each module once', () => {
    const cyclic = graphOf([
      { name: 'x', dependencies: ['y'] },
      { name: 'y', dependencies: ['z'] },
      { name: 'z', dependencies: ['x'] }
    ]);

    const result = computeGraphImpact(cyclic, 'x', { direction: 'both' });
    expect(result.dependents?.map((entry) => [entry.module, entry.depth])).toEqual([
      ['z', 1],
      ['y', 2]
    ]);
    expect(result.dependencies?.map((entry) => [entry.module, entry.depth])).toEqual([
      ['y', 1],
      ['z', 2]
    ]);
  });

  it('honors the depth limit', () => {
    const limited = computeGraphImpact(diamond, 'd', { depth: 1 });
    expect(limited.dependents?.map((entry) => entry.module)).toEqual(['b', 'c']);
    expect(limited.depthLimit).toBe(1);
    expect(limited.totals).toEqual({ dependents: 2 });
  });

  it('truncates at the limit, keeps the totals, and orders deterministically', () => {
    const hub = graphOf([
      { name: 'core', dependencies: [] },
      ...['m5', 'm1', 'm4', 'm2', 'm3'].map((name) => ({ name, dependencies: ['core'] }))
    ]);

    const result = computeGraphImpact(hub, 'core', { limit: 3 });
    expect(result.dependents?.map((entry) => entry.module)).toEqual(['m1', 'm2', 'm3']);
    expect(result.truncated).toBe(true);
    expect(result.totals.dependents).toBe(5);
    expect(result.limit).toBe(3);

    const reordered = graphOf([
      ...['m3', 'm2', 'm1', 'm4', 'm5'].map((name) => ({ name, dependencies: ['core'] })),
      { name: 'core', dependencies: [] }
    ]);
    expect(computeGraphImpact(reordered, 'core', { limit: 3 })).toEqual(result);
    expect(GRAPH_IMPACT_DEFAULT_LIMIT).toBe(200);
  });

  it('fails closed on an unknown target with guidance to run playbook index', () => {
    expect(() => computeGraphImpact(diamond, 'nope')).toThrow(/unknown target "nope".*playbook index/);
    expect(() => computeGraphImpact(diamond, '  ')).toThrow(/missing target/);
  });

  it('rejects invalid depth, direction and limit', () => {
    expect(() => computeGraphImpact(diamond, 'a', { depth: 0 })).toThrow(/invalid --depth/);
    expect(() => computeGraphImpact(diamond, 'a', { depth: 1.5 })).toThrow(/invalid --depth/);
    expect(() => computeGraphImpact(diamond, 'a', { direction: 'sideways' as never })).toThrow(/invalid --direction/);
    expect(() => computeGraphImpact(diamond, 'a', { limit: 0 })).toThrow(/invalid --limit/);
    expect(() => computeGraphImpact(diamond, 'a', { limit: 5000 })).toThrow(/invalid --limit/);
  });

  it('rejects a graph without nodes and edges', () => {
    expect(() => computeGraphImpact({} as never, 'a')).toThrow(/invalid repository graph/);
  });
});

describe('resolveGraphImpactTarget', () => {
  it('resolves module names (exact, module: prefix, unique case-insensitive)', () => {
    expect(resolveGraphImpactTarget(diamond, 'module:b').module).toBe('b');
    expect(resolveGraphImpactTarget(diamond, 'B').module).toBe('b');
  });

  it('resolves a file to the module that owns it, preferring the longest root', () => {
    const graph = graphOf([
      { name: 'auth', dependencies: [] },
      { name: 'auth-admin', dependencies: [] }
    ]);

    expect(resolveGraphImpactTarget(graph, 'src/auth/session.ts')).toEqual({
      input: 'src/auth/session.ts',
      resolvedAs: 'file',
      module: 'auth',
      file: 'src/auth/session.ts'
    });
    // A shared prefix must not match: src/auth-admin is not inside src/auth.
    expect(resolveGraphImpactTarget(graph, './src\\auth-admin\\index.ts').module).toBe('auth-admin');
    expect(() => resolveGraphImpactTarget(graph, 'src/billing/index.ts')).toThrow(/unknown target/);
  });

  it('uses supplied module roots for workspace packages, longest root first', () => {
    const graph = graphOf([
      { name: '@scope/engine', dependencies: [] },
      { name: '@scope/engine-extra', dependencies: [] }
    ]);
    const moduleRoots = { '@scope/engine': 'packages/engine', '@scope/engine-extra': 'packages/engine/extra' };

    expect(resolveGraphImpactTarget(graph, 'packages/engine/src/index.ts', moduleRoots).module).toBe('@scope/engine');
    expect(resolveGraphImpactTarget(graph, 'packages/engine/extra/a.ts', moduleRoots).module).toBe('@scope/engine-extra');
    expect(computeGraphImpact(graph, 'packages/engine/src/index.ts', { moduleRoots }).target.file).toBe('packages/engine/src/index.ts');
  });
});

describe('readGraphImpact', () => {
  const repoWith = (graph: unknown, index?: unknown): string => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-graph-impact-'));
    roots.push(repo);
    if (graph !== undefined) {
      const graphPath = path.join(repo, REPOSITORY_GRAPH_RELATIVE_PATH);
      fs.mkdirSync(path.dirname(graphPath), { recursive: true });
      fs.writeFileSync(graphPath, JSON.stringify(graph));
    }
    if (index !== undefined) {
      fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
      fs.writeFileSync(path.join(repo, '.playbook', 'repo-index.json'), JSON.stringify(index));
    }
    return repo;
  };

  it('reads the committed graph artifact and reports its version', () => {
    const report = readGraphImpact(repoWith(diamond), 'd');

    expect(report.graph).toEqual({ schemaVersion: '1.1', generatedAt: '2026-01-01T00:00:00.000Z' });
    expect(report.dependents?.map((entry) => entry.module)).toEqual(['b', 'c', 'a']);
  });

  it('fails closed when the graph is missing or invalid', () => {
    expect(() => readGraphImpact(repoWith(undefined), 'd')).toThrow(/missing repository graph.*playbook index/);
    expect(() => readGraphImpact(repoWith({ ...diamond, kind: 'other' }), 'd')).toThrow(/invalid graph artifact kind/);
    expect(() => readGraphImpact(repoWith({ ...diamond, schemaVersion: '1.2' }), 'd')).toThrow(/unsupported repository graph schemaVersion/);
  });

  it('resolves workspace file paths from the index when present and ignores a broken index', () => {
    const graph = graphOf([{ name: '@scope/engine', dependencies: [] }]);
    const withIndex = repoWith(graph, { workspace: [{ name: '@scope/engine', path: 'packages/engine' }] });
    expect(readGraphImpact(withIndex, 'packages/engine/src/x.ts').target.module).toBe('@scope/engine');

    const brokenIndex = repoWith(graph);
    fs.writeFileSync(path.join(brokenIndex, '.playbook', 'repo-index.json'), '{not json');
    expect(() => readGraphImpact(brokenIndex, 'packages/engine/src/x.ts')).toThrow(/unknown target/);
  });
});
