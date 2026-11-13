import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyze } from '../src/analyze/index.js';
import { loadConfig } from '../src/config/load.js';
import { generateRepositoryIndex } from '../src/indexer/repoIndexer.js';
import { loadRuleCatalog } from '../src/plugins/unifiedPluginRegistry.js';
import { verifyRepo } from '../src/verify/index.js';

const roots: string[] = [];

const makeRepo = (config: Record<string, unknown> | null, dependencies: Record<string, string> = {}): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-plugin-v1-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', dependencies }));
  if (config) fs.writeFileSync(path.join(root, 'playbook.config.json'), JSON.stringify({ version: 1, ...config }));
  return root;
};

const writePlugin = (root: string, name: string, source: string): void => {
  const dir = path.join(root, 'node_modules', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.js'), source);
};

const v1Plugin = (contractVersion: string): string => `module.exports = {
  name: 'v1-plugin',
  ${contractVersion}
  rules: [{
    id: 'v1.rule',
    description: 'v1 rule',
    explanation: 'v1 explanation',
    remediation: ['do the thing'],
    check: () => ({ failures: [{ id: 'v1.failure', message: 'v1 ran' }] })
  }],
  detectors: [{ id: 'v1-detector', label: 'V1 Detector', detect: () => ({ confidence: 1, evidence: ['v1'] }) }]
};`;

const legacyPlugin = `module.exports = {
  rules: [
    {
      id: 'legacy.rule',
      description: 'legacy predicate rule',
      explanation: 'legacy explanation',
      remediation: ['legacy fix'],
      verify: ({ failure }) => failure.id === 'legacy.failure'
    },
    { id: 'broken.rule', description: 'no predicate' }
  ]
};`;

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Plugin Contract v1 (engine)', () => {
  it('registers a v1 plugin (contractVersion 1 or absent) with guidance fields and a source tag', () => {
    for (const declaration of ['contractVersion: 1,', '']) {
      const root = makeRepo({ plugins: ['v1-plugin'] });
      writePlugin(root, 'v1-plugin', v1Plugin(declaration));

      const catalog = loadRuleCatalog(root, loadConfig(root).config);
      const entry = catalog.entries.find((candidate) => candidate.rule.id === 'v1.rule');
      expect(entry?.source).toBe('plugin');
      expect(entry?.rule.explanation).toBe('v1 explanation');
      expect(catalog.rules.map((rule) => rule.id)).toContain('v1.rule');
      expect(catalog.notices).toEqual([]);
      expect(verifyRepo(root).failures.map((failure) => failure.id)).toContain('v1.failure');
    }
  });

  it('skips a plugin that declares an unsupported contractVersion and reports a notice', () => {
    const root = makeRepo({ plugins: ['v1-plugin'] });
    writePlugin(root, 'v1-plugin', v1Plugin('contractVersion: 2,'));

    const catalog = loadRuleCatalog(root, loadConfig(root).config);
    expect(catalog.rules.map((rule) => rule.id)).not.toContain('v1.rule');
    expect(catalog.notices.join('\n')).toMatch(/contractVersion 2/);
  });

  it('adapts legacy playbook-plugin-* predicate plugins through the shim without executing them', () => {
    const root = makeRepo(null, { 'playbook-plugin-legacy': '1.0.0' });
    writePlugin(root, 'playbook-plugin-legacy', legacyPlugin);

    const catalog = loadRuleCatalog(root, loadConfig(root).config);
    const entry = catalog.entries.find((candidate) => candidate.rule.id === 'legacy.rule');
    expect(entry?.source).toBe('legacy-plugin');
    expect(entry?.rule.matchesFailure?.({ id: 'legacy.failure', message: 'x' })).toBe(true);
    expect(entry?.rule.matchesFailure?.({ id: 'other', message: 'x' })).toBe(false);
    expect(catalog.entries.map((candidate) => candidate.rule.id)).not.toContain('broken.rule');
    expect(catalog.notices).toHaveLength(1);
    expect(catalog.notices[0]).toMatch(/deprecated predicate rule shape/);

    // The adapted rule is a no-op check, so verify output is unchanged by the plugin.
    const failureIds = verifyRepo(root).failures.map((failure) => failure.id);
    expect(failureIds).not.toContain('legacy.failure');
  });

  it('does not load a package through the shim when it is already listed in config plugins', () => {
    const root = makeRepo({ plugins: ['playbook-plugin-both'] }, { 'playbook-plugin-both': '1.0.0' });
    writePlugin(root, 'playbook-plugin-both', `module.exports = { name: 'both', rules: [{ id: 'both.rule', description: 'd', check: () => ({ failures: [] }) }] };`);

    const catalog = loadRuleCatalog(root, loadConfig(root).config);
    expect(catalog.entries.filter((candidate) => candidate.rule.id === 'both.rule').map((candidate) => candidate.source)).toEqual(['plugin']);
    expect(catalog.notices).toEqual([]);
  });

  it('adds plugin detectors to the context-based analyze used by the CLI, after the core detectors', () => {
    const root = makeRepo({ plugins: ['v1-plugin'] });
    writePlugin(root, 'v1-plugin', v1Plugin(''));
    const ctx = {
      repoRoot: root,
      readTextFile: (relative: string) => {
        const target = path.join(root, relative);
        return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : undefined;
      },
      writeTextFile: () => undefined
    };

    const report = analyze(ctx as never);
    expect(report.detectorsRun).toEqual(['nextjs', 'supabase', 'tailwind', 'v1-detector']);
    expect(report.detected.map((item) => item.id)).toEqual(['v1-detector']);
  });

  it('keeps the context-based analyze report identical when no plugin is configured', () => {
    const root = makeRepo(null, { next: '15.0.0' });
    const ctx = {
      repoRoot: root,
      readTextFile: (relative: string) => {
        const target = path.join(root, relative);
        return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : undefined;
      },
      writeTextFile: () => undefined
    };

    const report = analyze(ctx as never);
    expect(report.detectorsRun).toEqual(['nextjs', 'supabase', 'tailwind']);
    expect(report.detected.map((item) => item.id)).toEqual(['nextjs']);
  });

  it('lists plugin rule ids (v1 and legacy) in repo-index rules, and tolerates a broken plugin', () => {
    const root = makeRepo({ plugins: ['v1-plugin'] }, { 'playbook-plugin-legacy': '1.0.0' });
    writePlugin(root, 'v1-plugin', v1Plugin(''));
    writePlugin(root, 'playbook-plugin-legacy', legacyPlugin);

    const rules = generateRepositoryIndex(root).rules;
    expect(rules).toEqual(expect.arrayContaining(['v1.rule', 'legacy.rule', 'release.version-governance']));
    expect([...rules].sort()).toEqual(rules);

    const broken = makeRepo({ plugins: ['missing-plugin'] });
    expect(generateRepositoryIndex(broken).rules).toContain('release.version-governance');
  });
});
