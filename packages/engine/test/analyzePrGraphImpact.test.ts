import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CHANGED_FILES_GRAPH_IMPACT_LIMIT,
  computeChangedFilesGraphImpact,
  readChangedFilesGraphImpact
} from '../src/graph/graphImpact.js';
import { REPOSITORY_GRAPH_RELATIVE_PATH, generateRepositoryGraph } from '../src/graph/repoGraph.js';
import type { RepositoryIndex } from '../src/indexer/repoIndexer.js';
import { analyzePullRequest } from '../src/pr/analyzePr.js';

const indexOf = (modules: Array<{ name: string; dependencies: string[] }>): RepositoryIndex => ({
  schemaVersion: '1.0',
  framework: 'node',
  language: 'typescript',
  architecture: 'modular-monolith',
  modules,
  database: 'none',
  rules: ['PB001']
});

const graphOf = (modules: Array<{ name: string; dependencies: string[] }>) =>
  generateRepositoryGraph(indexOf(modules), new Date('2026-01-01T00:00:00.000Z'));

// workouts -> billing -> auth; reports -> auth
const MODULES = [
  { name: 'auth', dependencies: [] },
  { name: 'billing', dependencies: ['auth'] },
  { name: 'reports', dependencies: ['auth'] },
  { name: 'workouts', dependencies: ['billing'] }
];
const graph = graphOf(MODULES);

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('computeChangedFilesGraphImpact', () => {
  it('maps changed files to owning modules and their transitive dependents with depth', () => {
    const result = computeChangedFilesGraphImpact(graph, ['src/auth/session.ts', 'src/auth/token.ts', 'src/workouts/index.ts', 'README.md']);

    expect(result).toEqual({
      available: true,
      schemaVersion: '1.0',
      graphSchemaVersion: '1.1',
      limit: CHANGED_FILES_GRAPH_IMPACT_LIMIT,
      truncated: false,
      totals: { changedModules: 2, affectedModules: 4, unmappedFiles: 1 },
      changedModules: [
        {
          module: 'auth',
          changedFileCount: 2,
          totalDependents: 3,
          dependents: [
            { module: 'billing', depth: 1 },
            { module: 'reports', depth: 1 },
            { module: 'workouts', depth: 2 }
          ]
        },
        { module: 'workouts', changedFileCount: 1, totalDependents: 0, dependents: [] }
      ],
      affectedModules: ['auth', 'billing', 'reports', 'workouts']
    });
  });

  it('is independent of changed-file order and duplicate entries', () => {
    const forward = computeChangedFilesGraphImpact(graph, ['src/auth/a.ts', 'src/billing/b.ts']);
    const shuffled = computeChangedFilesGraphImpact(graph, ['src/billing/b.ts', 'src/auth/a.ts', 'src/auth/a.ts']);
    expect(shuffled).toEqual(forward);
  });

  it('bounds every list and reports the full counts', () => {
    const result = computeChangedFilesGraphImpact(graph, ['src/auth/a.ts', 'src/billing/b.ts'], { limit: 1 });
    if (!result.available) throw new Error('expected an available result');

    expect(result.truncated).toBe(true);
    expect(result.changedModules).toHaveLength(1);
    expect(result.changedModules[0]).toMatchObject({ module: 'auth', totalDependents: 3, dependents: [{ module: 'billing', depth: 1 }] });
    expect(result.affectedModules).toEqual(['auth']);
    expect(result.totals).toEqual({ changedModules: 2, affectedModules: 4, unmappedFiles: 0 });
  });

  it('never treats a bare file name as a module name and uses workspace roots when supplied', () => {
    // A root-level file called "auth" is not inside src/auth.
    const unmapped = computeChangedFilesGraphImpact(graph, ['auth']);
    expect(unmapped).toMatchObject({ available: true, totals: { changedModules: 0, affectedModules: 0, unmappedFiles: 1 } });

    const workspaceGraph = graphOf([
      { name: '@scope/cli', dependencies: ['@scope/engine'] },
      { name: '@scope/engine', dependencies: [] }
    ]);
    const mapped = computeChangedFilesGraphImpact(workspaceGraph, ['packages/engine/src/x.ts'], {
      moduleRoots: { '@scope/cli': 'packages/cli', '@scope/engine': 'packages/engine' }
    });
    expect(mapped).toMatchObject({ changedModules: [{ module: '@scope/engine', dependents: [{ module: '@scope/cli', depth: 1 }] }] });
  });
});

describe('readChangedFilesGraphImpact', () => {
  it('reports available:false with the reason instead of throwing when the graph is missing or invalid', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-changed-graph-impact-'));
    roots.push(repo);

    expect(readChangedFilesGraphImpact(repo, ['src/auth/a.ts'])).toEqual({
      available: false,
      reason: 'playbook graph: missing repository graph at .playbook/repo-graph.json. Run "playbook index" first.'
    });

    fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
    fs.writeFileSync(path.join(repo, REPOSITORY_GRAPH_RELATIVE_PATH), JSON.stringify({ ...graph, schemaVersion: '0.9' }));
    const invalid = readChangedFilesGraphImpact(repo, ['src/auth/a.ts']);
    expect(invalid.available).toBe(false);
    expect((invalid as { reason: string }).reason).toMatch(/unsupported repository graph schemaVersion/);
  });
});

describe('analyze-pr graphImpact section', () => {
  const runGit = (root: string, ...args: string[]): void => {
    execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  };

  const createRepo = (withGraph: boolean): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-analyze-pr-graph-'));
    roots.push(root);
    for (const moduleEntry of MODULES) {
      fs.mkdirSync(path.join(root, 'src', moduleEntry.name), { recursive: true });
      fs.writeFileSync(path.join(root, 'src', moduleEntry.name, 'index.ts'), `export const ${moduleEntry.name} = 1;\n`);
    }
    fs.mkdirSync(path.join(root, '.playbook'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.playbook', 'repo-index.json'),
      JSON.stringify({ ...indexOf(MODULES), dependencies: [], workspace: [], tests: [], configs: [] }, null, 2)
    );
    if (withGraph) {
      fs.writeFileSync(path.join(root, REPOSITORY_GRAPH_RELATIVE_PATH), JSON.stringify(graph, null, 2));
    }
    runGit(root, 'init');
    runGit(root, 'config', 'user.email', 'playbook@example.com');
    runGit(root, 'config', 'user.name', 'Playbook Test');
    runGit(root, 'add', '.');
    runGit(root, 'commit', '-m', 'initial');
    fs.writeFileSync(path.join(root, 'src', 'auth', 'index.ts'), 'export const auth = 2;\n');
    return root;
  };

  const LEGACY_KEYS = [
    'schemaVersion',
    'command',
    'baseRef',
    'changedFiles',
    'summary',
    'affectedModules',
    'impact',
    'architecture',
    'risk',
    'docs',
    'rules',
    'moduleOwners',
    'findings',
    'reviewGuidance',
    'contractSurface',
    'preventionGuidance',
    'context'
  ];

  it('adds graph-derived impact after the existing fields when a valid graph exists', () => {
    const analysis = analyzePullRequest(createRepo(true), { baseRef: 'HEAD' });

    // Existing fields keep their order; graphImpact is appended.
    expect(Object.keys(analysis)).toEqual([...LEGACY_KEYS, 'graphImpact']);
    expect(analysis.graphImpact).toEqual({
      available: true,
      schemaVersion: '1.0',
      graphSchemaVersion: '1.1',
      limit: CHANGED_FILES_GRAPH_IMPACT_LIMIT,
      truncated: false,
      totals: { changedModules: 1, affectedModules: 4, unmappedFiles: 0 },
      changedModules: [
        {
          module: 'auth',
          changedFileCount: 1,
          totalDependents: 3,
          dependents: [
            { module: 'billing', depth: 1 },
            { module: 'reports', depth: 1 },
            { module: 'workouts', depth: 2 }
          ]
        }
      ],
      affectedModules: ['auth', 'billing', 'reports', 'workouts']
    });
    // The index-derived impact is unchanged and agrees with the graph for this fixture.
    expect(analysis.impact).toEqual([
      { module: 'auth', dependencies: [], directDependents: ['billing', 'reports'], dependents: ['billing', 'reports', 'workouts'] }
    ]);
    expect(analysis.context.sources.map((source) => source.type)).not.toContain('repo-graph');
  });

  it('reports graphImpact unavailable, and changes nothing else, when the graph is missing', () => {
    const withGraph = analyzePullRequest(createRepo(true), { baseRef: 'HEAD' });
    const withoutGraph = analyzePullRequest(createRepo(false), { baseRef: 'HEAD' });

    expect(withoutGraph.graphImpact).toEqual({
      available: false,
      reason: 'playbook graph: missing repository graph at .playbook/repo-graph.json. Run "playbook index" first.'
    });
    const withoutSection = (analysis: typeof withGraph): Record<string, unknown> => {
      const copy: Record<string, unknown> = { ...analysis };
      delete copy.graphImpact;
      return copy;
    };
    expect(withoutSection(withoutGraph)).toEqual(withoutSection(withGraph));
  });
});
