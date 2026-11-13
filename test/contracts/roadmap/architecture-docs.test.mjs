import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n');
const roadmap = JSON.parse(read('docs/roadmap/ROADMAP.json'));

const ARCHITECTURE_FEATURE_IDS = [
  'PB-V09-PACKAGING-SKU-ARCHITECTURE-001',
  'PB-V09-METRICS-ROI-PROOF-OF-VALUE-001',
  'PB-V09-PILOT-DESIGN-PARTNER-ROLLOUT-001',
  'PB-V09-WORKSPACE-TENANT-GOVERNANCE-001',
  'PB-V09-GOVERNED-INTERFACE-API-001',
  'PB-V09-MULTI-REPO-TRANSFER-001'
];

const PURPOSE_HEADING = /^## Purpose$/m;
const PLACEHOLDER = /\b(?:TODO|TBD)\b/;
const BACKTICKED_PATH = /`((?:docs|packages|scripts)\/[^`\s]+)`/g;

const architectureDocsFor = (feature) =>
  [...new Set([...(feature.contracts ?? []), ...(feature.docs ?? [])])]
    .filter((entry) => /^docs\/architecture\/[^/]+\.md$/.test(entry))
    .sort();

const referencedPaths = (markdown) =>
  [...new Set([...markdown.matchAll(BACKTICKED_PATH)].map((match) => match[1].replace(/[.,;:]+$/, '')))]
    // Globs and placeholders are descriptive patterns, not file references.
    .filter((entry) => !/[*<>{}]/.test(entry))
    .sort();

for (const featureId of ARCHITECTURE_FEATURE_IDS) {
  test(`${featureId} architecture docs are real, purposeful, and reference-clean`, () => {
    const feature = roadmap.features.find((entry) => entry.feature_id === featureId);
    assert.ok(feature, `${featureId} must exist in docs/roadmap/ROADMAP.json`);

    const docs = architectureDocsFor(feature);
    assert.ok(docs.length > 0, `${featureId} must name at least one docs/architecture/*.md file`);

    for (const doc of docs) {
      assert.ok(fs.existsSync(path.join(repoRoot, doc)), `${featureId}: ${doc} must exist`);
      const markdown = read(doc);
      assert.match(markdown, PURPOSE_HEADING, `${doc} must have a "## Purpose" heading`);
      assert.doesNotMatch(markdown, PLACEHOLDER, `${doc} must not contain TODO/TBD`);

      const dangling = referencedPaths(markdown).filter((entry) => !fs.existsSync(path.join(repoRoot, entry)));
      assert.deepEqual(dangling, [], `${doc} references paths that do not exist`);
    }
  });
}

test('multi-repo control-plane read interface slices agree across doc, engine, schema, and observer endpoint', () => {
  const doc = read('docs/architecture/PLAYBOOK_MULTI_REPO_CONTROL_PLANE_INTERFACES.md');

  const scopeSection = doc.split(/^## Scope for this first slice \(read-only\)$/m)[1]?.split(/^## /m)[0] ?? '';
  const docSlices = [...scopeSection.matchAll(/^\d+\. `([a-z-]+)`/gm)].map((match) => match[1]);
  assert.ok(docSlices.length > 0, 'doc must list slices as a numbered list of backticked slice names');

  const querySlices = (doc.match(/Query: `slice=<([a-z|-]+)>`/)?.[1] ?? '').split('|');

  const engineSource = read('packages/engine/src/controlPlane/multiRepoControlPlaneReadInterface.ts');
  const typeBody = engineSource.match(/export type MultiRepoReadInterfaceSlice =([^;]+);/)?.[1] ?? '';
  const engineSlices = [...typeBody.matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);

  const schema = JSON.parse(read('packages/contracts/src/multi-repo-control-plane-read-interface.schema.json'));
  const schemaSlices = schema.properties.request.properties.slice.enum;

  const observerSource = read('packages/cli/src/commands/observer/index.ts');
  const routeBlock = observerSource.split('pathname === "/api/control-plane/interfaces/read"')[1]?.split('kind: "observer-multi-repo-control-plane-read-interface"')[0] ?? '';
  const observerSlices = [...routeBlock.matchAll(/requestedSlice === "([a-z-]+)"/g)].map((match) => match[1]);

  const sorted = (values) => [...values].sort();
  assert.deepEqual(sorted(engineSlices), sorted(docSlices), 'doc slice list must equal the engine MultiRepoReadInterfaceSlice type');
  assert.deepEqual(sorted(querySlices), sorted(docSlices), 'doc query parameter list must equal the doc slice list');
  assert.deepEqual(sorted(schemaSlices), sorted(docSlices), 'schema request.slice enum must equal the doc slice list');
  assert.deepEqual(sorted(observerSlices), sorted(docSlices), 'observer endpoint must accept exactly the documented slices');

  const observerDoc = read('docs/commands/observer.md');
  assert.match(observerDoc, /GET \/api\/control-plane\/interfaces\/read\?slice=/, 'docs/commands/observer.md must document the read interface endpoint');
  for (const slice of docSlices) {
    assert.ok(observerDoc.includes(`\`${slice}\``), `docs/commands/observer.md must mention slice ${slice}`);
  }
});

test('transfer architecture doc states how readiness relates to export/import', () => {
  const doc = read('docs/architecture/PLAYBOOK_GOVERNED_CROSS_REPO_PATTERN_PROMOTION_AND_TRANSFER.md');
  assert.match(doc, /^## Transfer readiness vs export\/import \(current behavior\)$/m);

  // Pin the code facts the section relies on: neither export nor import consults transfer readiness.
  const transferSource = read('packages/engine/src/patternTransfer.ts');
  assert.doesNotMatch(transferSource, /transferReadiness|transfer-readiness|TRANSFER_READINESS/i);
  assert.match(transferSource, /import_mode: 'candidate-only'/);
  assert.match(transferSource, /compatibility mismatch fails closed/);
});
