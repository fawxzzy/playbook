import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildProjectBoardOwnerExport,
  renderProjectBoardOwnerExport
} from '../../scripts/export-project-board-owner.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const feature = (featureId, status, dependencies = []) => ({
  feature_id: featureId,
  version: 'v1.0',
  title: `Title ${featureId}`,
  goal: `Goal ${featureId}`,
  commands: ['verify'],
  contracts: ['docs/contracts/example.md'],
  tests: ['tests/example.test.ts'],
  docs: ['docs/example.md'],
  dependencies,
  verification_commands: ['pnpm playbook verify --json'],
  status,
  package_ownership: ['@fawxzzy/playbook']
});

const roadmap = {
  schemaVersion: '1.0',
  updatedAt: '2026-07-14',
  features: [
    feature('PB-V1-Z-001', 'planned'),
    feature('PB-V1-A-001', 'in-progress'),
    feature('PB-V1-B-001', 'planned-later'),
    feature('PB-V1-C-001', 'dependency-blocked', ['PB-V1-A-001']),
    feature('PB-V1-D-001', 'directional'),
    feature('PB-V1-E-001', 'architecture-defined'),
    feature('PB-V1-DONE-001', 'implemented-hardening')
  ]
};

test('maps every admitted roadmap status without inventing priority', () => {
  const bytes = Buffer.from(JSON.stringify(roadmap));
  const output = buildProjectBoardOwnerExport(roadmap, bytes);

  assert.equal(output.contract_version, 'atlas.project-board.owner-export.v1');
  assert.equal(output.source_revision, output.sources[0].revision);
  assert.equal(output.generated_at, '2026-07-14T00:00:00.000Z');
  assert.deepEqual(
    output.cards.map((card) => card.record.card_id),
    ['PB-V1-A-001', 'PB-V1-B-001', 'PB-V1-C-001', 'PB-V1-D-001', 'PB-V1-E-001', 'PB-V1-Z-001']
  );
  assert.deepEqual(
    Object.fromEntries(output.cards.map((card) => [card.record.card_id, [card.record_status, card.record.lifecycle]])),
    {
      'PB-V1-A-001': ['active', 'in-progress'],
      'PB-V1-B-001': ['candidate', 'intake'],
      'PB-V1-C-001': ['active', 'blocked'],
      'PB-V1-D-001': ['candidate', 'intake'],
      'PB-V1-E-001': ['active', 'planning'],
      'PB-V1-Z-001': ['active', 'planning']
    }
  );
  assert.ok(output.cards.every((card) => card.record.priority === null));
  assert.deepEqual(output.cards.find((card) => card.record.card_id === 'PB-V1-C-001').content.blockers, [
    'Blocked by roadmap dependency PB-V1-A-001.'
  ]);
});

test('is byte-deterministic for an unchanged roadmap', () => {
  const first = buildProjectBoardOwnerExport(roadmap, Buffer.from(JSON.stringify(roadmap)));
  const second = buildProjectBoardOwnerExport(roadmap, Buffer.from(JSON.stringify(roadmap)));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('fails closed for an unsupported non-complete status', () => {
  const invalid = { ...roadmap, features: [feature('PB-V1-X-001', 'mystery')] };
  assert.throws(
    () => buildProjectBoardOwnerExport(invalid, Buffer.from(JSON.stringify(invalid))),
    /unsupported non-complete roadmap status/
  );
});

test('canonical export matches the current roadmap and contains 35 non-complete cards', () => {
  const rendered = renderProjectBoardOwnerExport(repoRoot);
  const canonicalPath = path.join(repoRoot, 'exports', 'playbook.project-board.owner-export.v1.json');
  assert.equal(fs.readFileSync(canonicalPath, 'utf8'), rendered);
  assert.equal(JSON.parse(rendered).cards.length, 35);
});
