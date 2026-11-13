import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { repoRootFromImportMeta } from './helpers/runtime-test-utils.mjs';
import { toCommandTruth } from '../../scripts/managed-docs-lib.mjs';

const repoRoot = repoRootFromImportMeta(import.meta.url);

const command = (overrides) => ({
  name: 'sample',
  description: 'Sample',
  category: 'Core',
  role: 'utility',
  lifecycle: 'utility',
  discoverability: 'secondary',
  onboardingPriority: null,
  canonicalSequence: null,
  productFacing: false,
  exampleArgs: 'sample --json',
  machineReadable: true,
  ...overrides
});

test('command truth lists planned-reference commands separately from live lifecycles', () => {
  const truth = toCommandTruth([
    command({ name: 'live', lifecycle: 'canonical', role: 'governance', discoverability: 'primary', productFacing: true }),
    command({ name: 'later', lifecycle: 'planned-reference' }),
    command({ name: 'also-later', lifecycle: 'planned-reference' })
  ]);

  assert.deepEqual(truth.plannedCommands, ['also-later', 'later']);
  assert.deepEqual(truth.canonicalCommands, ['live']);
  assert.deepEqual(truth.utilityCommands, []);
  assert.deepEqual(truth.compatibilityCommands, []);
});

test('command truth records question-bounded commands and keeps unbounded entries unchanged', () => {
  const truth = toCommandTruth([
    command({ name: 'ask-like', lifecycle: 'canonical', questionBounded: true }),
    command({ name: 'plain', lifecycle: 'canonical' }),
    command({ name: 'explicitly-unbounded', lifecycle: 'canonical', questionBounded: false })
  ]);

  assert.deepEqual(truth.questionBoundedCommands, ['ask-like']);
  const byName = Object.fromEntries(truth.commandTruth.map((entry) => [entry.name, entry]));
  assert.equal(byName['ask-like'].questionBounded, true);
  assert.equal('questionBounded' in byName.plain, false);
  assert.equal('questionBounded' in byName['explicitly-unbounded'], false);
});

test('command truth output is deterministic regardless of input order', () => {
  const commands = [
    command({ name: 'b', lifecycle: 'planned-reference', questionBounded: true }),
    command({ name: 'a', lifecycle: 'planned-reference', questionBounded: true })
  ];

  assert.deepEqual(toCommandTruth(commands), toCommandTruth([...commands].reverse()));
});

test('committed command-truth.json exposes planned and question-bounded sets consistent with its entries', () => {
  const truth = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs', 'contracts', 'command-truth.json'), 'utf8'));

  assert.deepEqual(
    truth.plannedCommands,
    truth.commandTruth.filter((entry) => entry.lifecycle === 'planned-reference').map((entry) => entry.name).sort()
  );
  assert.deepEqual(
    truth.questionBoundedCommands,
    truth.commandTruth.filter((entry) => entry.questionBounded === true).map((entry) => entry.name).sort()
  );
  assert.ok(truth.questionBoundedCommands.includes('ask'));
});
