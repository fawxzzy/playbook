import fs from 'node:fs';
import path from 'node:path';
import { builtinModules, createRequire } from 'node:module';
import { PLUGIN_CONTRACT_VERSION } from './pluginTypes.js';

/**
 * Plugin identity and shape checks for Plugin Contract v1
 * (docs/contracts/PLUGIN_CONTRACT_V1.md). Everything here is deterministic and read-only: it decides
 * whether a `playbook.config.json` `plugins` entry may be handed to `require`, and whether the loaded
 * export is a v1 plugin. Both the unified loader and the deprecated predicate shim go through it.
 */

export class PluginContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginContractError';
  }
}

const BARE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._~-]*$/;
const SCOPE_SEGMENT = /^@[A-Za-z0-9][A-Za-z0-9._~-]*$/;
const SUBPATH_SEGMENT = /^[A-Za-z0-9._~-]+$/;
const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const builtins = new Set<string>(builtinModules.flatMap((name) => [name, `node:${name}`]));

/** True for a valid npm package name (optionally scoped), no path segments. */
export const isPackageName = (name: unknown): name is string => {
  if (typeof name !== 'string' || name.length === 0 || name.length > 214) return false;
  const parts = name.split('/');
  if (parts.length === 1) return BARE_SEGMENT.test(parts[0]!) && !builtins.has(name);
  return parts.length === 2 && SCOPE_SEGMENT.test(parts[0]!) && BARE_SEGMENT.test(parts[1]!);
};

const isInside = (parent: string, child: string): boolean => {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

/**
 * A plugin specifier is either
 *  - a bare package specifier (`name`, `@scope/name`, optionally with a `/sub/path` that has no `.`/`..` segment), or
 *  - a repo-local file that starts with `./`, has no `..` segment, and whose real path stays inside the repository.
 * Everything else (absolute or drive paths, backslashes, `..`, URLs/`file:`/`node:` schemes, Node built-ins,
 * control characters) is rejected before anything is resolved or executed.
 */
export const assertPluginSpecifier = (repoRoot: string, specifier: unknown): string => {
  if (typeof specifier !== 'string' || specifier.length === 0 || specifier !== specifier.trim()) {
    throw new PluginContractError(`Plugin specifier must be a non-empty string without surrounding whitespace: ${JSON.stringify(specifier)}`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(specifier)) {
    throw new PluginContractError(`Plugin specifier "${specifier}" contains a control character or backslash.`);
  }
  if (URL_SCHEME.test(specifier) || path.isAbsolute(specifier) || /^[A-Za-z]:/.test(specifier) || specifier.startsWith('//')) {
    throw new PluginContractError(`Plugin specifier "${specifier}" must be a package name or a ./ path inside the repository (no absolute paths or URL schemes).`);
  }

  const segments = specifier.split('/');
  if (segments.includes('..') || segments.some((segment, index) => segment === '.' && index > 0) || segments.includes('')) {
    throw new PluginContractError(`Plugin specifier "${specifier}" must not contain "..", empty or "." path segments.`);
  }

  if (specifier.startsWith('./')) {
    let resolved: string;
    let realRoot: string;
    try {
      realRoot = fs.realpathSync(repoRoot);
      resolved = fs.realpathSync(createRequire(path.join(repoRoot, 'package.json')).resolve(specifier));
    } catch {
      throw new PluginContractError(`Plugin "${specifier}" could not be resolved inside the repository.`);
    }
    if (!isInside(realRoot, resolved)) {
      throw new PluginContractError(`Plugin "${specifier}" resolves outside the repository root.`);
    }
    return specifier;
  }

  const [first, second, ...rest] = segments;
  const scoped = first!.startsWith('@');
  const nameOk = scoped ? SCOPE_SEGMENT.test(first!) && second !== undefined && BARE_SEGMENT.test(second) : BARE_SEGMENT.test(first!);
  const subpath = scoped ? rest : [second, ...rest].filter((segment): segment is string => segment !== undefined);
  const packageName = scoped ? `${first}/${second}` : first!;
  if (!nameOk || builtins.has(specifier) || builtins.has(packageName) || !subpath.every((segment) => SUBPATH_SEGMENT.test(segment))) {
    throw new PluginContractError(`Plugin specifier "${specifier}" is not a valid package name or ./ repository path.`);
  }
  return specifier;
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Picks the plugin object from a loaded module (`module.exports` or `default`), or undefined when there is none. */
export const pickPluginExport = (loaded: unknown): Record<string, unknown> | undefined => {
  if (!isObject(loaded)) return undefined;
  if ('name' in loaded) return loaded;
  return isObject(loaded.default) ? loaded.default : undefined;
};

/**
 * Structural v1 check of a plugin export: identity (`name`), contract version and that every declared rule and
 * detector is executable. Returns violations; an empty list means the plugin is a well-formed v1 plugin.
 * An unsupported `contractVersion` is reported separately by the loader (skip with a notice).
 */
export const validatePluginShape = (plugin: Record<string, unknown>): string[] => {
  const problems: string[] = [];
  if (typeof plugin.name !== 'string' || plugin.name.trim() === '') problems.push('"name" must be a non-empty string');

  const checkList = (key: 'rules' | 'detectors', fn: string, label?: string): void => {
    const list = plugin[key];
    if (list === undefined) return;
    if (!Array.isArray(list)) {
      problems.push(`"${key}" must be an array`);
      return;
    }
    list.forEach((entry, index) => {
      const where = `${key}[${index}]`;
      if (!isObject(entry)) return void problems.push(`${where} must be an object`);
      if (typeof entry.id !== 'string' || entry.id === '') problems.push(`${where}.id must be a non-empty string`);
      if (label && typeof entry[label] !== 'string') problems.push(`${where}.${label} must be a string`);
      if (typeof entry[fn] !== 'function') problems.push(`${where}.${fn} must be a function`);
    });
  };
  checkList('rules', 'check', 'description');
  checkList('detectors', 'detect', 'label');
  return problems;
};

export const isSupportedContractVersion = (value: unknown): boolean => value === undefined || value === PLUGIN_CONTRACT_VERSION;
