import fs from 'node:fs';
import path from 'node:path';
import {
  readRepositoryGraph,
  type RepositoryGraph,
  type RepositoryGraphEdgeKind
} from './repoGraph.js';

/**
 * Graph-backed impact: transitive dependents / dependencies of a module over the
 * `depends_on` edges of `.playbook/repo-graph.json` (schema 1.1). Pure logic lives in
 * `computeGraphImpact`; `readGraphImpact` adds the artifact read and the optional
 * module-root lookup used to resolve file paths.
 *
 * Read-only, deterministic, no heuristics: only edges present in the graph are followed.
 */

export const GRAPH_IMPACT_SCHEMA_VERSION = '1.0' as const;
export const GRAPH_IMPACT_DEFAULT_LIMIT = 200;
export const GRAPH_IMPACT_MAX_LIMIT = 1000;

export type GraphImpactDirection = 'dependents' | 'dependencies' | 'both';

export type GraphImpactEntry = {
  module: string;
  /** Number of `depends_on` hops from the target (1 = direct). */
  depth: number;
  /** Edge kinds along the shortest path, in traversal order. */
  edgeKinds: RepositoryGraphEdgeKind[];
  /** Shortest path in traversal order, starting at the target module and ending at `module`. */
  path: string[];
};

export type GraphImpactTarget = {
  input: string;
  resolvedAs: 'module' | 'file';
  module: string;
  file?: string;
};

export type GraphImpactOptions = {
  direction?: GraphImpactDirection;
  /** Maximum hops. Omit for unlimited. Must be an integer >= 1. */
  depth?: number;
  /** Maximum entries per returned list. Defaults to GRAPH_IMPACT_DEFAULT_LIMIT. */
  limit?: number;
  /** Optional module name to repo-relative directory map (for example from the index workspace) used to resolve file targets. */
  moduleRoots?: Record<string, string>;
};

export type GraphImpactResult = {
  schemaVersion: typeof GRAPH_IMPACT_SCHEMA_VERSION;
  target: GraphImpactTarget;
  direction: GraphImpactDirection;
  depthLimit: number | null;
  limit: number;
  /** True when any returned list was cut at `limit`; see `totals` for the full counts. */
  truncated: boolean;
  /** Entries found per requested direction before truncation. */
  totals: { dependents?: number; dependencies?: number };
  dependents?: GraphImpactEntry[];
  dependencies?: GraphImpactEntry[];
};

export type GraphImpactReport = GraphImpactResult & {
  graph: { schemaVersion: RepositoryGraph['schemaVersion']; generatedAt: string };
};

const IMPACT_EDGE_KINDS: readonly RepositoryGraphEdgeKind[] = ['depends_on'];
const MODULE_PREFIX = 'module:';

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const fail = (message: string): never => {
  throw new Error(`playbook graph impact: ${message}`);
};

const assertGraphShape = (graph: RepositoryGraph): void => {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    fail('invalid repository graph (nodes/edges missing). Run "playbook index" to regenerate .playbook/repo-graph.json.');
  }
};

const normalizeFilePath = (input: string): string =>
  input.trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/+$/, '');

export const resolveGraphImpactTarget = (
  graph: RepositoryGraph,
  input: string,
  moduleRoots: Record<string, string> = {}
): GraphImpactTarget => {
  assertGraphShape(graph);
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return fail('missing target. Pass a module name or a file path inside a module.');
  }

  const moduleNames = graph.nodes
    .filter((node) => node.kind === 'module')
    .map((node) => node.name)
    .sort(compare);

  const named = trimmed.startsWith(MODULE_PREFIX) ? trimmed.slice(MODULE_PREFIX.length) : trimmed;
  const exact = moduleNames.find((name) => name === named);
  if (exact) {
    return { input, resolvedAs: 'module', module: exact };
  }
  const caseInsensitive = moduleNames.filter((name) => name.toLowerCase() === named.toLowerCase());
  if (caseInsensitive.length === 1) {
    return { input, resolvedAs: 'module', module: caseInsensitive[0] };
  }

  const file = normalizeFilePath(trimmed);
  let best: { module: string; root: string } | undefined;
  for (const name of moduleNames) {
    const roots = [`src/${name}`, moduleRoots[name]]
      .filter((root): root is string => typeof root === 'string' && root.length > 0)
      .map(normalizeFilePath);
    for (const root of roots) {
      if (root.length === 0 || (file !== root && !file.startsWith(`${root}/`))) continue;
      if (!best || root.length > best.root.length) {
        best = { module: name, root };
      }
    }
  }
  if (best) {
    return { input, resolvedAs: 'file', module: best.module, file };
  }

  return fail(
    `unknown target "${input}": it is not a module in .playbook/repo-graph.json and not inside a known module path. ` +
      'Run "playbook index" to regenerate the graph, or pass a module name.'
  );
};

type Adjacency = Map<string, Array<{ to: string; kind: RepositoryGraphEdgeKind }>>;

const buildAdjacency = (graph: RepositoryGraph, reverse: boolean): Adjacency => {
  const moduleNames = new Set(graph.nodes.filter((node) => node.kind === 'module').map((node) => node.name));
  const adjacency: Adjacency = new Map();
  for (const edge of graph.edges) {
    if (!IMPACT_EDGE_KINDS.includes(edge.kind)) continue;
    if (!edge.from.startsWith(MODULE_PREFIX) || !edge.to.startsWith(MODULE_PREFIX)) continue;
    const from = edge.from.slice(MODULE_PREFIX.length);
    const to = edge.to.slice(MODULE_PREFIX.length);
    if (!moduleNames.has(from) || !moduleNames.has(to)) continue;
    const [source, destination] = reverse ? [to, from] : [from, to];
    const list = adjacency.get(source) ?? [];
    list.push({ to: destination, kind: edge.kind });
    adjacency.set(source, list);
  }
  for (const list of adjacency.values()) {
    list.sort((left, right) => compare(left.to, right.to) || compare(left.kind, right.kind));
  }
  return adjacency;
};

const traverse = (
  adjacency: Adjacency,
  start: string,
  depthLimit: number | undefined
): GraphImpactEntry[] => {
  const found = new Map<string, GraphImpactEntry>();
  const visited = new Set<string>([start]);
  let frontier: GraphImpactEntry[] = [{ module: start, depth: 0, edgeKinds: [], path: [start] }];

  while (frontier.length > 0) {
    const next: GraphImpactEntry[] = [];
    for (const current of frontier) {
      if (depthLimit !== undefined && current.depth >= depthLimit) continue;
      for (const edge of adjacency.get(current.module) ?? []) {
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        const entry: GraphImpactEntry = {
          module: edge.to,
          depth: current.depth + 1,
          edgeKinds: [...current.edgeKinds, edge.kind],
          path: [...current.path, edge.to]
        };
        found.set(edge.to, entry);
        next.push(entry);
      }
    }
    // Deterministic frontier order keeps the discovered shortest path stable.
    frontier = next.sort((left, right) => compare(left.module, right.module));
  }

  return [...found.values()].sort((left, right) => left.depth - right.depth || compare(left.module, right.module));
};

const validateOptions = (options: GraphImpactOptions): { direction: GraphImpactDirection; depth?: number; limit: number } => {
  const direction = options.direction ?? 'dependents';
  if (direction !== 'dependents' && direction !== 'dependencies' && direction !== 'both') {
    fail(`invalid --direction "${String(direction)}". Use dependents, dependencies, or both.`);
  }
  if (options.depth !== undefined && (!Number.isInteger(options.depth) || options.depth < 1)) {
    fail(`invalid --depth "${String(options.depth)}". Use an integer of at least 1.`);
  }
  const limit = options.limit ?? GRAPH_IMPACT_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > GRAPH_IMPACT_MAX_LIMIT) {
    fail(`invalid --limit "${String(limit)}". Use an integer from 1 to ${GRAPH_IMPACT_MAX_LIMIT}.`);
  }
  return { direction, depth: options.depth, limit };
};

export const computeGraphImpact = (graph: RepositoryGraph, input: string, options: GraphImpactOptions = {}): GraphImpactResult => {
  const { direction, depth, limit } = validateOptions(options);
  const target = resolveGraphImpactTarget(graph, input, options.moduleRoots);

  const result: GraphImpactResult = {
    schemaVersion: GRAPH_IMPACT_SCHEMA_VERSION,
    target,
    direction,
    depthLimit: depth ?? null,
    limit,
    truncated: false,
    totals: {}
  };

  if (direction === 'dependents' || direction === 'both') {
    const all = traverse(buildAdjacency(graph, true), target.module, depth);
    result.totals.dependents = all.length;
    result.dependents = all.slice(0, limit);
    result.truncated = result.truncated || all.length > limit;
  }
  if (direction === 'dependencies' || direction === 'both') {
    const all = traverse(buildAdjacency(graph, false), target.module, depth);
    result.totals.dependencies = all.length;
    result.dependencies = all.slice(0, limit);
    result.truncated = result.truncated || all.length > limit;
  }

  return result;
};

const readModuleRoots = (projectRoot: string): Record<string, string> => {
  try {
    const indexPath = path.join(projectRoot, '.playbook', 'repo-index.json');
    if (!fs.existsSync(indexPath)) return {};
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as { workspace?: Array<{ name?: unknown; path?: unknown }> };
    const roots: Record<string, string> = {};
    for (const entry of Array.isArray(parsed.workspace) ? parsed.workspace : []) {
      if (typeof entry?.name === 'string' && typeof entry?.path === 'string') {
        roots[entry.name] = entry.path;
      }
    }
    return roots;
  } catch {
    // Best effort only: file-to-module resolution then falls back to the src/<module> convention.
    return {};
  }
};

export const readGraphImpact = (projectRoot: string, input: string, options: GraphImpactOptions = {}): GraphImpactReport => {
  const graph = readRepositoryGraph(projectRoot);
  const result = computeGraphImpact(graph, input, { ...options, moduleRoots: options.moduleRoots ?? readModuleRoots(projectRoot) });
  return {
    ...result,
    graph: { schemaVersion: graph.schemaVersion, generatedAt: graph.generatedAt }
  };
};
