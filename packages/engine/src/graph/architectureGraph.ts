import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { compareCodeUnits } from '../util/compareCodeUnits.js';
import { readRepositoryGraph, type RepositoryGraph } from './repoGraph.js';
import { resolveOwningModule } from './graphImpact.js';

/**
 * Semantic architecture graph (`.playbook/arch-graph.v2.json`, kind `playbook-arch-graph`, schema 2.0).
 *
 * A separate artifact alongside `.playbook/repo-graph.json` (contract rule 3): it references the repo graph's
 * `module:*` node ids instead of redefining them and does not change the repo graph. It is derived only from the
 * repo graph, the repository index and a sorted scan of the working tree (tests, docs, contracts and command
 * implementation files). No clock, no locale, no network, no heuristics beyond path and file-name rules.
 *
 * Invalidation: `inputs.digest` is a hash over the repo-graph structure, the index fields used, and the
 * (path, content hash) pair of every scanned file. `writeArchitectureGraph` rewrites the artifact only when that
 * digest or the schema changes; text files are hashed with CR stripped so Windows and Linux checkouts agree.
 */

export const ARCH_GRAPH_SCHEMA_VERSION = '2.0' as const;
export const ARCH_GRAPH_KIND = 'playbook-arch-graph' as const;
export const ARCH_GRAPH_RELATIVE_PATH = '.playbook/arch-graph.v2.json' as const;
export const ARCH_GRAPH_NEIGHBORHOOD_LIMIT = 50;

export const ARCH_GRAPH_NODE_KINDS = ['command', 'contract', 'doc', 'file', 'module', 'package', 'repository', 'script', 'test'] as const;
export const ARCH_GRAPH_EDGE_KINDS = ['contains', 'depends_on', 'documents', 'implements', 'owns', 'tests'] as const;

export type ArchitectureGraphNodeKind = (typeof ARCH_GRAPH_NODE_KINDS)[number];
export type ArchitectureGraphEdgeKind = (typeof ARCH_GRAPH_EDGE_KINDS)[number];

export type ArchitectureGraphNode = {
  id: string;
  kind: ArchitectureGraphNodeKind;
  name: string;
  /** Repo-relative path for nodes backed by a file or directory. */
  path?: string;
  /** sha256 of the file content (CR stripped) for file-backed nodes. */
  sha256?: string;
};

export type ArchitectureGraphEdge = {
  kind: ArchitectureGraphEdgeKind;
  from: string;
  to: string;
};

export type ArchitectureGraph = {
  schemaVersion: typeof ARCH_GRAPH_SCHEMA_VERSION;
  kind: typeof ARCH_GRAPH_KIND;
  inputs: {
    repoGraphSchemaVersion: string;
    scannedFiles: number;
    digest: string;
  };
  nodes: ArchitectureGraphNode[];
  edges: ArchitectureGraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    nodeKinds: Partial<Record<ArchitectureGraphNodeKind, number>>;
    edgeKinds: Partial<Record<ArchitectureGraphEdgeKind, number>>;
  };
};

type IndexInputs = {
  workspace: Array<{ name: string; path: string; dependsOn: string[] }>;
  scripts: string[];
};

const REPO_INDEX_RELATIVE_PATH = '.playbook/repo-index.json';
const COMMAND_TRUTH_RELATIVE_PATH = 'docs/contracts/command-truth.json';
const SKIP_DIRS = new Set(['node_modules', '.git', '.playbook', 'dist', 'build', 'coverage', '.next', '.turbo', '.vercel', 'archive']);
const TEST_FILE_RE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const IMPL_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs'] as const;

const toPosix = (value: string): string => value.replace(/\\/g, '/');
const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');
const sortedUnique = (values: string[]): string[] => Array.from(new Set(values)).sort(compareCodeUnits);

const hashFile = (absolutePath: string): string => sha256(fs.readFileSync(absolutePath, 'utf8').replace(/\r/g, ''));

const walkFiles = (root: string): string[] => {
  const found: string[] = [];
  const visit = (relativeDir: string): void => {
    const absolute = path.join(root, relativeDir);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absolute, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => compareCodeUnits(left.name, right.name));
    for (const entry of entries) {
      const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(relative);
      } else if (entry.isFile()) {
        found.push(relative);
      }
    }
  };
  visit('');
  return found;
};

type FileClass = 'test' | 'contract' | 'doc';

const classifyFile = (relative: string): FileClass | undefined => {
  if (TEST_FILE_RE.test(relative)) return 'test';
  if (!relative.endsWith('.md')) return undefined;
  if (/^docs\/contracts\/[^/]+\.md$/.test(relative)) return 'contract';
  if (relative.startsWith('docs/') || relative === 'README.md' || relative === 'AGENTS.md') return 'doc';
  return undefined;
};

const readJson = (absolutePath: string): unknown => {
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch {
    return undefined;
  }
};

const readIndexInputs = (projectRoot: string): IndexInputs => {
  const indexPath = path.join(projectRoot, REPO_INDEX_RELATIVE_PATH);
  if (!fs.existsSync(indexPath)) {
    throw new Error('playbook graph build: missing repository index at .playbook/repo-index.json. Run "playbook index" first.');
  }
  const parsed = readJson(indexPath) as { schemaVersion?: unknown; workspace?: unknown; configs?: unknown } | undefined;
  if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== '1.0') {
    throw new Error('playbook graph build: invalid repository index at .playbook/repo-index.json. Run "playbook index" to regenerate.');
  }
  const workspace = (Array.isArray(parsed.workspace) ? parsed.workspace : [])
    .filter((entry): entry is { name: string; path: string; dependsOn?: unknown } => !!entry && typeof entry.name === 'string' && typeof entry.path === 'string')
    .map((entry) => ({
      name: entry.name,
      path: toPosix(entry.path).replace(/^(\.\/)+/, '').replace(/\/+$/, ''),
      dependsOn: Array.isArray(entry.dependsOn) ? sortedUnique(entry.dependsOn.filter((dep): dep is string => typeof dep === 'string')) : []
    }))
    .sort((left, right) => compareCodeUnits(left.name, right.name));
  const inventory = (Array.isArray(parsed.configs) ? parsed.configs : []).find(
    (entry): entry is { name: string; commands?: unknown } => !!entry && (entry as { name?: unknown }).name === 'command-inventory'
  );
  const scripts = inventory && Array.isArray(inventory.commands) ? sortedUnique(inventory.commands.filter((c): c is string => typeof c === 'string')) : [];
  return { workspace, scripts };
};

const readCommandNames = (projectRoot: string): string[] => {
  const parsed = readJson(path.join(projectRoot, COMMAND_TRUTH_RELATIVE_PATH)) as { commandTruth?: unknown } | undefined;
  if (!parsed || !Array.isArray(parsed.commandTruth)) return [];
  return sortedUnique(
    parsed.commandTruth
      .map((entry) => (entry && typeof (entry as { name?: unknown }).name === 'string' ? (entry as { name: string }).name : ''))
      .filter((name) => /^[a-z][a-z0-9-]*$/.test(name))
  );
};

const owningRoot = (roots: Array<{ name: string; path: string }>, file: string): { name: string; path: string } | undefined => {
  let best: { name: string; path: string } | undefined;
  for (const root of roots) {
    if (root.path.length === 0 || !file.startsWith(`${root.path}/`)) continue;
    if (!best || root.path.length > best.path.length) best = root;
  }
  return best;
};

/** Derive the graph from the repo graph, `.playbook/repo-index.json` and a working-tree scan. */
export const buildArchitectureGraph = (projectRoot: string, repoGraph: RepositoryGraph): ArchitectureGraph => {
  const index = readIndexInputs(projectRoot);
  const commandNames = readCommandNames(projectRoot);
  const moduleNames = repoGraph.nodes.filter((node) => node.kind === 'module').map((node) => node.name).sort(compareCodeUnits);

  const nodes = new Map<string, ArchitectureGraphNode>();
  const edgeKeys = new Set<string>();
  const edges: ArchitectureGraphEdge[] = [];
  const addNode = (node: ArchitectureGraphNode): void => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEdge = (kind: ArchitectureGraphEdgeKind, from: string, to: string): void => {
    if (!nodes.has(from) || !nodes.has(to)) return;
    const key = `${kind}|${from}|${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ kind, from, to });
  };

  const rootId = 'repository:root';
  addNode({ id: rootId, kind: 'repository', name: 'root' });
  for (const name of moduleNames) addNode({ id: `module:${name}`, kind: 'module', name });
  for (const pkg of index.workspace) addNode({ id: `package:${pkg.name}`, kind: 'package', name: pkg.name, path: pkg.path });
  for (const name of commandNames) addNode({ id: `command:${name}`, kind: 'command', name });
  for (const name of index.scripts) addNode({ id: `script:${name}`, kind: 'script', name });

  // Scanned files: tests, docs, contracts.
  const files = walkFiles(projectRoot);
  const scanned: Array<{ relative: string; fileClass: FileClass | 'file'; hash: string }> = [];
  for (const relative of files) {
    const fileClass = classifyFile(relative);
    if (!fileClass) continue;
    const hash = hashFile(path.join(projectRoot, relative));
    scanned.push({ relative, fileClass, hash });
    addNode({ id: `${fileClass}:${relative}`, kind: fileClass, name: path.posix.basename(relative), path: relative, sha256: hash });
  }

  // Command implementation files: <workspace path>/src/commands/<name>.<ext>.
  const fileSet = new Set(files);
  const implementationOf = new Map<string, string>();
  for (const pkg of index.workspace) {
    for (const name of commandNames) {
      for (const ext of IMPL_EXTENSIONS) {
        const relative = `${pkg.path}/src/commands/${name}${ext}`;
        if (!fileSet.has(relative)) continue;
        const hash = hashFile(path.join(projectRoot, relative));
        scanned.push({ relative, fileClass: 'file', hash });
        addNode({ id: `file:${relative}`, kind: 'file', name: path.posix.basename(relative), path: relative, sha256: hash });
        implementationOf.set(relative, name);
        break;
      }
    }
  }

  // Edges.
  for (const node of nodes.values()) {
    if (node.kind !== 'repository' && node.kind !== 'file') addEdge('contains', rootId, node.id);
  }
  for (const edge of repoGraph.edges) {
    if (edge.kind === 'depends_on' && edge.from.startsWith('module:') && edge.to.startsWith('module:')) addEdge('depends_on', edge.from, edge.to);
  }
  const packageNames = new Set(index.workspace.map((pkg) => pkg.name));
  for (const pkg of index.workspace) {
    for (const dep of pkg.dependsOn) if (packageNames.has(dep)) addEdge('depends_on', `package:${pkg.name}`, `package:${dep}`);
  }
  const packageRoots = index.workspace.map((pkg) => ({ name: pkg.name, path: pkg.path }));
  for (const node of nodes.values()) {
    if (!node.path || (node.kind !== 'test' && node.kind !== 'doc' && node.kind !== 'file')) continue;
    const pkg = owningRoot(packageRoots, node.path);
    if (pkg) addEdge('owns', `package:${pkg.name}`, node.id);
    const owningModule = resolveOwningModule(moduleNames, node.path);
    if (owningModule) addEdge('owns', `module:${owningModule}`, node.id);
  }
  for (const [relative, name] of implementationOf) addEdge('implements', `file:${relative}`, `command:${name}`);
  for (const entry of scanned) {
    if (entry.fileClass === 'test') {
      const stem = entry.relative.replace(TEST_FILE_RE, '');
      const sibling = IMPL_EXTENSIONS.map((ext) => `file:${stem}${ext}`).find((id) => nodes.has(id));
      if (sibling) {
        addEdge('tests', `test:${entry.relative}`, sibling);
      } else {
        const owningModule = resolveOwningModule(moduleNames, entry.relative);
        const pkg = owningRoot(packageRoots, entry.relative);
        if (owningModule) addEdge('tests', `test:${entry.relative}`, `module:${owningModule}`);
        else if (pkg) addEdge('tests', `test:${entry.relative}`, `package:${pkg.name}`);
      }
    }
    const commandDoc = /^docs\/commands\/([a-z][a-z0-9-]*)\.md$/.exec(entry.relative);
    if (commandDoc) addEdge('documents', `doc:${entry.relative}`, `command:${commandDoc[1]}`);
  }

  const sortedNodes = Array.from(nodes.values()).sort((left, right) => compareCodeUnits(left.kind, right.kind) || compareCodeUnits(left.id, right.id));
  const sortedEdges = edges.sort(
    (left, right) => compareCodeUnits(left.kind, right.kind) || compareCodeUnits(left.from, right.from) || compareCodeUnits(left.to, right.to)
  );

  const count = <K extends string>(values: K[]): Partial<Record<K, number>> => {
    const result: Partial<Record<K, number>> = {};
    for (const key of sortedUnique(values) as K[]) result[key] = values.filter((value) => value === key).length;
    return result;
  };

  const digest = sha256(
    JSON.stringify({
      schema: ARCH_GRAPH_SCHEMA_VERSION,
      repoGraph: {
        nodes: repoGraph.nodes.map((node) => [node.kind, node.id]),
        edges: repoGraph.edges.map((edge) => [edge.kind, edge.from, edge.to])
      },
      index,
      commandNames,
      files: scanned.map((entry) => [entry.relative, entry.hash]).sort((a, b) => compareCodeUnits(a[0], b[0]))
    })
  );

  return {
    schemaVersion: ARCH_GRAPH_SCHEMA_VERSION,
    kind: ARCH_GRAPH_KIND,
    inputs: { repoGraphSchemaVersion: repoGraph.schemaVersion, scannedFiles: scanned.length, digest },
    nodes: sortedNodes,
    edges: sortedEdges,
    stats: {
      nodeCount: sortedNodes.length,
      edgeCount: sortedEdges.length,
      nodeKinds: count(sortedNodes.map((node) => node.kind)),
      edgeKinds: count(sortedEdges.map((edge) => edge.kind))
    }
  };
};

export type ArchitectureGraphWriteResult = {
  status: 'created' | 'updated' | 'unchanged';
  path: typeof ARCH_GRAPH_RELATIVE_PATH;
  graph: ArchitectureGraph;
};

export type ArchitectureGraphReadResult = { ok: true; graph: ArchitectureGraph } | { ok: false; reason: string };

/** Structural validation only (shape, versions, edge endpoints). Staleness is detected by `graph build`. */
export const validateArchitectureGraph = (value: unknown): string | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'artifact is not an object';
  const graph = value as Partial<ArchitectureGraph>;
  if (graph.kind !== ARCH_GRAPH_KIND) return `unexpected kind "${String(graph.kind)}"`;
  if (graph.schemaVersion !== ARCH_GRAPH_SCHEMA_VERSION) return `unsupported schemaVersion "${String(graph.schemaVersion)}"`;
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return 'nodes/edges missing';
  if (!graph.inputs || typeof graph.inputs.digest !== 'string') return 'inputs.digest missing';
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== 'string' || typeof node.kind !== 'string' || typeof node.name !== 'string') return 'malformed node';
    ids.add(node.id);
  }
  for (const edge of graph.edges) {
    if (!edge || typeof edge.kind !== 'string' || !ids.has(edge.from) || !ids.has(edge.to)) return 'edge references an unknown node';
  }
  return undefined;
};

export const readArchitectureGraph = (projectRoot: string): ArchitectureGraphReadResult => {
  const graphPath = path.join(projectRoot, ARCH_GRAPH_RELATIVE_PATH);
  if (!fs.existsSync(graphPath)) return { ok: false, reason: 'missing' };
  const parsed = readJson(graphPath);
  if (parsed === undefined) return { ok: false, reason: 'unreadable' };
  const problem = validateArchitectureGraph(parsed);
  return problem ? { ok: false, reason: problem } : { ok: true, graph: parsed as ArchitectureGraph };
};

export const serializeArchitectureGraph = (graph: ArchitectureGraph): string => `${JSON.stringify(graph, null, 2)}\n`;

/** Derive the graph from `.playbook/repo-graph.json` and `.playbook/repo-index.json`; rewrite only when the input digest changed. */
export const writeArchitectureGraph = (projectRoot: string): ArchitectureGraphWriteResult => {
  let repoGraph: RepositoryGraph;
  try {
    repoGraph = readRepositoryGraph(projectRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.replace(/^playbook graph: /, 'playbook graph build: '));
  }
  const graph = buildArchitectureGraph(projectRoot, repoGraph);
  const target = path.join(projectRoot, ARCH_GRAPH_RELATIVE_PATH);
  const existedBefore = fs.existsSync(target);
  const existing = readArchitectureGraph(projectRoot);
  if (existing.ok && existing.graph.inputs.digest === graph.inputs.digest) {
    return { status: 'unchanged', path: ARCH_GRAPH_RELATIVE_PATH, graph: existing.graph };
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, serializeArchitectureGraph(graph), 'utf8');
  fs.renameSync(temp, target);
  return { status: existedBefore ? 'updated' : 'created', path: ARCH_GRAPH_RELATIVE_PATH, graph };
};

export type ArchitectureNeighborhood = {
  node: { id: string; kind: ArchitectureGraphNodeKind; name: string };
  totals: { outgoing: number; incoming: number };
  truncated: boolean;
  outgoing: Array<{ kind: ArchitectureGraphEdgeKind; target: string }>;
  incoming: Array<{ kind: ArchitectureGraphEdgeKind; source: string }>;
  source: { schemaVersion: typeof ARCH_GRAPH_SCHEMA_VERSION; digest: string };
};

export const summarizeArchitectureNeighborhood = (graph: ArchitectureGraph, nodeId: string): ArchitectureNeighborhood | undefined => {
  const node = graph.nodes.find((entry) => entry.id === nodeId);
  if (!node) return undefined;
  const outgoing = graph.edges.filter((edge) => edge.from === nodeId).map((edge) => ({ kind: edge.kind, target: edge.to }));
  const incoming = graph.edges.filter((edge) => edge.to === nodeId).map((edge) => ({ kind: edge.kind, source: edge.from }));
  return {
    node: { id: node.id, kind: node.kind, name: node.name },
    totals: { outgoing: outgoing.length, incoming: incoming.length },
    truncated: outgoing.length > ARCH_GRAPH_NEIGHBORHOOD_LIMIT || incoming.length > ARCH_GRAPH_NEIGHBORHOOD_LIMIT,
    outgoing: outgoing.slice(0, ARCH_GRAPH_NEIGHBORHOOD_LIMIT),
    incoming: incoming.slice(0, ARCH_GRAPH_NEIGHBORHOOD_LIMIT),
    source: { schemaVersion: graph.schemaVersion, digest: graph.inputs.digest }
  };
};

/** Never throws: a missing or invalid graph yields undefined so callers keep their existing output. */
export const readArchitectureNeighborhood = (projectRoot: string, nodeId: string): ArchitectureNeighborhood | undefined => {
  try {
    const result = readArchitectureGraph(projectRoot);
    return result.ok ? summarizeArchitectureNeighborhood(result.graph, nodeId) : undefined;
  } catch {
    return undefined;
  }
};
