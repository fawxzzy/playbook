import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Each test re-imports the CLI loader and the engine behind it; allow for a cold module graph.
vi.setConfig({ testTimeout: 30000 });

const roots: string[] = [];

const makeRepo = (config: Record<string, unknown> | null, dependencies: Record<string, string> = {}): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-cli-plugin-contract-'));
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

const LEGACY_PLUGIN = `module.exports = {
  rules: [{
    id: 'legacy.rule',
    description: 'Legacy predicate rule',
    explanation: 'legacy explanation',
    remediation: ['legacy remediation'],
    policy: { id: 'legacy.policy' },
    verify: ({ failure }) => failure.id === 'legacy.failure'
  }]
};`;

const V1_PLUGIN = `module.exports = {
  name: 'v1-plugin',
  contractVersion: 1,
  rules: [{
    id: 'v1.rule',
    description: 'Contract v1 rule',
    explanation: 'v1 explanation',
    remediation: ['v1 remediation'],
    check: () => ({ failures: [] })
  }]
};`;

// Fresh module state per test so the once-per-process notice guard starts empty.
const freshLoader = async () => {
  vi.resetModules();
  return import('./loadVerifyRules.js');
};

const captureRulesJson = async (cwd: string): Promise<{ stdout: string; stderr: string[] }> => {
  vi.resetModules();
  const { runRules } = await import('../commands/rules.js');
  const out: string[] = [];
  const err: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void out.push(args.join(' ')));
  const error = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void err.push(args.join(' ')));
  try {
    await runRules(cwd, { format: 'json', quiet: false, explain: false });
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
  return { stdout: out.join('\n'), stderr: err };
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('legacy predicate plugin shim round-trip (CLI)', () => {
  it('keeps guidance, policy, remediation and the predicate of a legacy plugin rule', async () => {
    const root = makeRepo(null, { 'playbook-plugin-legacy': '1.0.0' });
    writePlugin(root, 'playbook-plugin-legacy', LEGACY_PLUGIN);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { loadVerifyRules } = await freshLoader();
    const rules = await loadVerifyRules(root);
    const rule = rules.find((candidate) => candidate.id === 'legacy.rule');

    expect(rule).toBeDefined();
    expect(rule?.check({ failure: { id: 'legacy.failure', message: 'x' } })).toBe(true);
    expect(rule?.check({ failure: { id: 'other', message: 'x' } })).toBe(false);
    expect(rule?.explanation).toBe('legacy explanation');
    expect(rule?.remediation).toEqual(['legacy remediation']);
    expect(rule?.policy).toEqual({ id: 'legacy.policy' });
    // Plugin rules keep precedence over built-in guidance rules.
    expect(rules.map((candidate) => candidate.id).indexOf('legacy.rule')).toBe(0);
  });

  it('loads a v1 plugin from config plugins and explains its failures by rule id', async () => {
    const root = makeRepo({ plugins: ['v1-plugin'] });
    writePlugin(root, 'v1-plugin', V1_PLUGIN);

    const { loadVerifyRules, loadRuleListing } = await freshLoader();
    const rules = await loadVerifyRules(root);
    expect(rules.find((candidate) => candidate.id === 'v1.rule')?.check({ failure: { id: 'v1.rule', message: 'x' } })).toBe(true);
    expect((await loadRuleListing(root)).find((entry) => entry.id === 'v1.rule')?.source).toBe('plugin');
  });
});

describe('rules --json (CLI)', () => {
  it('lists engine core, v1 and legacy rules with an additive source field and prints notices only to stderr', async () => {
    const root = makeRepo({ plugins: ['v1-plugin'] }, { 'playbook-plugin-legacy': '1.0.0' });
    writePlugin(root, 'v1-plugin', V1_PLUGIN);
    writePlugin(root, 'playbook-plugin-legacy', LEGACY_PLUGIN);

    const { stdout, stderr } = await captureRulesJson(root);
    const payload = JSON.parse(stdout) as { verify: Array<{ id: string; description: string; source?: string }>; analyze: unknown[] };

    expect(payload.verify.find((rule) => rule.id === 'v1.rule')?.source).toBe('plugin');
    expect(payload.verify.find((rule) => rule.id === 'legacy.rule')?.source).toBe('legacy-plugin');
    expect(payload.verify.find((rule) => rule.id === 'notes.missing')?.source).toBe('core');
    // Engine core rule that has no CLI guidance entry is now visible.
    expect(payload.verify.find((rule) => rule.id === 'requireNotesFileWhenGovernanceExists')?.source).toBe('core');
    for (const rule of payload.verify) {
      expect(Object.keys(rule).every((key) => ['id', 'description', 'explanation', 'source'].includes(key))).toBe(true);
    }

    expect(stdout).not.toMatch(/deprecated/i);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toMatch(/^playbook: Plugin "playbook-plugin-legacy" uses the deprecated predicate rule shape/);
  });

  it('prints the deprecation notice once per process, not once per load', async () => {
    const root = makeRepo(null, { 'playbook-plugin-legacy': '1.0.0' });
    writePlugin(root, 'playbook-plugin-legacy', LEGACY_PLUGIN);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { loadVerifyRules } = await freshLoader();
    await loadVerifyRules(root);
    await loadVerifyRules(root);
    await loadVerifyRules(root);

    expect(error).toHaveBeenCalledTimes(1);
  });

  it('prints nothing to stderr and adds only the source field and engine-only rules without plugins', async () => {
    const root = makeRepo(null);
    const { stdout, stderr } = await captureRulesJson(root);
    const payload = JSON.parse(stdout) as { verify: Array<{ id: string }> };

    expect(stderr).toEqual([]);
    expect(payload.verify.map((rule) => rule.id)).toEqual([
      'notes.missing',
      'notes.empty',
      'requireNotesOnChanges',
      'verify.rule.tests.required',
      'protected-doc.governance',
      'release.version-governance',
      'requireNotesFileWhenGovernanceExists'
    ]);
  });
});

describe('single loader boundary', () => {
  const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const sources = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sources(full);
      return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) ? [full] : [];
    });
  const rel = (file: string): string => path.relative(srcRoot, file).split(path.sep).join('/');

  it('keeps plugin discovery out of the CLI: no module besides lib/loadVerifyRules.ts touches plugin loading', () => {
    const offenders = sources(srcRoot)
      .filter((file) => rel(file) !== 'lib/loadVerifyRules.ts')
      .filter((file) => /playbook-plugin-|loadPlugins|legacyPredicateShim|loadLegacyPredicatePlugins|pluginRegistry|loadRuleCatalog/.test(fs.readFileSync(file, 'utf8')))
      .map(rel);

    expect(offenders).toEqual([]);
  });

  it('routes every rule-consuming command through lib/loadVerifyRules', () => {
    const consumers = ['commands/verify.ts', 'commands/rules.ts', 'commands/apply.ts', 'commands/fix.ts', 'commands/status.ts'];
    for (const consumer of consumers) {
      const text = fs.readFileSync(path.join(srcRoot, consumer), 'utf8');
      expect(text, consumer).toMatch(/from '\.\.\/lib\/loadVerifyRules\.js'/);
    }
  });

  it('routes analyze through the engine analyze entrypoint, which loads plugin detectors', () => {
    const text = fs.readFileSync(path.join(srcRoot, 'commands/analyze.ts'), 'utf8');
    expect(text).toMatch(/import \{[^}]*\banalyze\b[^}]*\} from '@zachariahredfield\/playbook-engine'/);
  });

  it('keeps the legacy predicate shim reachable only from the engine unified registry', () => {
    const engineSrc = path.resolve(srcRoot, '../../engine/src');
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [full] : [];
      });
    const importers = walk(engineSrc)
      .filter((file) => /legacyPredicateShim\.js/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(engineSrc, file).split(path.sep).join('/'));

    expect(importers).toEqual(['plugins/unifiedPluginRegistry.ts']);
  });
});
