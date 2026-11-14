import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GRAPH_RISK_FORMULA, computeGraphRisks, findStronglyConnectedComponents, readGraphRisks } from '../src/graph/graphRisks.js';
import { buildModuleAdjacency, listGraphModuleNames } from '../src/graph/graphImpact.js';
import { REPOSITORY_GRAPH_RELATIVE_PATH, generateRepositoryGraph } from '../src/graph/repoGraph.js';
import type { RepositoryIndex } from '../src/indexer/repoIndexer.js';

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
  return generateRepositoryGraph(index, new Date('2026-01-01T00:00:00.000Z'));
};

// a -> b, a -> c, b -> d, c -> d
const diamond = graphOf([
  { name: 'a', dependencies: ['b', 'c'] },
  { name: 'b', dependencies: ['d'] },
  { name: 'c', dependencies: ['d'] },
  { name: 'd', dependencies: [] }
]);

// x -> y -> z -> x (cycle), w -> x, z -> leaf
const cyclic = graphOf([
  { name: 'x', dependencies: ['y'] },
  { name: 'y', dependencies: ['z'] },
  { name: 'z', dependencies: ['x', 'leaf'] },
  { name: 'w', dependencies: ['x'] },
  { name: 'leaf', dependencies: [] }
]);

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('computeGraphRisks', () => {
  it('reports fan-in, fan-out, transitive counts, depth and hub score for an acyclic graph', () => {
    const result = computeGraphRisks(diamond);
    const byModule = Object.fromEntries(result.modules.map((entry) => [entry.module, entry]));

    expect(byModule.d).toEqual({
      module: 'd',
      score: 2 * 3 + 2 + 0 + 0 + 0,
      fanIn: 2,
      fanOut: 0,
      transitiveDependents: 3,
      transitiveDependencies: 0,
      inCycle: false,
      cycleSize: 0,
      depth: 0,
      hubScore: 0
    });
    expect(byModule.b).toMatchObject({ fanIn: 1, fanOut: 1, transitiveDependents: 1, transitiveDependencies: 1, depth: 1, hubScore: 1, score: 2 + 1 + 1 + 1 });
    expect(byModule.a).toMatchObject({ fanIn: 0, fanOut: 2, transitiveDependents: 0, transitiveDependencies: 3, depth: 2, hubScore: 0, score: 2 });
    expect(result.cycles).toEqual([]);
    expect(result.totals).toEqual({ modules: 4, cycles: 0 });
    expect(result.truncated).toBe(false);
  });

  it('applies the documented formula exactly', () => {
    const { weights } = GRAPH_RISK_FORMULA;
    for (const entry of [...computeGraphRisks(diamond).modules, ...computeGraphRisks(cyclic).modules]) {
      expect(entry.hubScore).toBe(entry.fanIn * entry.fanOut);
      expect(entry.score).toBe(
        weights.transitiveDependents * entry.transitiveDependents +
          weights.fanIn * entry.fanIn +
          weights.fanOut * entry.fanOut +
          weights.hubScore * entry.hubScore +
          weights.cycleSize * entry.cycleSize
      );
    }
    expect(GRAPH_RISK_FORMULA.score).toBe('2 * transitiveDependents + fanIn + fanOut + hubScore + 3 * cycleSize');
    expect(GRAPH_RISK_FORMULA.hubScore).toBe('fanIn * fanOut');
  });

  it('detects cycle membership, shares depth inside a cycle, and lists cycles deterministically', () => {
    const result = computeGraphRisks(cyclic);
    const byModule = Object.fromEntries(result.modules.map((entry) => [entry.module, entry]));

    expect(result.cycles).toEqual([['x', 'y', 'z']]);
    for (const name of ['x', 'y', 'z']) {
      expect(byModule[name]).toMatchObject({ inCycle: true, cycleSize: 3, depth: 1 });
    }
    expect(byModule.w).toMatchObject({ inCycle: false, cycleSize: 0, depth: 2 });
    expect(byModule.leaf).toMatchObject({ inCycle: false, depth: 0, transitiveDependents: 4 });
    // A cycle member reaches the other two members but never counts itself.
    expect(byModule.x.transitiveDependents).toBe(3);
    expect(byModule.x.transitiveDependencies).toBe(3);
  });

  it('treats a self-dependency as a cycle of one without counting it as fan-in or fan-out', () => {
    const selfLoop = graphOf([{ name: 'solo', dependencies: ['solo'] }]);
    expect(computeGraphRisks(selfLoop).modules).toEqual([
      {
        module: 'solo',
        score: 3,
        fanIn: 0,
        fanOut: 0,
        transitiveDependents: 0,
        transitiveDependencies: 0,
        inCycle: true,
        cycleSize: 1,
        depth: 0,
        hubScore: 0
      }
    ]);
    expect(computeGraphRisks(selfLoop).cycles).toEqual([['solo']]);
  });

  it('orders by score then module name, independent of input order', () => {
    const result = computeGraphRisks(diamond);
    expect(result.modules.map((entry) => [entry.module, entry.score])).toEqual([
      ['d', 8],
      ['b', 5],
      ['c', 5],
      ['a', 2]
    ]);

    const reordered = graphOf([
      { name: 'd', dependencies: [] },
      { name: 'c', dependencies: ['d'] },
      { name: 'b', dependencies: ['d'] },
      { name: 'a', dependencies: ['c', 'b'] }
    ]);
    expect(computeGraphRisks(reordered)).toEqual(result);
  });

  it('breaks score ties by code unit, not by locale', () => {
    const mixed = graphOf([
      { name: 'alpha', dependencies: [] },
      { name: '_internal', dependencies: [] },
      { name: 'Zeta', dependencies: [] }
    ]);
    // All scores are 0; localeCompare would give _internal, alpha, Zeta.
    expect(computeGraphRisks(mixed).modules.map((entry) => entry.module)).toEqual(['Zeta', '_internal', 'alpha']);
  });

  it('bounds the module and cycle lists and keeps totals', () => {
    const twoCycles = graphOf([
      { name: 'a1', dependencies: ['a2'] },
      { name: 'a2', dependencies: ['a1'] },
      { name: 'b1', dependencies: ['b2'] },
      { name: 'b2', dependencies: ['b1'] }
    ]);
    const result = computeGraphRisks(twoCycles, { limit: 1 });

    expect(result.modules).toHaveLength(1);
    expect(result.cycles).toEqual([['a1', 'a2']]);
    expect(result.totals).toEqual({ modules: 4, cycles: 2 });
    expect(result.truncated).toBe(true);
    expect(result.limit).toBe(1);
  });

  it('handles an empty graph and rejects invalid input', () => {
    expect(computeGraphRisks(graphOf([])).modules).toEqual([]);
    expect(() => computeGraphRisks({} as never)).toThrow(/playbook graph risks: invalid repository graph/);
    expect(() => computeGraphRisks(diamond, { limit: 0 })).toThrow(/playbook graph risks: invalid --limit/);
    expect(() => computeGraphRisks(diamond, { limit: 1001 })).toThrow(/invalid --limit/);
  });

  it('survives a long dependency chain without recursion limits', () => {
    const size = 5000;
    const chain = graphOf(
      Array.from({ length: size }, (_, index) => ({
        name: `m${String(index).padStart(4, '0')}`,
        dependencies: index + 1 < size ? [`m${String(index + 1).padStart(4, '0')}`] : []
      }))
    );
    const modules = listGraphModuleNames(chain);
    const components = findStronglyConnectedComponents(modules, buildModuleAdjacency(chain, false));

    expect(components).toHaveLength(size);
    // Dependencies come first: the leaf of the chain is emitted before the head.
    expect(components[0]).toEqual([`m${String(size - 1).padStart(4, '0')}`]);
    expect(components.at(-1)).toEqual(['m0000']);

    const result = computeGraphRisks(chain, { limit: 2 });
    expect(result.totals.modules).toBe(size);
    // The leaf (m4999: 2 * 4999 + 1) and its only dependent (m4998: 2 * 4998 + 1 + 1 + 1) tie on score; the name breaks the tie.
    expect(result.modules.map((entry) => [entry.module, entry.score, entry.transitiveDependents, entry.depth])).toEqual([
      ['m4998', 9999, size - 2, 1],
      ['m4999', 9999, size - 1, 0]
    ]);
  });
});

describe('readGraphRisks', () => {
  it('reads the graph artifact and fails closed when it is missing or invalid', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-graph-risks-'));
    roots.push(repo);
    expect(() => readGraphRisks(repo)).toThrow(/missing repository graph.*playbook index/);

    const graphPath = path.join(repo, REPOSITORY_GRAPH_RELATIVE_PATH);
    fs.mkdirSync(path.dirname(graphPath), { recursive: true });
    fs.writeFileSync(graphPath, JSON.stringify(diamond));
    const report = readGraphRisks(repo);
    expect(report.graph).toEqual({ schemaVersion: '1.1', generatedAt: '2026-01-01T00:00:00.000Z' });
    expect(report.modules[0].module).toBe('d');

    fs.writeFileSync(graphPath, JSON.stringify({ ...diamond, schemaVersion: '9.9' }));
    expect(() => readGraphRisks(repo)).toThrow(/unsupported repository graph schemaVersion/);
  });
});
