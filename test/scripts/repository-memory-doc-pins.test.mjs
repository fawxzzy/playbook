import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8").replace(/\r\n/g, "\n");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const readJson = (relativePath) => JSON.parse(read(relativePath));
const singleQuoted = (text) => [...text.matchAll(/'([^']+)'/g)].map((match) => match[1]);

// PB-V09-REPO-MEMORY-FOUNDATION-001
test("repository memory contract and model docs exist", () => {
  for (const doc of [
    "docs/architecture/REPOSITORY_MEMORY_MODEL.md",
    "docs/contracts/REPOSITORY_MEMORY_EVENT_CONTRACT.md",
    "docs/contracts/REPOSITORY_MEMORY_KNOWLEDGE_CONTRACT.md"
  ]) {
    assert.ok(exists(doc), `${doc} must exist`);
  }
});

test("event contract documents exactly the memory-event schema kinds and required fields", () => {
  const schema = readJson("packages/contracts/src/memory-event.schema.json");
  const doc = read("docs/contracts/REPOSITORY_MEMORY_EVENT_CONTRACT.md");

  const kindsRow = doc.split("\n").find((line) => line.startsWith("| `kind` |"));
  assert.ok(kindsRow, "event contract must have a `kind` row in the envelope table");
  const documentedKinds = [...kindsRow.matchAll(/`([a-z_]+)`/g)].map((match) => match[1]).filter((value) => value !== "kind");
  assert.deepEqual([...documentedKinds].sort(), [...schema.properties.kind.enum].sort());

  for (const field of schema.required) {
    assert.ok(doc.includes(`| \`${field}\` |`), `envelope table must document required field ${field}`);
  }

  // The stale "planned" envelope shape must not return.
  for (const staleField of ["eventType", "recordedAt", '"actor"']) {
    assert.ok(!doc.includes(staleField), `event contract must not document stale field ${staleField}`);
  }
});

test("event contract kinds equal the engine MemoryEventKind union", () => {
  const schema = readJson("packages/contracts/src/memory-event.schema.json");
  const types = read("packages/engine/src/memory/types.ts");
  const union = types.match(/export type MemoryEventKind =([^;]+);/);
  assert.ok(union, "MemoryEventKind union must exist");
  assert.deepEqual(singleQuoted(union[1]).sort(), [...schema.properties.kind.enum].sort());
});

test("event contract keeps the structural graph separate from the temporal event store", () => {
  const doc = read("docs/contracts/REPOSITORY_MEMORY_EVENT_CONTRACT.md");
  assert.match(doc, /`\.playbook\/repo-graph\.json` remains structural/);
});

// PB-V09-SESSION-EVIDENCE-001
test("session evidence architecture doc reflects the shipped session slice", () => {
  const doc = read("docs/architecture/PLAYBOOK_SESSION_EVIDENCE_ARCHITECTURE.md");
  assert.ok(!doc.includes("Not an implication that session runtime is fully shipped today"));
  assert.match(doc, /the session slice is shipped/);
  assert.ok(exists("docs/commands/session.md"));
  for (const evidence of [
    "packages/contracts/src/session-evidence-envelope.schema.json",
    "packages/engine/src/session/sessionStore.ts",
    "packages/engine/src/session/sessionStore.test.ts",
    "packages/engine/test/session.store.test.ts",
    "packages/cli/src/commands/session.ts",
    "packages/cli/src/commands/session.test.ts"
  ]) {
    assert.ok(exists(evidence), `${evidence} must exist`);
  }
});

test("session command doc names every subcommand the CLI usage line lists", () => {
  const cli = read("packages/cli/src/commands/session.ts");
  const usage = cli.match(/Usage: playbook session <([a-z|]+)>/);
  assert.ok(usage, "session usage line must exist");
  const doc = read("docs/commands/session.md");
  for (const subcommand of usage[1].split("|")) {
    assert.ok(doc.includes(`\`${subcommand}`), `session.md must document ${subcommand}`);
  }
});

// PB-V09-KNOWLEDGE-PERSISTENCE-001
test("knowledge persistence doc references only repo paths that exist and covers the runtime artifacts", () => {
  const doc = read("docs/architecture/PLAYBOOK_KNOWLEDGE_PERSISTENCE_LAYER.md");
  const repoPaths = [...doc.matchAll(/`((?:docs|packages|scripts|test)\/[A-Za-z0-9_./-]+\.(?:md|ts|json|mjs))`/g)].map((match) => match[1]);
  assert.ok(repoPaths.length >= 10, "doc should reference concrete repo paths");
  for (const referenced of new Set(repoPaths)) {
    assert.ok(exists(referenced), `${referenced} referenced by the persistence doc must exist`);
  }
  assert.match(doc, /## Not persisted \/ not guaranteed/);
  for (const runtimePath of [".playbook/memory/knowledge/", ".playbook/patterns-promoted.json"]) {
    assert.ok(doc.includes(runtimePath), `doc must cover ${runtimePath}`);
  }
});

test("knowledge persistence doc lifecycle states equal the core knowledge-lifecycle enum", () => {
  const source = read("packages/core/src/knowledge/knowledge-lifecycle.ts");
  const match = source.match(/knowledgeLifecycleStates = \[([^\]]+)\] as const/);
  assert.ok(match, "knowledgeLifecycleStates must exist");
  const states = singleQuoted(match[1]);
  assert.deepEqual(states, ["candidate", "compacted", "promoted", "retired"]);
  const doc = read("docs/architecture/PLAYBOOK_KNOWLEDGE_PERSISTENCE_LAYER.md");
  assert.ok(doc.includes(`states ${states.map((state) => `\`${state}\``).join(", ")}`));
});

test("knowledge contract keeps the documented pruning semantics", () => {
  const contract = read("docs/contracts/REPOSITORY_MEMORY_KNOWLEDGE_CONTRACT.md");
  for (const phrase of ["stale candidate expiration", "superseded knowledge cleanup", "duplicate collapse by fingerprint"]) {
    assert.ok(contract.includes(phrase), `knowledge contract must keep: ${phrase}`);
  }
  for (const knowledgeFile of ["decisions", "patterns", "failure-modes", "invariants"]) {
    assert.ok(contract.includes(`.playbook/memory/knowledge/${knowledgeFile}.json`));
  }
});

// PB-V08-GRAPH-MEMORY-001
test("structural graph and memory integration doc is pinned to its roadmap feature id", () => {
  const doc = read("docs/architecture/STRUCTURAL_GRAPH_AND_MEMORY_INTEGRATION_V1.md");
  const header = doc.match(/^- feature_id: `([^`]+)`/m);
  assert.ok(header, "doc header must declare feature_id");
  assert.equal(header[1], "PB-V08-GRAPH-MEMORY-001");
  const roadmap = read("docs/roadmap/ROADMAP.json");
  assert.ok(roadmap.includes(`"${header[1]}"`), `${header[1]} must appear in ROADMAP.json`);

  for (const heading of [
    "## 1) Substrate separation (authoritative model)",
    "### 1.1 Structural graph substrate",
    "### 1.2 Memory substrate",
    "### 1.3 Separation rule (normative)",
    "## 2) Memory-native entities",
    "## 3) Memory-native edges",
    "## 4) Join semantics for command surfaces",
    "## 5) Provenance and contract-boundary rules",
    "## 7) Non-goals and anti-collapse guardrail"
  ]) {
    assert.ok(doc.includes(`\n${heading}\n`), `missing heading: ${heading}`);
  }
  assert.ok(doc.includes("`.playbook/repo-graph.json`") && doc.includes("`.playbook/memory/*`"));
});

test("repository graph contract still describes the graph artifact without absorbing memory events", () => {
  const contract = read("docs/contracts/repository-graph-contract.md");
  assert.match(contract, /\*\*Path\*\*: `\.playbook\/repo-graph\.json`/);
  assert.match(contract, /\*\*Kind\*\*: `playbook-repo-graph`/);
  assert.match(contract, /\*\*Producer\*\*: `pnpm playbook index`/);
  assert.ok(!contract.includes(".playbook/memory/events"), "graph contract must not describe the temporal event store");
});
