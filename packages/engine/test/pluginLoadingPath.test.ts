import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeRepo } from '../src/analyze/index.js';
import { runRuleExecution } from '../src/execution/index.js';
import { loadConfig } from '../src/config/load.js';
import { loadDetectorRegistry, loadRuleRegistry } from '../src/plugins/unifiedPluginRegistry.js';
import { verifyRepo } from '../src/verify/index.js';
import { nextjsDetector } from '../src/analyze/detectors/nextjs.js';

const roots: string[] = [];

const createPluginRepo = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-plugin-path-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture"}');
  fs.writeFileSync(path.join(root, 'playbook.config.json'), JSON.stringify({ version: 1, plugins: ['path-plugin'] }));
  const pluginDir = path.join(root, 'node_modules', 'path-plugin');
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, 'index.js'),
    `module.exports = {
      name: 'path-plugin',
      rules: [{
        id: 'path-plugin.rule',
        description: 'path plugin rule',
        check: () => ({ failures: [{ id: 'path-plugin.failure', message: 'plugin rule ran' }] })
      }],
      detectors: [{
        id: 'path-plugin-detector',
        label: 'Path Plugin Detector',
        detect: () => ({ confidence: 1, evidence: ['plugin'] })
      }]
    };`
  );
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('single engine plugin-loading path (PB-V05-PACKAGE-BOUNDARIES-001)', () => {
  it('verify, plan/execution and analyze all see the same configured plugin', () => {
    const root = createPluginRepo();

    const verifyFailureIds = verifyRepo(root).failures.map((failure) => failure.id);
    expect(verifyFailureIds).toContain('path-plugin.failure');

    const executionFailureIds = runRuleExecution(root).failures.map((failure) => failure.id);
    expect(executionFailureIds).toContain('path-plugin.failure');

    const analyzeReport = analyzeRepo(root);
    expect(analyzeReport.detectorsRun).toEqual(['nextjs', 'supabase', 'tailwind', 'path-plugin-detector']);
    expect(analyzeReport.detected.map((item) => item.id)).toContain('path-plugin-detector');
  });

  it('the unified registry returns core first, then plugin entries, and resets between loads', () => {
    const root = createPluginRepo();
    const { config } = loadConfig(root);

    const ruleIds = loadRuleRegistry(root, config).map((rule) => rule.id);
    expect(ruleIds.at(-1)).toBe('path-plugin.rule');
    expect(ruleIds.slice(0, -1)).toEqual([
      'requireNotesFileWhenGovernanceExists',
      'requireNotesOnChanges',
      'verify.rule.tests.required',
      'protected-doc.governance',
      'release.version-governance'
    ]);
    expect(loadRuleRegistry(root, config).map((rule) => rule.id)).toEqual(ruleIds);

    const detectorIds = loadDetectorRegistry(root, [nextjsDetector]).map((detector) => detector.id);
    expect(detectorIds).toEqual(['nextjs', 'path-plugin-detector']);
  });

  it('only the unified registry module imports the plugin loader or composes the registry', () => {
    const srcRoot = path.resolve(__dirname, '../src');
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [full] : [];
      });

    const offenders = walk(srcRoot)
      .filter((file) => {
        const relative = path.relative(srcRoot, file).split(path.sep).join('/');
        if (relative.startsWith('plugins/')) return false;
        const text = fs.readFileSync(file, 'utf8');
        return /plugins\/loadPlugins\.js/.test(text) || /plugins\/pluginRegistry\.js/.test(text);
      })
      .map((file) => path.relative(srcRoot, file).split(path.sep).join('/'));

    expect(offenders).toEqual([]);
  });
});
