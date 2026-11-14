import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeGraphBoundaries, parseDeclaredBoundaryRules } from '../../packages/engine/src/graph/graphBoundaries.js';
import {
  computeChangedFilesGraphImpact,
  computeGraphImpact,
  GRAPH_IMPACT_SCHEMA_VERSION
} from '../../packages/engine/src/graph/graphImpact.js';
import { computeGraphRisks } from '../../packages/engine/src/graph/graphRisks.js';
import { getCliSchema } from '../../packages/engine/src/schema/cliSchemas.js';
// The same validator `pnpm contracts:check` uses for the committed command snapshots.
import { validateAgainstSchema } from '../../scripts/contract-snapshot-lib.mjs';
import {
  REPOSITORY_GRAPH_RELATIVE_PATH,
  REPOSITORY_GRAPH_SCHEMA_VERSION,
  generateRepositoryGraph,
  readRepositoryGraph,
  summarizeRepositoryGraph
} from '../../packages/engine/src/graph/repoGraph.js';
import type { RepositoryIndex } from '../../packages/engine/src/indexer/repoIndexer.js';

// Compatibility pin for PB-V07-ARCH-INTELLIGENCE-GRAPH-001 (first slice: repo-graph v1.1 surface and contract docs;
// second slice: `graph impact`; third slice: `graph boundaries`, `graph risks`, analyze-pr `graphImpact`, output schemas).
// It intentionally does not test the deferred semantic-graph pieces, which do not exist.
// Run in CI through packages/engine/test/architectureGraphContract.test.ts.

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const readRepoFile = (relativePath: string): string => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const CONTRACT_DOC = 'docs/contracts/ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md';
const ARCHITECTURE_DOC = 'docs/architecture/ARCHITECTURE_INTELLIGENCE_GRAPH.md';
const REPO_GRAPH_CONTRACT = 'docs/contracts/repository-graph-contract.md';

const DOCUMENTED_NODE_KINDS = ['module', 'repository', 'rule'];
const DOCUMENTED_EDGE_KINDS = ['contains', 'depends_on', 'governed_by'];
const DOCUMENTED_ROLES = ['adapter', 'foundation', 'interface', 'orchestration'];

const sampleIndex: RepositoryIndex = {
  schemaVersion: '1.0',
  framework: 'node',
  language: 'typescript',
  architecture: 'modular-monolith',
  modules: [
    { name: 'auth', dependencies: [] },
    { name: 'workouts', dependencies: ['auth'] }
  ],
  database: 'none',
  rules: ['PB001']
};

const parseDocumentedKinds = (doc: string, label: 'Node kinds' | 'Edge kinds'): string[] => {
  const line = doc.split(/\r?\n/).find((entry) => entry.startsWith(`- ${label}:`));
  expect(line, `contract doc must list "${label}"`).toBeDefined();
  return Array.from((line ?? '').matchAll(/`([^`]+)`/g))
    .map((match) => match[1])
    .sort();
};

describe('architecture intelligence graph contract (repo-graph v1.1 pin; impact, boundaries, risks and analyze-pr consumption shipped)', () => {
  it('ships the contract and architecture docs and cross-references the repo-graph contract', () => {
    for (const docPath of [CONTRACT_DOC, ARCHITECTURE_DOC, REPO_GRAPH_CONTRACT]) {
      expect(fs.existsSync(path.join(repoRoot, docPath)), `${docPath} must exist`).toBe(true);
    }

    const contractDoc = readRepoFile(CONTRACT_DOC);
    const architectureDoc = readRepoFile(ARCHITECTURE_DOC);

    expect(contractDoc).toContain('repository-graph-contract.md');
    expect(contractDoc).toContain('ARCHITECTURE_INTELLIGENCE_GRAPH.md');
    expect(architectureDoc).toContain('repository-graph-contract.md');
    expect(architectureDoc).toContain('ARCHITECTURE_INTELLIGENCE_GRAPH_CONTRACT.md');
  });

  it('keeps the status marker and the shipped / unshipped lists honest', () => {
    const contractDoc = readRepoFile(CONTRACT_DOC);

    expect(contractDoc).toMatch(/Status: \*\*third slice/);
    const deferredStart = contractDoc.indexOf('Not shipped, and deferred beyond this card');
    const deferredEnd = contractDoc.indexOf('Honest limits of what did ship');
    expect(deferredStart).toBeGreaterThan(0);
    expect(deferredEnd).toBeGreaterThan(deferredStart);
    const deferredSection = contractDoc.slice(deferredStart, deferredEnd);
    const shippedSection = contractDoc.slice(0, deferredStart);

    // Still unshipped, and explicitly deferred beyond this card.
    for (const deferred of ['semantic node/edge layer', '.playbook/arch-graph.v2.json', 'impact index', 'Incremental (file-hash plus SCM-diff) graph invalidation']) {
      expect(deferredSection, `deferred piece "${deferred}" must be listed as not shipped`).toContain(deferred);
    }
    // Shipped: these must be described as shipped and must not appear in the deferred list.
    for (const shipped of ['graph impact', 'graph boundaries', 'graph risks']) {
      expect(shippedSection, `shipped piece "${shipped}" must be described as shipped`).toContain(shipped);
      expect(deferredSection, `shipped piece "${shipped}" must not be listed as deferred`).not.toContain(shipped);
    }
    expect(shippedSection).toContain('`analyze-pr` consumes the graph');
    expect(deferredSection).not.toContain('analyze-pr');

    // What the shipped views still do not do must stay stated, not implied.
    const limitsSection = contractDoc.slice(deferredEnd, contractDoc.indexOf('## `graph impact`'));
    expect(limitsSection).toContain('`explain` and `query` are unchanged');
    expect(limitsSection).toContain('It is not met for `explain` and `query`');
    expect(limitsSection).toContain('nothing is enforced');
    // Shipped-state guard: if one of these appears, the contract doc's Status section must be updated together with this test.
    expect(fs.existsSync(path.join(repoRoot, '.playbook', 'arch-graph.v2.json'))).toBe(false);
  });

  it('pins the schema version and artifact path documented in the repo-graph contract', () => {
    const repoGraphContract = readRepoFile(REPO_GRAPH_CONTRACT);

    expect(REPOSITORY_GRAPH_SCHEMA_VERSION).toBe('1.1');
    expect(REPOSITORY_GRAPH_RELATIVE_PATH).toBe('.playbook/repo-graph.json');
    expect(repoGraphContract).toContain('`playbook-repo-graph`');
    expect(repoGraphContract).toContain(`**Current schema version**: \`${REPOSITORY_GRAPH_SCHEMA_VERSION}\``);
    expect(repoGraphContract).toContain(REPOSITORY_GRAPH_RELATIVE_PATH);
  });

  it('keeps node and edge kind sets exactly equal to the documented sets', () => {
    const contractDoc = readRepoFile(CONTRACT_DOC);
    expect(parseDocumentedKinds(contractDoc, 'Node kinds')).toEqual(DOCUMENTED_NODE_KINDS);
    expect(parseDocumentedKinds(contractDoc, 'Edge kinds')).toEqual(DOCUMENTED_EDGE_KINDS);

    const graph = generateRepositoryGraph(sampleIndex, new Date('2026-01-01T00:00:00.000Z'));
    expect(Array.from(new Set(graph.nodes.map((node) => node.kind))).sort()).toEqual(DOCUMENTED_NODE_KINDS);
    expect(Array.from(new Set(graph.edges.map((edge) => edge.kind))).sort()).toEqual(DOCUMENTED_EDGE_KINDS);
    expect(Object.keys(graph.stats.nodeKinds).sort()).toEqual(DOCUMENTED_NODE_KINDS);
    expect(Object.keys(graph.stats.edgeKinds).sort()).toEqual(DOCUMENTED_EDGE_KINDS);
  });

  it('generates deterministic, sorted output with the required top-level keys', () => {
    const first = generateRepositoryGraph(sampleIndex, new Date('2026-01-01T00:00:00.000Z'));
    const second = generateRepositoryGraph(
      { ...sampleIndex, modules: [...sampleIndex.modules].reverse() },
      new Date('2026-01-01T00:00:00.000Z')
    );

    expect(second).toEqual(first);
    expect(Object.keys(first)).toEqual(expect.arrayContaining(['schemaVersion', 'kind', 'nodes', 'edges', 'stats']));
    expect(first.kind).toBe('playbook-repo-graph');
    expect(first.stats.nodeCount).toBe(first.nodes.length);
    expect(first.stats.edgeCount).toBe(first.edges.length);
  });

  it('still validates the committed graph command snapshot against the v1.1 contract', () => {
    const snapshot = JSON.parse(readRepoFile('tests/contracts/graph.snapshot.json')) as {
      schemaVersion: string;
      command: string;
      graph: {
        schemaVersion: string;
        kind: string;
        stats: { nodeCount: number; edgeCount: number; nodeKinds: Record<string, number>; edgeKinds: Record<string, number> };
        nodeKinds: string[];
        edgeKinds: string[];
        architectureRoleInference: { schemaVersion: string; roles: Array<{ role: string }> };
      };
    };

    expect(snapshot.command).toBe('graph');
    expect(snapshot.graph.schemaVersion).toBe(REPOSITORY_GRAPH_SCHEMA_VERSION);
    expect(snapshot.graph.kind).toBe('playbook-repo-graph');
    for (const kind of snapshot.graph.nodeKinds) {
      expect(DOCUMENTED_NODE_KINDS).toContain(kind);
    }
    for (const kind of snapshot.graph.edgeKinds) {
      expect(DOCUMENTED_EDGE_KINDS).toContain(kind);
    }
    expect(Object.values(snapshot.graph.stats.nodeKinds).reduce((sum, count) => sum + count, 0)).toBe(snapshot.graph.stats.nodeCount);
    expect(Object.values(snapshot.graph.stats.edgeKinds).reduce((sum, count) => sum + count, 0)).toBe(snapshot.graph.stats.edgeCount);
    expect(snapshot.graph.architectureRoleInference.schemaVersion).toBe('1.0');
    for (const record of snapshot.graph.architectureRoleInference.roles) {
      expect(DOCUMENTED_ROLES).toContain(record.role);
    }
  });

  it('summarizes a generated graph with role inference in the documented shape', () => {
    const summary = summarizeRepositoryGraph(generateRepositoryGraph(sampleIndex, new Date('2026-01-01T00:00:00.000Z')));

    expect(summary.schemaVersion).toBe('1.1');
    expect(summary.nodeKinds).toEqual(DOCUMENTED_NODE_KINDS);
    expect(summary.edgeKinds).toEqual(DOCUMENTED_EDGE_KINDS);
    expect(summary.architectureRoleInference.roles).toEqual([
      { module: 'auth', role: 'foundation', evidence: { incomingDependencies: 1, outgoingDependencies: 0, dependencyDirection: 'inbound' } },
      { module: 'workouts', role: 'interface', evidence: { incomingDependencies: 0, outgoingDependencies: 1, dependencyDirection: 'outbound' } }
    ]);
  });

  it('pins the graph impact result contract on a sample graph', () => {
    const graph = generateRepositoryGraph(sampleIndex, new Date('2026-01-01T00:00:00.000Z'));
    const result = computeGraphImpact(graph, 'auth', { direction: 'both' });

    expect(GRAPH_IMPACT_SCHEMA_VERSION).toBe('1.0');
    expect(Object.keys(result).sort()).toEqual(
      ['dependencies', 'dependents', 'depthLimit', 'direction', 'limit', 'schemaVersion', 'target', 'totals', 'truncated']
    );
    expect(result.dependents).toEqual([{ module: 'workouts', depth: 1, edgeKinds: ['depends_on'], path: ['auth', 'workouts'] }]);
    expect(result.dependencies).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it('validates the impact, boundaries and risks outputs against the registered graph schema', () => {
    const graph = generateRepositoryGraph(sampleIndex, new Date('2026-01-01T00:00:00.000Z'));
    const graphRef = { schemaVersion: graph.schemaVersion, generatedAt: graph.generatedAt };
    const schema = getCliSchema('graph');
    const envelope = (subcommand: string, result: { schemaVersion: string }) => {
      const { schemaVersion, ...rest } = result;
      return { schemaVersion, command: 'graph', subcommand, ...rest, graph: graphRef };
    };
    const declared = parseDeclaredBoundaryRules({
      architectureRoleInference: {
        classifierVersion: 'role-heuristic-v1',
        policyEnforcement: 'none',
        dependencyMatrix: { interface: ['foundation'], foundation: ['foundation'] },
        nodes: [
          { workspace: 'auth', inferredRole: 'foundation' },
          { workspace: 'workouts', inferredRole: 'interface' }
        ]
      }
    });

    const payloads = [
      envelope('impact', computeGraphImpact(graph, 'auth', { direction: 'both' })),
      envelope('boundaries', computeGraphBoundaries(graph, { declared })),
      envelope('boundaries', computeGraphBoundaries(graph)),
      envelope('risks', computeGraphRisks(graph)),
      { schemaVersion: '1.0', command: 'graph', subcommand: 'risks', error: 'playbook graph risks: missing repository graph' }
    ];
    for (const payload of payloads) {
      expect(validateAgainstSchema(payload, schema), JSON.stringify(payload).slice(0, 120)).toBe(true);
    }

    // The schema is not vacuous: unknown fields and wrong subcommands are rejected.
    expect(validateAgainstSchema({ ...payloads[3], unexpected: true }, schema)).toBe(false);
    expect(validateAgainstSchema({ ...payloads[3], subcommand: 'hotspots' }, schema)).toBe(false);
  });

  it('validates the analyze-pr graphImpact section against the registered analyze-pr schema', () => {
    const graph = generateRepositoryGraph(sampleIndex, new Date('2026-01-01T00:00:00.000Z'));
    const analyzePrSchema = getCliSchema('analyze-pr') as { oneOf: Array<{ properties?: Record<string, unknown>; required?: string[] }> };
    const success = analyzePrSchema.oneOf.find((candidate) => candidate.properties && 'changedFiles' in candidate.properties);
    const graphImpactSchema = success?.properties?.graphImpact;

    expect(graphImpactSchema, 'analyze-pr schema must declare graphImpact').toBeDefined();
    // Additive: older artifacts without the field still validate.
    expect(success?.required).not.toContain('graphImpact');

    const available = computeChangedFilesGraphImpact(graph, ['src/auth/index.ts', 'README.md']);
    expect(available).toMatchObject({
      available: true,
      changedModules: [{ module: 'auth', changedFileCount: 1, totalDependents: 1, dependents: [{ module: 'workouts', depth: 1 }] }],
      affectedModules: ['auth', 'workouts'],
      totals: { changedModules: 1, affectedModules: 2, unmappedFiles: 1 }
    });
    expect(validateAgainstSchema(available, graphImpactSchema)).toBe(true);
    expect(validateAgainstSchema({ available: false, reason: 'missing graph' }, graphImpactSchema)).toBe(true);
    expect(validateAgainstSchema({ available: false }, graphImpactSchema)).toBe(false);
    expect(validateAgainstSchema({ ...available, extra: 1 }, graphImpactSchema)).toBe(false);
  });

  it('documents the exact-version reader behavior: reads 1.1, rejects other versions until the reader is updated', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-arch-graph-contract-'));
    try {
      const graphPath = path.join(repo, REPOSITORY_GRAPH_RELATIVE_PATH);
      fs.mkdirSync(path.dirname(graphPath), { recursive: true });
      const graph = generateRepositoryGraph(sampleIndex, new Date('2026-01-01T00:00:00.000Z'));

      fs.writeFileSync(graphPath, JSON.stringify(graph), 'utf8');
      expect(readRepositoryGraph(repo)).toEqual(graph);

      fs.writeFileSync(graphPath, JSON.stringify({ ...graph, schemaVersion: '1.2' }), 'utf8');
      expect(() => readRepositoryGraph(repo)).toThrow(/unsupported repository graph schemaVersion "1.2"/);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
