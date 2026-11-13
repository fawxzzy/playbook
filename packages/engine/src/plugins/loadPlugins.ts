import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { registerPlugin } from './pluginRegistry.js';
import { PLUGIN_CONTRACT_VERSION, type PlaybookPlugin } from './pluginTypes.js';

type PluginConfig = {
  plugins?: string[];
};

export type LoadedPlugins = {
  /** Plugin specifiers listed in `playbook.config.json` `plugins`, in order. */
  configured: string[];
  /** Plugins that were registered (contract-compatible). */
  plugins: PlaybookPlugin[];
  /** Human-readable, non-fatal notes (for example skipped incompatible plugins). */
  notices: string[];
};

export const loadPlugins = (repoRoot: string): LoadedPlugins => {
  const result: LoadedPlugins = { configured: [], plugins: [], notices: [] };
  const configPath = path.join(repoRoot, 'playbook.config.json');
  if (!fs.existsSync(configPath)) return result;

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as PluginConfig;
  const plugins = Array.isArray(parsed.plugins) ? parsed.plugins : [];
  if (!plugins.length) return result;
  result.configured = [...plugins];

  const requireFromRepo = createRequire(path.join(repoRoot, 'package.json'));

  for (const pluginName of plugins) {
    const loaded = requireFromRepo(pluginName) as PlaybookPlugin | { default?: PlaybookPlugin };
    const plugin = ('name' in loaded ? loaded : loaded.default) as PlaybookPlugin | undefined;
    if (!plugin) continue;
    if (plugin.contractVersion !== undefined && plugin.contractVersion !== PLUGIN_CONTRACT_VERSION) {
      result.notices.push(
        `Plugin "${pluginName}" declares contractVersion ${String(plugin.contractVersion)}; this Playbook supports contractVersion ${PLUGIN_CONTRACT_VERSION}. Plugin skipped.`
      );
      continue;
    }
    registerPlugin(plugin);
    result.plugins.push(plugin);
  }

  return result;
};
