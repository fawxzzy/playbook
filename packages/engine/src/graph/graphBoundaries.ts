import fs from 'node:fs';
import path from 'node:path';
import { inferArchitectureRoles } from './architectureRoleInference.js';
import { readRepositoryGraph, type RepositoryGraph } from './repoGraph.js';
import { assertGraphShape, buildModuleAdjacency, listGraphModuleNames } from './graphImpact.js';
import { resolveGraphListLimit } from './graphRisks.js';
import { compareCodeUnits } from '../util/compareCodeUnits.js';

/**
 * Boundary report over the `depends_on` edges of `.playbook/repo-graph.json`.
 *
 * Observation-first: this module invents no layering policy. When the repository index
 * already declares roles and a dependency-direction matrix (`architectureRoleInference`
 * written by `playbook index`), each graph edge is classified against that declared
 * matrix and out-of-direction edges are listed as `violations`. When nothing is declared,
 * edges are only observed, with roles inferred from graph topology, and no edge is judged.
 *
 * `enforced` mirrors the declared `policyEnforcement`. The indexer writes `none`, so the
 * report never gates anything: the command exit code depends only on reading the graph.
 */

export const GRAPH_BOUNDARIES_SCHEMA_VERSION = '1.0' as const;
export const DECLARED_RULES_SOURCE = '.playbook/repo-index.json#architectureRoleInference' as const;

export type DeclaredBoundaryRules = {
  classifierVersion: string | null;
  policyEnforcement: string;
  dependencyMatrix: Record<string, string[]>;
  /** Module name to declared role. */
  roles: Record<string, string>;
};

export type DeclaredBoundaryRulesLookup = { rules: DeclaredBoundaryRules } | { rules: null; reason: string };

export type GraphBoundaryEdgeStatus = 'allowed' | 'out_of_direction' | 'unclassified' | 'observed';

export type GraphBoundaryEdge = {
  from: string;
  to: string;
  fromRole: string | null;
  toRole: string | null;
  status: GraphBoundaryEdgeStatus;
};

export type GraphBoundariesResult = {
  schemaVersion: typeof GRAPH_BOUNDARIES_SCHEMA_VERSION;
  /** True only when declared rules carry a `policyEnforcement` other than `none`. */
  enforced: boolean;
  rules: {
    declared: boolean;
    source: typeof DECLARED_RULES_SOURCE | 'none';
    /** Why no declared rules were used; absent when `declared` is true. */
    reason?: string;
    classifierVersion: string | null;
    policyEnforcement: string | null;
    dependencyMatrix: Record<string, string[]> | null;
  };
  roles: Array<{ module: string; role: string | null; source: 'declared' | 'graph-inferred' | 'none' }>;
  summary: { modules: number; edges: number; allowed: number; violations: number; unclassified: number; observed: number };
  limit: number;
  truncated: boolean;
  totals: { violations: number; observations: number };
  /** Edges that are out of direction under the declared matrix. Always empty when no rules are declared. */
  violations: GraphBoundaryEdge[];
  /** Every module-to-module dependency edge with its classification, ordered by from, then to. */
  observations: GraphBoundaryEdge[];
};

export type GraphBoundariesReport = GraphBoundariesResult & {
  graph: { schemaVersion: RepositoryGraph['schemaVersion']; generatedAt: string };
};

export type GraphBoundariesOptions = {
  /** Maximum entries in `violations` and in `observations`. */
  limit?: number;
  /** Declared rules lookup. Omit (or pass `{ rules: null, reason }`) for observation-only output. */
  declared?: DeclaredBoundaryRulesLookup;
};

const COMMAND = 'playbook graph boundaries';
// Code-unit order: identical on every machine and locale (never localeCompare for committed output).
const compare = compareCodeUnits;

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string');

/** Parse the `architectureRoleInference` block of a repository index. Returns a reason instead of throwing. */
export const parseDeclaredBoundaryRules = (index: unknown): DeclaredBoundaryRulesLookup => {
  const inference = (index as { architectureRoleInference?: unknown } | null)?.architectureRoleInference;
  if (!inference || typeof inference !== 'object') {
    return { rules: null, reason: 'the repository index has no architectureRoleInference block' };
  }
  const { dependencyMatrix, nodes, classifierVersion, policyEnforcement } = inference as Record<string, unknown>;

  if (!dependencyMatrix || typeof dependencyMatrix !== 'object' || Array.isArray(dependencyMatrix)) {
    return { rules: null, reason: 'the repository index declares no dependency-direction matrix' };
  }
  const matrix: Record<string, string[]> = {};
  for (const role of Object.keys(dependencyMatrix as Record<string, unknown>).sort(compare)) {
    const allowed = (dependencyMatrix as Record<string, unknown>)[role];
    if (!isStringArray(allowed)) {
      return { rules: null, reason: `the declared dependency-direction matrix is invalid for role "${role}"` };
    }
    matrix[role] = [...allowed].sort(compare);
  }
  if (Object.keys(matrix).length === 0) {
    return { rules: null, reason: 'the repository index declares an empty dependency-direction matrix' };
  }

  const roles: Record<string, string> = {};
  for (const node of Array.isArray(nodes) ? nodes : []) {
    const { workspace, inferredRole } = (node ?? {}) as Record<string, unknown>;
    if (typeof workspace === 'string' && typeof inferredRole === 'string') {
      roles[workspace] = inferredRole;
    }
  }
  if (Object.keys(roles).length === 0) {
    return { rules: null, reason: 'the repository index declares no module roles (no workspace packages were indexed)' };
  }

  return {
    rules: {
      classifierVersion: typeof classifierVersion === 'string' ? classifierVersion : null,
      policyEnforcement: typeof policyEnforcement === 'string' ? policyEnforcement : 'none',
      dependencyMatrix: matrix,
      roles
    }
  };
};

export const readDeclaredBoundaryRules = (projectRoot: string): DeclaredBoundaryRulesLookup => {
  const indexPath = path.join(projectRoot, '.playbook', 'repo-index.json');
  if (!fs.existsSync(indexPath)) {
    return { rules: null, reason: 'no repository index at .playbook/repo-index.json' };
  }
  try {
    return parseDeclaredBoundaryRules(JSON.parse(fs.readFileSync(indexPath, 'utf8')));
  } catch {
    return { rules: null, reason: 'the repository index at .playbook/repo-index.json is not valid JSON' };
  }
};

export const computeGraphBoundaries = (graph: RepositoryGraph, options: GraphBoundariesOptions = {}): GraphBoundariesResult => {
  assertGraphShape(graph, COMMAND);
  const limit = resolveGraphListLimit(options.limit, COMMAND);
  const lookup: DeclaredBoundaryRulesLookup = options.declared ?? { rules: null, reason: 'no declared rules were supplied' };
  const declared = lookup.rules;

  const modules = listGraphModuleNames(graph);
  const forward = buildModuleAdjacency(graph, false);
  const inferredRoles = new Map(inferArchitectureRoles(graph).roles.map((record) => [record.module, record.role as string]));

  const roleOf = (module: string): string | null =>
    declared ? declared.roles[module] ?? null : inferredRoles.get(module) ?? null;

  const classify = (fromRole: string | null, toRole: string | null): GraphBoundaryEdgeStatus => {
    if (!declared) return 'observed';
    if (fromRole === null || toRole === null) return 'unclassified';
    const allowedTargets = declared.dependencyMatrix[fromRole];
    if (!allowedTargets) return 'unclassified';
    return allowedTargets.includes(toRole) ? 'allowed' : 'out_of_direction';
  };

  const observations: GraphBoundaryEdge[] = [];
  for (const from of modules) {
    const targets = Array.from(new Set((forward.get(from) ?? []).map((edge) => edge.to))).sort(compare);
    for (const to of targets) {
      if (to === from) continue;
      const fromRole = roleOf(from);
      const toRole = roleOf(to);
      observations.push({ from, to, fromRole, toRole, status: classify(fromRole, toRole) });
    }
  }

  const violations = observations.filter((edge) => edge.status === 'out_of_direction');
  const count = (status: GraphBoundaryEdgeStatus): number => observations.filter((edge) => edge.status === status).length;

  return {
    schemaVersion: GRAPH_BOUNDARIES_SCHEMA_VERSION,
    enforced: declared !== null && declared.policyEnforcement !== 'none',
    rules: declared
      ? {
          declared: true,
          source: DECLARED_RULES_SOURCE,
          classifierVersion: declared.classifierVersion,
          policyEnforcement: declared.policyEnforcement,
          dependencyMatrix: declared.dependencyMatrix
        }
      : {
          declared: false,
          source: 'none',
          reason: (lookup as { reason: string }).reason,
          classifierVersion: null,
          policyEnforcement: null,
          dependencyMatrix: null
        },
    roles: modules.map((module) => {
      const role = roleOf(module);
      return { module, role, source: role === null ? ('none' as const) : declared ? ('declared' as const) : ('graph-inferred' as const) };
    }),
    summary: {
      modules: modules.length,
      edges: observations.length,
      allowed: count('allowed'),
      violations: violations.length,
      unclassified: count('unclassified'),
      observed: count('observed')
    },
    limit,
    truncated: violations.length > limit || observations.length > limit,
    totals: { violations: violations.length, observations: observations.length },
    violations: violations.slice(0, limit),
    observations: observations.slice(0, limit)
  };
};

export const readGraphBoundaries = (projectRoot: string, options: GraphBoundariesOptions = {}): GraphBoundariesReport => {
  const graph = readRepositoryGraph(projectRoot);
  return {
    ...computeGraphBoundaries(graph, { ...options, declared: options.declared ?? readDeclaredBoundaryRules(projectRoot) }),
    graph: { schemaVersion: graph.schemaVersion, generatedAt: graph.generatedAt }
  };
};
