import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  computeGraphBoundaries,
  parseDeclaredBoundaryRules,
  readDeclaredBoundaryRules,
  readGraphBoundaries
} from '../src/graph/graphBoundaries.js';
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

// Same matrix the indexer writes (packages/engine/src/indexer/repoIndexer.ts).
const MATRIX = {
  interface: ['foundation', 'adapter'],
  orchestration: ['interface', 'foundation', 'adapter'],
  foundation: ['foundation'],
  adapter: ['interface', 'foundation']
};

const indexWith = (nodes: Array<{ workspace: string; inferredRole: string }>, overrides: Record<string, unknown> = {}) => ({
  schemaVersion: '1.0',
  architectureRoleInference: {
    classificationMode: 'observation-only',
    classifierVersion: 'role-heuristic-v1',
    policyEnforcement: 'none',
    dependencyMatrix: MATRIX,
    nodes,
    dependencyObservations: [],
    ...overrides
  }
});

// cli -> engine -> core; core -> cli is a layering violation (foundation may only depend on foundation).
const layered = graphOf([
  { name: 'cli', dependencies: ['core', 'engine'] },
  { name: 'core', dependencies: ['cli'] },
  { name: 'engine', dependencies: ['core'] },
  { name: 'extra', dependencies: ['core'] }
]);
const layeredRoles = [
  { workspace: 'cli', inferredRole: 'interface' },
  { workspace: 'core', inferredRole: 'foundation' },
  { workspace: 'engine', inferredRole: 'orchestration' }
];

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('computeGraphBoundaries with declared rules', () => {
  const declared = parseDeclaredBoundaryRules(indexWith(layeredRoles));

  it('classifies every graph edge against the declared matrix and lists out-of-direction edges as violations', () => {
    const result = computeGraphBoundaries(layered, { declared });

    expect(result.rules).toEqual({
      declared: true,
      source: '.playbook/repo-index.json#architectureRoleInference',
      classifierVersion: 'role-heuristic-v1',
      policyEnforcement: 'none',
      dependencyMatrix: {
        adapter: ['foundation', 'interface'],
        foundation: ['foundation'],
        interface: ['adapter', 'foundation'],
        orchestration: ['adapter', 'foundation', 'interface']
      }
    });
    expect(result.observations).toEqual([
      { from: 'cli', to: 'core', fromRole: 'interface', toRole: 'foundation', status: 'allowed' },
      { from: 'cli', to: 'engine', fromRole: 'interface', toRole: 'orchestration', status: 'out_of_direction' },
      { from: 'core', to: 'cli', fromRole: 'foundation', toRole: 'interface', status: 'out_of_direction' },
      { from: 'engine', to: 'core', fromRole: 'orchestration', toRole: 'foundation', status: 'allowed' },
      // `extra` has no declared role, so its edge is not judged.
      { from: 'extra', to: 'core', fromRole: null, toRole: 'foundation', status: 'unclassified' }
    ]);
    expect(result.violations).toEqual([
      { from: 'cli', to: 'engine', fromRole: 'interface', toRole: 'orchestration', status: 'out_of_direction' },
      { from: 'core', to: 'cli', fromRole: 'foundation', toRole: 'interface', status: 'out_of_direction' }
    ]);
    expect(result.summary).toEqual({ modules: 4, edges: 5, allowed: 2, violations: 2, unclassified: 1, observed: 0 });
    expect(result.roles).toEqual([
      { module: 'cli', role: 'interface', source: 'declared' },
      { module: 'core', role: 'foundation', source: 'declared' },
      { module: 'engine', role: 'orchestration', source: 'declared' },
      { module: 'extra', role: null, source: 'none' }
    ]);
  });

  it('is not enforced while the declared policyEnforcement is none, and mirrors any other value', () => {
    expect(computeGraphBoundaries(layered, { declared }).enforced).toBe(false);

    const enforcedRules = parseDeclaredBoundaryRules(indexWith(layeredRoles, { policyEnforcement: 'blocking' }));
    const enforced = computeGraphBoundaries(layered, { declared: enforcedRules });
    expect(enforced.enforced).toBe(true);
    expect(enforced.rules.policyEnforcement).toBe('blocking');
  });

  it('treats a role missing from the matrix as unclassified instead of guessing', () => {
    const rules = parseDeclaredBoundaryRules(indexWith([...layeredRoles, { workspace: 'extra', inferredRole: 'experimental' }]));
    const edge = computeGraphBoundaries(layered, { declared: rules }).observations.find((entry) => entry.from === 'extra');
    expect(edge).toEqual({ from: 'extra', to: 'core', fromRole: 'experimental', toRole: 'foundation', status: 'unclassified' });
  });

  it('bounds both lists, keeps totals, and is independent of input order', () => {
    const result = computeGraphBoundaries(layered, { declared, limit: 1 });
    expect(result.violations).toHaveLength(1);
    expect(result.observations).toHaveLength(1);
    expect(result.totals).toEqual({ violations: 2, observations: 5 });
    expect(result.truncated).toBe(true);

    const reordered = graphOf([
      { name: 'extra', dependencies: ['core'] },
      { name: 'engine', dependencies: ['core'] },
      { name: 'core', dependencies: ['cli'] },
      { name: 'cli', dependencies: ['engine', 'core'] }
    ]);
    expect(computeGraphBoundaries(reordered, { declared })).toEqual(computeGraphBoundaries(layered, { declared }));
  });
});

describe('computeGraphBoundaries without declared rules (observation only)', () => {
  it('judges nothing: no violations, enforced false, roles inferred from graph topology', () => {
    const result = computeGraphBoundaries(layered);

    expect(result.enforced).toBe(false);
    expect(result.rules).toEqual({
      declared: false,
      source: 'none',
      reason: 'no declared rules were supplied',
      classifierVersion: null,
      policyEnforcement: null,
      dependencyMatrix: null
    });
    expect(result.violations).toEqual([]);
    expect(result.observations.every((edge) => edge.status === 'observed')).toBe(true);
    expect(result.observations).toHaveLength(5);
    expect(result.summary).toEqual({ modules: 4, edges: 5, allowed: 0, violations: 0, unclassified: 0, observed: 5 });
    expect(result.roles.every((role) => role.source === 'graph-inferred')).toBe(true);
    // `extra` only depends on others: topology says interface.
    expect(result.roles.find((role) => role.module === 'extra')?.role).toBe('interface');
  });

  it('orders modules and edges by code unit, not by locale', () => {
    // localeCompare would give _internal, alpha, Zeta; code-unit order is Zeta, _internal, alpha.
    const mixed = graphOf([
      { name: 'alpha', dependencies: ['Zeta', '_internal'] },
      { name: '_internal', dependencies: [] },
      { name: 'Zeta', dependencies: [] }
    ]);
    const result = computeGraphBoundaries(mixed);

    expect(result.roles.map((role) => role.module)).toEqual(['Zeta', '_internal', 'alpha']);
    expect(result.observations.map((edge) => `${edge.from}>${edge.to}`)).toEqual(['alpha>Zeta', 'alpha>_internal']);
  });

  it('skips self-dependencies and tolerates an empty graph', () => {
    expect(computeGraphBoundaries(graphOf([{ name: 'solo', dependencies: ['solo'] }])).observations).toEqual([]);
    expect(computeGraphBoundaries(graphOf([])).summary.edges).toBe(0);
  });

  it('rejects an invalid graph and an invalid limit', () => {
    expect(() => computeGraphBoundaries({} as never)).toThrow(/playbook graph boundaries: invalid repository graph/);
    expect(() => computeGraphBoundaries(layered, { limit: 0 })).toThrow(/playbook graph boundaries: invalid --limit/);
  });
});

describe('parseDeclaredBoundaryRules', () => {
  it('returns a reason instead of rules for anything short of a matrix plus roles', () => {
    const reasonOf = (index: unknown): string => {
      const lookup = parseDeclaredBoundaryRules(index);
      expect(lookup.rules).toBeNull();
      return (lookup as { reason: string }).reason;
    };

    expect(reasonOf({})).toMatch(/no architectureRoleInference block/);
    expect(reasonOf(null)).toMatch(/no architectureRoleInference block/);
    expect(reasonOf(indexWith(layeredRoles, { dependencyMatrix: undefined }))).toMatch(/no dependency-direction matrix/);
    expect(reasonOf(indexWith(layeredRoles, { dependencyMatrix: {} }))).toMatch(/empty dependency-direction matrix/);
    expect(reasonOf(indexWith(layeredRoles, { dependencyMatrix: { interface: 'core' } }))).toMatch(/invalid for role "interface"/);
    // A non-workspace repository: the indexer writes the matrix but no role nodes.
    expect(reasonOf(indexWith([]))).toMatch(/declares no module roles/);
  });
});

describe('readGraphBoundaries', () => {
  const repoWith = (graph: unknown, index?: string): string => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-graph-boundaries-'));
    roots.push(repo);
    fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
    if (graph !== undefined) fs.writeFileSync(path.join(repo, REPOSITORY_GRAPH_RELATIVE_PATH), JSON.stringify(graph));
    if (index !== undefined) fs.writeFileSync(path.join(repo, '.playbook', 'repo-index.json'), index);
    return repo;
  };

  it('uses the declared rules from the repository index', () => {
    const report = readGraphBoundaries(repoWith(layered, JSON.stringify(indexWith(layeredRoles))));
    expect(report.rules.declared).toBe(true);
    expect(report.summary.violations).toBe(2);
    expect(report.graph).toEqual({ schemaVersion: '1.1', generatedAt: '2026-01-01T00:00:00.000Z' });
  });

  it('falls back to observation only when the index is absent, broken, or declares no roles', () => {
    expect(readGraphBoundaries(repoWith(layered)).rules).toMatchObject({ declared: false, reason: 'no repository index at .playbook/repo-index.json' });
    expect(readGraphBoundaries(repoWith(layered, '{broken')).rules.reason).toMatch(/not valid JSON/);
    expect(readGraphBoundaries(repoWith(layered, JSON.stringify(indexWith([])))).rules.reason).toMatch(/declares no module roles/);
    expect(readDeclaredBoundaryRules(repoWith(layered, JSON.stringify(indexWith([])))).rules).toBeNull();
  });

  it('fails closed when the graph is missing or invalid, even with a valid index', () => {
    const index = JSON.stringify(indexWith(layeredRoles));
    expect(() => readGraphBoundaries(repoWith(undefined, index))).toThrow(/missing repository graph.*playbook index/);
    expect(() => readGraphBoundaries(repoWith({ ...layered, kind: 'nope' }, index))).toThrow(/invalid graph artifact kind/);
  });
});
