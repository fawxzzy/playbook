import { readRepositoryGraph, type RepositoryGraph } from './repoGraph.js';
import {
  GRAPH_IMPACT_DEFAULT_LIMIT,
  GRAPH_IMPACT_MAX_LIMIT,
  assertGraphShape,
  buildModuleAdjacency,
  countReachableModules,
  listGraphModuleNames,
  type ModuleAdjacency
} from './graphImpact.js';
import { compareCodeUnits } from '../util/compareCodeUnits.js';

/**
 * Structural risk signals per module, derived from the `depends_on` edges of
 * `.playbook/repo-graph.json` only. No index, verify, ownership or history input:
 * the same graph always yields the same output.
 *
 * Formula (schema 1.0; changing a weight or a term requires a schemaVersion bump):
 *
 *   hubScore = fanIn * fanOut
 *   score    = 2 * transitiveDependents + fanIn + fanOut + hubScore + 3 * cycleSize
 *
 * - fanIn / fanOut: direct dependents / direct dependencies (distinct modules).
 * - transitiveDependents: modules that reach this module through depends_on (blast radius).
 * - cycleSize: number of modules in the module's dependency cycle (its strongly connected
 *   component, or 1 for a self-dependency); 0 when the module is in no cycle.
 * - depth: dependency layers beneath the module. 0 for a module with no dependencies outside
 *   its own cycle; otherwise 1 + the largest depth among those dependencies. Modules in one
 *   cycle share a depth. Reported as a signal; it is not part of the score.
 */

export const GRAPH_RISKS_SCHEMA_VERSION = '1.0' as const;

export const GRAPH_RISK_FORMULA = {
  hubScore: 'fanIn * fanOut',
  score: '2 * transitiveDependents + fanIn + fanOut + hubScore + 3 * cycleSize',
  weights: { transitiveDependents: 2, fanIn: 1, fanOut: 1, hubScore: 1, cycleSize: 3 }
} as const;

export type GraphRiskEntry = {
  module: string;
  score: number;
  fanIn: number;
  fanOut: number;
  transitiveDependents: number;
  transitiveDependencies: number;
  inCycle: boolean;
  cycleSize: number;
  depth: number;
  hubScore: number;
};

export type GraphRisksOptions = {
  /** Maximum entries in `modules` and in `cycles`. Defaults to GRAPH_IMPACT_DEFAULT_LIMIT. */
  limit?: number;
};

export type GraphRisksResult = {
  schemaVersion: typeof GRAPH_RISKS_SCHEMA_VERSION;
  formula: typeof GRAPH_RISK_FORMULA;
  limit: number;
  truncated: boolean;
  totals: { modules: number; cycles: number };
  /** Ordered by score (highest first), then module name. */
  modules: GraphRiskEntry[];
  /** Each cycle lists its modules sorted by name; cycles are ordered by size (largest first), then first module. */
  cycles: string[][];
};

export type GraphRisksReport = GraphRisksResult & {
  graph: { schemaVersion: RepositoryGraph['schemaVersion']; generatedAt: string };
};

const COMMAND = 'playbook graph risks';
// Code-unit order: identical on every machine and locale (never localeCompare for committed output).
const compare = compareCodeUnits;

const resolveLimit = (limit: number | undefined, commandName: string): number => {
  const resolved = limit ?? GRAPH_IMPACT_DEFAULT_LIMIT;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > GRAPH_IMPACT_MAX_LIMIT) {
    throw new Error(`${commandName}: invalid --limit "${String(limit)}". Use an integer from 1 to ${GRAPH_IMPACT_MAX_LIMIT}.`);
  }
  return resolved;
};

export const resolveGraphListLimit = resolveLimit;

/**
 * Strongly connected components (iterative Tarjan). Components are returned in reverse
 * topological order of the condensation: a component appears after every component it depends on
 * has already appeared.
 */
export const findStronglyConnectedComponents = (modules: readonly string[], forward: ModuleAdjacency): string[][] => {
  const indexOf = new Map<string, number>();
  const lowLink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const components: string[][] = [];
  let nextIndex = 0;

  for (const root of modules) {
    if (indexOf.has(root)) continue;
    const work: Array<{ node: string; edge: number }> = [{ node: root, edge: 0 }];
    indexOf.set(root, nextIndex);
    lowLink.set(root, nextIndex);
    nextIndex += 1;
    stack.push(root);
    onStack.add(root);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const edges = forward.get(frame.node) ?? [];
      if (frame.edge < edges.length) {
        const next = edges[frame.edge].to;
        frame.edge += 1;
        if (!indexOf.has(next)) {
          indexOf.set(next, nextIndex);
          lowLink.set(next, nextIndex);
          nextIndex += 1;
          stack.push(next);
          onStack.add(next);
          work.push({ node: next, edge: 0 });
        } else if (onStack.has(next)) {
          lowLink.set(frame.node, Math.min(lowLink.get(frame.node) ?? 0, indexOf.get(next) ?? 0));
        }
        continue;
      }

      work.pop();
      const parent = work[work.length - 1];
      if (parent) {
        lowLink.set(parent.node, Math.min(lowLink.get(parent.node) ?? 0, lowLink.get(frame.node) ?? 0));
      }
      if (lowLink.get(frame.node) === indexOf.get(frame.node)) {
        const component: string[] = [];
        for (;;) {
          const member = stack.pop() as string;
          onStack.delete(member);
          component.push(member);
          if (member === frame.node) break;
        }
        components.push(component.sort(compare));
      }
    }
  }

  return components;
};

export const computeGraphRisks = (graph: RepositoryGraph, options: GraphRisksOptions = {}): GraphRisksResult => {
  assertGraphShape(graph, COMMAND);
  const limit = resolveLimit(options.limit, COMMAND);

  const modules = listGraphModuleNames(graph);
  const forward = buildModuleAdjacency(graph, false);
  const reverse = buildModuleAdjacency(graph, true);
  const distinctNeighbors = (adjacency: ModuleAdjacency, module: string): string[] =>
    Array.from(new Set((adjacency.get(module) ?? []).map((edge) => edge.to)));

  const components = findStronglyConnectedComponents(modules, forward);
  const componentOf = new Map<string, number>();
  components.forEach((component, index) => component.forEach((module) => componentOf.set(module, index)));

  // Components arrive dependencies-first, so every dependency depth is known when it is needed.
  const componentDepth: number[] = [];
  components.forEach((component, index) => {
    let depth = 0;
    for (const module of component) {
      for (const dependency of distinctNeighbors(forward, module)) {
        const dependencyComponent = componentOf.get(dependency) as number;
        if (dependencyComponent !== index) {
          depth = Math.max(depth, 1 + componentDepth[dependencyComponent]);
        }
      }
    }
    componentDepth[index] = depth;
  });

  const isCycle = (component: string[]): boolean =>
    component.length > 1 || distinctNeighbors(forward, component[0]).includes(component[0]);

  const entries: GraphRiskEntry[] = modules.map((module) => {
    const component = components[componentOf.get(module) as number];
    const inCycle = isCycle(component);
    const fanIn = distinctNeighbors(reverse, module).filter((name) => name !== module).length;
    const fanOut = distinctNeighbors(forward, module).filter((name) => name !== module).length;
    const transitiveDependents = countReachableModules(reverse, module);
    const transitiveDependencies = countReachableModules(forward, module);
    const cycleSize = inCycle ? component.length : 0;
    const hubScore = fanIn * fanOut;
    const weights = GRAPH_RISK_FORMULA.weights;
    return {
      module,
      score:
        weights.transitiveDependents * transitiveDependents +
        weights.fanIn * fanIn +
        weights.fanOut * fanOut +
        weights.hubScore * hubScore +
        weights.cycleSize * cycleSize,
      fanIn,
      fanOut,
      transitiveDependents,
      transitiveDependencies,
      inCycle,
      cycleSize,
      depth: componentDepth[componentOf.get(module) as number],
      hubScore
    };
  });

  entries.sort((left, right) => right.score - left.score || compare(left.module, right.module));
  const cycles = components
    .filter(isCycle)
    .sort((left, right) => right.length - left.length || compare(left[0], right[0]));

  return {
    schemaVersion: GRAPH_RISKS_SCHEMA_VERSION,
    formula: GRAPH_RISK_FORMULA,
    limit,
    truncated: entries.length > limit || cycles.length > limit,
    totals: { modules: entries.length, cycles: cycles.length },
    modules: entries.slice(0, limit),
    cycles: cycles.slice(0, limit)
  };
};

export const readGraphRisks = (projectRoot: string, options: GraphRisksOptions = {}): GraphRisksReport => {
  const graph = readRepositoryGraph(projectRoot);
  return {
    ...computeGraphRisks(graph, options),
    graph: { schemaVersion: graph.schemaVersion, generatedAt: graph.generatedAt }
  };
};
