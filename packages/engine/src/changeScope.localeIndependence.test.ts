import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildChangeScopeBundleFromPlan, computePlanArtifactDigest } from './changeScope.js';
import { compareCodeUnits } from './util/compareCodeUnits.js';

// The plan digest binds `.playbook/change-scope.json` to the plan being applied. A plan made on one machine must hash
// the same on another, so nothing that feeds it may depend on `localeCompare` (locale and ICU version dependent).

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const releaseTask = {
  id: 'task-release-alpha',
  ruleId: 'release.package-json.version',
  file: 'packages/alpha/package.json',
  action: 'Update @scope/alpha package.json to 1.2.4',
  autoFix: true,
  task_kind: 'release-package-version',
  provenance: {
    package_name: '@scope/alpha',
    package_path: 'packages/alpha',
    current_version: '1.2.3',
    next_version: '1.2.4',
    version_group: 'lockstep',
    linked_workspace_versions: [{ name: '@scope/alpha', currentVersion: '1.2.3', nextVersion: '1.2.4' }]
  }
};

const docsTask = {
  id: 'task-docs-1',
  ruleId: 'docs-consolidation.managed-write',
  file: 'docs/CHANGELOG.md',
  action: 'Apply protected docs consolidation',
  autoFix: true,
  task_kind: 'docs-managed-write',
  write: {
    operation: 'replace-managed-block',
    blockId: 'changelog-release-notes',
    startMarker: '<!-- START -->',
    endMarker: '<!-- END -->',
    anchor: '## Notes',
    content: 'approved content'
  },
  preconditions: {
    target_path: 'docs/CHANGELOG.md',
    target_file_fingerprint: 'abc',
    managed_block_fingerprint: 'def',
    anchor_context_hash: 'ghi',
    approved_fragment_ids: ['f1', 'f2'],
    planned_operation: 'replace-managed-block'
  },
  provenance: { release_plan_kind: 'playbook-release-plan' }
};

const notesTask = { id: 'task-75c270d4f0-1', ruleId: 'notes.missing', file: 'docs/PLAYBOOK_NOTES.md', action: 'create playbook notes file', autoFix: true };

// Keys that `localeCompare` (ICU) orders differently from UTF-16 code units: case, `_` versus letters, accents.
const mixedKeyProvenance = { B: 1, a: 2, _c: 3, é: 4, Z: 5, z: 6, a_b: 7, aB: 8, ab: 9, 'a-b': 10, scoreVersion: 11, scoredAt: 12 };
const mixedKeyTask = { id: 'task-mixed', ruleId: 'plugin.rule', file: 'docs/a.md', action: 'fix', autoFix: true, provenance: mixedKeyProvenance };

/** Makes every `localeCompare` call in the process return the opposite order, as a stand-in for "a different locale". */
const reverseLocaleCompare = (): void => {
  vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (this: string, other: string): number {
    const left = String(this);
    return left < other ? 1 : left > other ? -1 : 0;
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('compareCodeUnits', () => {
  it('orders by UTF-16 code unit, independent of case folding, punctuation weighting or accents', () => {
    const shuffled = ['ab', 'é', 'a_b', 'z', 'B', 'aB', '_c', 'a', 'Z', 'a-b'];
    expect([...shuffled].sort(compareCodeUnits)).toEqual(['B', 'Z', '_c', 'a', 'a-b', 'aB', 'a_b', 'ab', 'z', 'é']);
  });

  it('is a consistent comparator', () => {
    expect(compareCodeUnits('a', 'a')).toBe(0);
    expect(compareCodeUnits('a', 'b')).toBe(-1);
    expect(compareCodeUnits('b', 'a')).toBe(1);
    expect(compareCodeUnits('B', 'a')).toBe(-1);
    expect(compareCodeUnits('', 'a')).toBe(-1);
  });
});

describe('plan digest is locale independent', () => {
  it('hashes object keys in code-unit order (pinned against an independently built canonical form)', () => {
    // Canonical JSON for the provenance object with keys in UTF-16 code-unit order.
    const canonicalProvenance = '{"B":1,"Z":5,"_c":3,"a":2,"a-b":10,"aB":8,"a_b":7,"ab":9,"scoreVersion":11,"scoredAt":12,"z":6,"é":4}';
    const expected = `sha256:${sha256(
      JSON.stringify([['task-mixed', 'plugin.rule', 'docs/a.md', 'fix', true, null, null, null, sha256(canonicalProvenance)]])
    )}`;

    expect(computePlanArtifactDigest([mixedKeyTask])).toBe(expected);
  });

  it('does not change when localeCompare orders strings differently (another locale)', () => {
    const tasks = [releaseTask, docsTask, notesTask, mixedKeyTask];
    const before = computePlanArtifactDigest(tasks);

    reverseLocaleCompare();
    // Sanity: the stand-in really changes locale ordering in this process.
    expect(['a', 'b'].sort((left, right) => left.localeCompare(right))).toEqual(['b', 'a']);

    expect(computePlanArtifactDigest(tasks)).toBe(before);
  });

  it('is the same whatever order the keys were written in', () => {
    const reordered = Object.fromEntries(Object.entries(mixedKeyProvenance).reverse());
    expect(computePlanArtifactDigest([{ ...mixedKeyTask, provenance: reordered }])).toBe(computePlanArtifactDigest([mixedKeyTask]));
  });

  it('keeps the digests that existed before the comparator change for real plan shapes (lowercase ASCII keys)', () => {
    // Values captured from the build before this change (localeCompare key order). They must not move.
    expect(computePlanArtifactDigest([releaseTask, docsTask, notesTask])).toBe('sha256:54ae655fe63c5865910a1309a76bc9d9cbc842462334892a80f5657270b85c7b');
    expect(computePlanArtifactDigest([notesTask])).toBe('sha256:abaf4b915132b7f214be155d2ee7c0630a495bd213ddfa77e980ae580fdabd5b');
  });
});

describe('change-scope bundle is locale independent', () => {
  const lowercaseTasks = [
    { id: 't1', ruleId: 'plugin.b', file: 'docs/b.md', action: 'b', autoFix: true },
    { id: 't2', ruleId: 'plugin.a', file: 'docs/a.md', action: 'a', autoFix: true },
    { id: 't3', ruleId: 'plugin.c', file: 'packages/engine/src/index.ts', action: 'c', autoFix: true }
  ];
  const mixedCaseTasks = [
    { id: 't1', ruleId: 'notes.missing', file: 'docs/PLAYBOOK_NOTES.md', action: 'n', autoFix: true },
    { id: 't2', ruleId: 'PB013', file: '.gitignore', action: 'g', autoFix: true },
    { id: 't3', ruleId: 'plugin.readme', file: 'README.md', action: 'r', autoFix: true },
    { id: 't4', ruleId: 'plugin_under', file: 'docs/a_b.md', action: 'u', autoFix: true },
    { id: 't5', ruleId: 'plugin-dash', file: 'docs/a-b.md', action: 'd', autoFix: true }
  ];

  it('keeps the scope id and order that existed before the change for lowercase paths and rule ids', () => {
    const bundle = buildChangeScopeBundleFromPlan({ tasks: lowercaseTasks });
    expect(bundle.scopeId).toBe('scope-0372c1a5138e');
    expect(bundle.mutationScope.allowedFiles).toEqual(['docs/a.md', 'docs/b.md', 'packages/engine/src/index.ts']);
    expect(bundle.rulesTouched).toEqual(['plugin.a', 'plugin.b', 'plugin.c']);
  });

  it('orders mixed-case paths and rule ids by code unit', () => {
    const bundle = buildChangeScopeBundleFromPlan({ tasks: mixedCaseTasks });
    expect(bundle.mutationScope.allowedFiles).toEqual(['.gitignore', 'README.md', 'docs/PLAYBOOK_NOTES.md', 'docs/a-b.md', 'docs/a_b.md']);
    expect(bundle.rulesTouched).toEqual(['PB013', 'notes.missing', 'plugin-dash', 'plugin.readme', 'plugin_under']);
  });

  it('produces the same scope id, digest and array order when localeCompare orders strings differently', () => {
    const before = buildChangeScopeBundleFromPlan({ tasks: mixedCaseTasks });

    reverseLocaleCompare();

    expect(buildChangeScopeBundleFromPlan({ tasks: mixedCaseTasks })).toEqual(before);
  });
});
