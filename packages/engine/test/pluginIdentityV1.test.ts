import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/load.js';
import { PluginContractError, assertPluginSpecifier, isPackageName } from '../src/plugins/pluginIdentity.js';
import { PLUGIN_CONTRACT_VERSION } from '../src/plugins/pluginTypes.js';
import { loadRuleCatalog } from '../src/plugins/unifiedPluginRegistry.js';
import { verifyRepo } from '../src/verify/index.js';

const roots: string[] = [];

/** A repo nested one level below a sandbox so `../outside` style escapes have a real target. */
const makeRepo = (plugins: unknown[], dependencies: Record<string, string> = {}): { sandbox: string; repo: string; marker: string } => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-plugin-identity-'));
  roots.push(sandbox);
  const repo = path.join(sandbox, 'repo');
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'fixture', dependencies }));
  fs.writeFileSync(path.join(repo, 'playbook.config.json'), JSON.stringify({ version: 1, plugins }));
  return { sandbox, repo, marker: path.join(sandbox, 'EXECUTED') };
};

/** Source of a plugin module that records its execution in `marker` before exporting a valid plugin. */
const markingPlugin = (marker: string, name = 'marker-plugin'): string =>
  `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');\n` +
  `module.exports = { name: ${JSON.stringify(name)}, rules: [{ id: ${JSON.stringify(`${name}.rule`)}, description: 'd', check: () => ({ failures: [] }) }] };`;

const load = (repo: string) => loadRuleCatalog(repo, loadConfig(repo).config);

const writePlugin = (repo: string, name: string, source: string): void => {
  const dir = path.join(repo, 'node_modules', ...name.split('/'));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.js'), source);
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Plugin Contract v1 identity: plugin specifiers', () => {
  it.each([
    ['parent traversal', '../outside.cjs'],
    ['nested traversal', './sub/../../outside.cjs'],
    ['traversal inside a package path', 'some-pkg/../../outside'],
    ['absolute posix path', '/etc/outside.cjs'],
    ['windows drive path', 'C:/outside.cjs'],
    ['windows backslash path', '.\\outside.cjs'],
    ['file URL', 'file:///outside.cjs'],
    ['node: scheme', 'node:fs'],
    ['bare node built-in', 'fs'],
    ['bare node built-in subpath', 'fs/promises'],
    ['empty string', ''],
    ['padded string', ' plugin '],
    ['non-string', 42],
    ['empty path segment', 'pkg//sub']
  ])('rejects %s before resolving or executing anything', (_label, specifier) => {
    const { sandbox, repo, marker } = makeRepo([specifier]);
    fs.writeFileSync(path.join(sandbox, 'outside.cjs'), markingPlugin(marker));

    expect(() => load(repo)).toThrow(PluginContractError);
    expect(() => verifyRepo(repo)).toThrow(PluginContractError);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('rejects an absolute path to a real plugin file', () => {
    const { sandbox, repo, marker } = makeRepo([]);
    const target = path.join(sandbox, 'abs-plugin.cjs');
    fs.writeFileSync(target, markingPlugin(marker));
    fs.writeFileSync(path.join(repo, 'playbook.config.json'), JSON.stringify({ version: 1, plugins: [target] }));

    expect(() => load(repo)).toThrow(PluginContractError);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('rejects a ./ path whose real path escapes the repository through a link', () => {
    const { sandbox, repo, marker } = makeRepo(['./linked/plugin.cjs']);
    const outside = path.join(sandbox, 'outside-dir');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'plugin.cjs'), markingPlugin(marker));
    fs.symlinkSync(outside, path.join(repo, 'linked'), 'junction');

    expect(() => load(repo)).toThrow(/outside the repository/);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('keeps loading repo-local ./ plugins and installed packages (scoped and plain)', () => {
    const { repo, marker } = makeRepo(['./local.cjs', 'plain-plugin', '@scope/scoped-plugin']);
    fs.writeFileSync(path.join(repo, 'local.cjs'), `module.exports = { name: 'local', rules: [] };`);
    writePlugin(repo, 'plain-plugin', `module.exports = { name: 'plain', rules: [] };`);
    writePlugin(repo, '@scope/scoped-plugin', `module.exports = { name: 'scoped', rules: [] };`);

    expect(load(repo).notices).toEqual([]);
    expect(fs.existsSync(marker)).toBe(false);
  });

  it('rejects at least every form the published schema marks as forbidden', () => {
    const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../contracts/src/plugin-manifest.schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as {
      properties: { contractVersion: { const: number } };
      required: string[];
      $defs: { pluginSpecifier: { not: { pattern: string } } };
    };
    expect(schema.properties.contractVersion.const).toBe(PLUGIN_CONTRACT_VERSION);
    expect(schema.required).toContain('name');

    const forbidden = new RegExp(schema.$defs.pluginSpecifier.not.pattern);
    const { repo } = makeRepo([]);
    const corpus = ['pkg', '@scope/pkg', 'pkg/sub/file.js', '../x', 'a/../x', '/x', 'C:/x', 'a\\b', 'file:///x', 'node:fs'];
    for (const specifier of corpus) {
      const schemaForbids = forbidden.test(specifier);
      let loaderRejects = false;
      try {
        assertPluginSpecifier(repo, specifier);
      } catch (error) {
        if (!(error instanceof PluginContractError)) throw error;
        loaderRejects = true;
      }
      if (schemaForbids) expect(loaderRejects, specifier).toBe(true);
      else expect(loaderRejects, specifier).toBe(false);
    }
  });

  it('recognizes valid package names and refuses path-like or built-in names', () => {
    for (const name of ['a', 'a-b.c_d', '@s/a']) expect(isPackageName(name), name).toBe(true);
    for (const name of ['', '.a', '_a', 'a/b', '@s', '@s/a/b', 'fs', 'node:fs', '../a', 'a b']) expect(isPackageName(name), name).toBe(false);
  });
});

describe('Plugin Contract v1 identity: plugin shape', () => {
  it('fails closed on a plugin whose rules are not executable', () => {
    const { repo } = makeRepo(['bad-plugin']);
    writePlugin(repo, 'bad-plugin', `module.exports = { name: 'bad', rules: [{ id: 'bad.rule', description: 'no check' }] };`);
    expect(() => load(repo)).toThrow(/rules\[0\]\.check must be a function/);
  });

  it('fails closed on a plugin with a non-function detector and a non-array rules list', () => {
    const detector = makeRepo(['bad-detector']);
    writePlugin(detector.repo, 'bad-detector', `module.exports = { name: 'd', detectors: [{ id: 'x', label: 'X' }] };`);
    expect(() => load(detector.repo)).toThrow(/detectors\[0\]\.detect must be a function/);

    const list = makeRepo(['bad-list']);
    writePlugin(list.repo, 'bad-list', `module.exports = { name: 'l', rules: 'nope' };`);
    expect(() => load(list.repo)).toThrow(/"rules" must be an array/);
  });

  it('skips a module that does not export a named plugin, with a notice', () => {
    for (const source of [`module.exports = null;`, `module.exports = 7;`, `module.exports = { rules: [] };`]) {
      const { repo } = makeRepo(['anon-plugin']);
      writePlugin(repo, 'anon-plugin', source);
      expect(load(repo).notices.join('\n')).toMatch(/does not export a plugin object/);
    }
  });

  it('rejects a plugin with an empty name', () => {
    const { repo } = makeRepo(['empty-name']);
    writePlugin(repo, 'empty-name', `module.exports = { name: '  ', rules: [] };`);
    expect(() => load(repo)).toThrow(/"name" must be a non-empty string/);
  });

  it('requires a string description on every rule (fails if the description guard is removed)', () => {
    const { repo } = makeRepo(['no-description']);
    writePlugin(repo, 'no-description', `module.exports = { name: 'nd', rules: [{ id: 'nd.rule', check: () => ({ failures: [] }) }] };`);
    expect(() => load(repo)).toThrow(/rules\[0\]\.description must be a string/);
  });

  it('requires a string label on every detector (fails if the label guard is removed)', () => {
    const { repo } = makeRepo(['no-label']);
    writePlugin(repo, 'no-label', `module.exports = { name: 'nl', detectors: [{ id: 'nl.detector', detect: () => [] }] };`);
    expect(() => load(repo)).toThrow(/detectors\[0\]\.label must be a string/);
  });

  it('requires a non-empty string id on every rule (fails if the id guard is removed)', () => {
    for (const id of ['', '7', 'null']) {
      const literal = id === '' ? `''` : id;
      const { repo } = makeRepo(['bad-id']);
      writePlugin(repo, 'bad-id', `module.exports = { name: 'bi', rules: [{ id: ${literal}, description: 'd', check: () => ({ failures: [] }) }] };`);
      expect(() => load(repo), id).toThrow(/rules\[0\]\.id must be a non-empty string/);
    }
  });

  it('rejects a rule or detector entry that is not an object (fails if the object guard is removed)', () => {
    for (const [key, entry] of [['rules', 'null'], ['rules', `'a-string'`], ['detectors', '42']] as const) {
      const { repo } = makeRepo(['non-object-entry']);
      writePlugin(repo, 'non-object-entry', `module.exports = { name: 'noe', ${key}: [${entry}] };`);
      expect(() => load(repo), `${key} ${entry}`).toThrow(new RegExp(`${key}\\[0\\] must be an object`));
    }
  });

  it('checks contractVersion before the shape: a v2 plugin with a malformed shape is skipped, not thrown', () => {
    const { repo } = makeRepo(['future-bad']);
    writePlugin(repo, 'future-bad', `module.exports = { name: '', contractVersion: 2, rules: [{ id: '' }] };`);
    const catalog = load(repo);
    expect(catalog.notices.join('\n')).toMatch(/Plugin skipped/);
    // Same shape at the supported version must throw, proving only the version check kept the first case quiet.
    const supported = makeRepo(['now-bad']);
    writePlugin(supported.repo, 'now-bad', `module.exports = { name: '', contractVersion: 1, rules: [{ id: '' }] };`);
    expect(() => load(supported.repo)).toThrow(/"name" must be a non-empty string/);
  });

  it('skips non-v1 contract versions of every JSON type, never partially loading them', () => {
    for (const version of ['2', '"1"', '0', 'null', '1.5', 'true']) {
      const { repo } = makeRepo(['versioned']);
      writePlugin(repo, 'versioned', `module.exports = { name: 'v', contractVersion: ${version}, rules: [{ id: 'v.rule', description: 'd', check: () => ({ failures: [] }) }] };`);
      const catalog = load(repo);
      expect(catalog.rules.map((rule) => rule.id), version).not.toContain('v.rule');
      expect(catalog.notices.join('\n'), version).toMatch(/Plugin skipped/);
    }
  });

  it('ignores a duplicate listing and a second plugin that reuses a name; the first one wins', () => {
    const { repo } = makeRepo(['first-plugin', 'first-plugin', 'second-plugin']);
    writePlugin(repo, 'first-plugin', `module.exports = { name: 'same', rules: [{ id: 'first.rule', description: 'd', check: () => ({ failures: [] }) }] };`);
    writePlugin(repo, 'second-plugin', `module.exports = { name: 'same', rules: [{ id: 'second.rule', description: 'd', check: () => ({ failures: [] }) }] };`);

    const catalog = load(repo);
    const ids = catalog.rules.map((rule) => rule.id);
    expect(ids).toContain('first.rule');
    expect(ids).not.toContain('second.rule');
    expect(catalog.notices.join('\n')).toMatch(/listed more than once/);
    expect(catalog.notices.join('\n')).toMatch(/reuses the name "same"/);
  });

  it('never lets a plugin replace a core rule id', () => {
    const baseline = makeRepo([]);
    const core = load(baseline.repo).rules.find((rule) => rule.id === 'release.version-governance');
    expect(core).toBeDefined();

    const { repo } = makeRepo(['shadow-plugin']);
    writePlugin(repo, 'shadow-plugin', `module.exports = { name: 's', rules: [{ id: 'release.version-governance', description: 'shadow', check: () => ({ failures: [{ id: 'shadow', message: 'shadow' }] }) }] };`);
    const shadowed = load(repo).rules.find((rule) => rule.id === 'release.version-governance');
    expect(shadowed?.description).toBe(core?.description);
    expect(shadowed?.description).not.toBe('shadow');
  });
});

describe('Plugin Contract v1 identity: legacy predicate shim', () => {
  it('does not follow a dependency name that escapes node_modules', () => {
    const { repo, marker } = makeRepo([], { 'playbook-plugin-x/../../outside': '1.0.0' });
    fs.mkdirSync(path.join(repo, 'node_modules', 'playbook-plugin-x'), { recursive: true });
    fs.mkdirSync(path.join(repo, 'outside'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, 'outside', 'index.js'),
      `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran'); module.exports = { rules: [{ id: 'esc.rule', description: 'd', verify: () => true }] };`
    );

    const catalog = load(repo);
    expect(fs.existsSync(marker)).toBe(false);
    expect(catalog.entries.every((entry) => entry.source === 'core')).toBe(true);
  });
});
