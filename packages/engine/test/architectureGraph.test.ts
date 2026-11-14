import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ARCH_GRAPH_RELATIVE_PATH,
  buildArchitectureGraph,
  readArchitectureGraph,
  readArchitectureNeighborhood,
  validateArchitectureGraph,
  writeArchitectureGraph
} from '../src/graph/architectureGraph.js';
import { REPOSITORY_GRAPH_RELATIVE_PATH, generateRepositoryGraph, readRepositoryGraph } from '../src/graph/repoGraph.js';
import { explainTarget } from '../src/explain/explainEngine.js';
import { queryRepositoryIndex } from '../src/query/repoQuery.js';

const roots: string[] = [];

const write = (root: string, relative: string, content: string): void => {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};

const makeRepo = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-arch-graph-'));
  roots.push(root);
  const index = {
    schemaVersion: '1.0',
    framework: 'node',
    language: 'typescript',
    architecture: 'modular-monolith',
    modules: [
      { name: 'auth', dependencies: [] },
      { name: 'workouts', dependencies: ['auth'] }
    ],
    dependencies: [],
    workspace: [
      { name: 'cli', path: 'packages/cli', role: 'cli', dependsOn: ['engine'] },
      { name: 'engine', path: 'packages/engine', role: 'engine', dependsOn: [] }
    ],
    tests: [],
    configs: [{ name: 'command-inventory', path: 'package.json#scripts', present: true, commands: ['build', 'test'] }],
    database: 'none',
    rules: ['PB001'],
    architectureRoleInference: { classificationMode: 'observation-only', classifierVersion: 'role-heuristic-v1', policyEnforcement: 'none', dependencyMatrix: {}, nodes: [], dependencyObservations: [] }
  };
  write(root, '.playbook/repo-index.json', `${JSON.stringify(index, null, 2)}\n`);
  write(root, REPOSITORY_GRAPH_RELATIVE_PATH, `${JSON.stringify(generateRepositoryGraph(index as never, new Date('2026-01-01T00:00:00.000Z')), null, 2)}\n`);
  write(root, 'docs/contracts/command-truth.json', JSON.stringify({ commandTruth: [{ name: 'graph' }, { name: 'index' }] }));
  write(root, 'docs/contracts/SAMPLE_CONTRACT.md', '# Sample\n');
  write(root, 'docs/commands/graph.md', '# graph\r\n');
  write(root, 'packages/cli/src/commands/graph.ts', 'export {};\n');
  write(root, 'packages/cli/src/commands/graph.test.ts', 'export {};\n');
  write(root, 'src/auth/auth.test.ts', 'export {};\n');
  write(root, 'node_modules/ignored/x.test.ts', 'export {};\n');
  return root;
};

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('architecture graph v2 builder', () => {
  it('derives semantic nodes and edges from the repo graph, index and working tree', () => {
    const root = makeRepo();
    const graph = buildArchitectureGraph(root, readRepositoryGraph(root));
    const ids = graph.nodes.map((node) => node.id);

    expect(ids).toEqual(expect.arrayContaining(['repository:root', 'module:auth', 'module:workouts', 'package:cli', 'package:engine', 'command:graph', 'script:build', 'contract:docs/contracts/SAMPLE_CONTRACT.md', 'doc:docs/commands/graph.md', 'file:packages/cli/src/commands/graph.ts', 'test:packages/cli/src/commands/graph.test.ts']));
    expect(ids.some((id) => id.includes('node_modules'))).toBe(false);
    const has = (kind: string, from: string, to: string) => graph.edges.some((edge) => edge.kind === kind && edge.from === from && edge.to === to);
    expect(has('depends_on', 'module:workouts', 'module:auth')).toBe(true);
    expect(has('depends_on', 'package:cli', 'package:engine')).toBe(true);
    expect(has('implements', 'file:packages/cli/src/commands/graph.ts', 'command:graph')).toBe(true);
    expect(has('documents', 'doc:docs/commands/graph.md', 'command:graph')).toBe(true);
    expect(has('tests', 'test:packages/cli/src/commands/graph.test.ts', 'file:packages/cli/src/commands/graph.ts')).toBe(true);
    expect(has('tests', 'test:src/auth/auth.test.ts', 'module:auth')).toBe(true);
    expect(has('owns', 'package:cli', 'file:packages/cli/src/commands/graph.ts')).toBe(true);
    for (const edge of graph.edges) {
      expect(ids).toContain(edge.from);
      expect(ids).toContain(edge.to);
    }
    expect(validateArchitectureGraph(graph)).toBeUndefined();
  });

  it('is deterministic: identical bytes across rebuilds and across CRLF versus LF checkouts, with no timestamps', () => {
    const root = makeRepo();
    const first = writeArchitectureGraph(root);
    const bytes = fs.readFileSync(path.join(root, ARCH_GRAPH_RELATIVE_PATH), 'utf8');
    fs.rmSync(path.join(root, ARCH_GRAPH_RELATIVE_PATH));
    writeArchitectureGraph(root);
    expect(fs.readFileSync(path.join(root, ARCH_GRAPH_RELATIVE_PATH), 'utf8')).toBe(bytes);
    expect(first.status).toBe('created');
    expect(bytes).not.toMatch(/generatedAt|\d{4}-\d{2}-\d{2}T/);

    write(root, 'docs/commands/graph.md', '# graph\n');
    fs.rmSync(path.join(root, ARCH_GRAPH_RELATIVE_PATH));
    writeArchitectureGraph(root);
    expect(fs.readFileSync(path.join(root, ARCH_GRAPH_RELATIVE_PATH), 'utf8')).toBe(bytes);
  });

  it('invalidates by content hash: unchanged inputs skip the write, a changed file rewrites', () => {
    const root = makeRepo();
    expect(writeArchitectureGraph(root).status).toBe('created');
    const target = path.join(root, ARCH_GRAPH_RELATIVE_PATH);
    const mtime = fs.statSync(target).mtimeMs;
    expect(writeArchitectureGraph(root).status).toBe('unchanged');
    expect(fs.statSync(target).mtimeMs).toBe(mtime);

    write(root, 'docs/contracts/SAMPLE_CONTRACT.md', '# Sample changed\n');
    expect(writeArchitectureGraph(root).status).toBe('updated');
    expect(writeArchitectureGraph(root).status).toBe('unchanged');
  });

  it('fails closed without the repo graph or index', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-arch-graph-empty-'));
    roots.push(root);
    expect(() => writeArchitectureGraph(root)).toThrow(/playbook graph build: missing repository graph/);
    const repo = makeRepo();
    fs.rmSync(path.join(repo, '.playbook/repo-index.json'));
    expect(() => writeArchitectureGraph(repo)).toThrow(/missing repository index/);
  });
});

describe('architecture graph v2 readers and fallback', () => {
  it('explain and query add semanticNeighborhood only when a valid graph exists', () => {
    const root = makeRepo();
    const beforeExplain = JSON.parse(JSON.stringify(explainTarget(root, 'auth')));
    const beforeQuery = JSON.parse(JSON.stringify(queryRepositoryIndex(root, 'architecture')));
    expect(beforeExplain.semanticNeighborhood).toBeUndefined();
    expect(beforeQuery.semanticNeighborhood).toBeUndefined();

    writeArchitectureGraph(root);
    const withGraph = JSON.parse(JSON.stringify(explainTarget(root, 'auth')));
    expect(withGraph.semanticNeighborhood.node.id).toBe('module:auth');
    expect(withGraph.semanticNeighborhood.incoming).toEqual(expect.arrayContaining([{ kind: 'depends_on', source: 'module:workouts' }]));
    delete withGraph.semanticNeighborhood;
    expect(withGraph).toEqual(beforeExplain);
    const queryWith = JSON.parse(JSON.stringify(queryRepositoryIndex(root, 'architecture')));
    expect(queryWith.semanticNeighborhood.node.id).toBe('repository:root');
    delete queryWith.semanticNeighborhood;
    expect(queryWith).toEqual(beforeQuery);
  });

  it.each([
    ['not json', '{nope'],
    ['wrong kind', JSON.stringify({ kind: 'other', schemaVersion: '2.0', nodes: [], edges: [], inputs: { digest: 'x' } })],
    ['unsupported version', JSON.stringify({ kind: 'playbook-arch-graph', schemaVersion: '9.9', nodes: [], edges: [], inputs: { digest: 'x' } })],
    ['dangling edge', JSON.stringify({ kind: 'playbook-arch-graph', schemaVersion: '2.0', nodes: [], edges: [{ kind: 'owns', from: 'a', to: 'b' }], inputs: { digest: 'x' } })]
  ])('falls back unchanged for an invalid graph (%s)', (_label, content) => {
    const root = makeRepo();
    const beforeExplain = JSON.parse(JSON.stringify(explainTarget(root, 'auth')));
    const beforeQuery = JSON.parse(JSON.stringify(queryRepositoryIndex(root, 'architecture')));
    write(root, ARCH_GRAPH_RELATIVE_PATH, content);

    expect(readArchitectureGraph(root).ok).toBe(false);
    expect(readArchitectureNeighborhood(root, 'module:auth')).toBeUndefined();
    expect(JSON.parse(JSON.stringify(explainTarget(root, 'auth')))).toEqual(beforeExplain);
    expect(JSON.parse(JSON.stringify(queryRepositoryIndex(root, 'architecture')))).toEqual(beforeQuery);
  });

  it('missing graph reports reason "missing" and never throws', () => {
    const root = makeRepo();
    expect(readArchitectureGraph(root)).toEqual({ ok: false, reason: 'missing' });
    expect(readArchitectureNeighborhood(root, 'module:auth')).toBeUndefined();
  });
});
