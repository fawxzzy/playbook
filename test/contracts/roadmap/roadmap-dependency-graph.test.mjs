import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// PB-V08-ARCH-CLOSURE-001: stable feature IDs and conflict-free sequencing.
// Dependencies are sequencing intent, not a gate: this test pins that the graph is well-formed
// (unique IDs, no dangling edges, no cycles, sequencing lists point at real features), not that
// every dependency has shipped.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const roadmap = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/roadmap/ROADMAP.json'), 'utf8').replace(/^﻿/, ''));
const features = roadmap.features;
const byId = new Map(features.map((feature) => [feature.feature_id, feature]));

test('feature IDs are unique and stable-shaped', () => {
  assert.equal(byId.size, features.length, 'duplicate feature_id in ROADMAP.json');
  for (const id of byId.keys()) {
    assert.match(id, /^PB-V\d+(?:-[A-Z0-9]+)+-\d{3}$/, `${id} does not follow the PB-V<n>-<NAME>-<nnn> shape`);
  }
});

test('every dependency points at an existing feature', () => {
  const dangling = features.flatMap((feature) =>
    (feature.dependencies ?? []).filter((dependency) => !byId.has(dependency)).map((dependency) => `${feature.feature_id} -> ${dependency}`)
  );
  assert.deepEqual(dangling, []);
});

test('the dependency graph is acyclic', () => {
  const state = new Map();
  const visit = (id, trail) => {
    if (state.get(id) === 2) return;
    assert.notEqual(state.get(id), 1, `dependency cycle: ${[...trail, id].join(' -> ')}`);
    state.set(id, 1);
    for (const dependency of byId.get(id).dependencies ?? []) visit(dependency, [...trail, id]);
    state.set(id, 2);
  };
  for (const id of byId.keys()) visit(id, []);
});

test('implementationSequencing lists only real features and never lists one feature in the build order twice', () => {
  const sequencing = roadmap.implementationSequencing;
  for (const [listName, ids] of Object.entries(sequencing)) {
    if (!Array.isArray(ids)) continue;
    const unknown = ids.filter((id) => !byId.has(id));
    assert.deepEqual(unknown, [], `${listName} references unknown features`);
    assert.equal(new Set(ids).size, ids.length, `${listName} lists a feature more than once`);
  }
});

test('a feature that lists a dependency is never scheduled before that dependency in the build order', () => {
  const order = roadmap.implementationSequencing.nextBuildableSlicesInOrder;
  const position = new Map(order.map((id, index) => [id, index]));
  const violations = [];
  for (const id of order) {
    for (const dependency of byId.get(id).dependencies ?? []) {
      if (position.has(dependency) && position.get(dependency) > position.get(id)) violations.push(`${id} before ${dependency}`);
    }
  }
  assert.deepEqual(violations, []);
});
