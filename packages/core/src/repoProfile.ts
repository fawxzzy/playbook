import fs from 'node:fs';
import path from 'node:path';

/**
 * Repository profile used to scope Playbook-product-only governance checks.
 *
 * - `product`: the Playbook product repository itself. Product-only checks (docs anchors, command-truth contract,
 *   repo-roadmap/story contract, architecture-audit hardening docs) apply.
 * - `consumer`: a repository that consumes Playbook. Product-only checks do not apply; checks that make sense for
 *   any repository (README/AGENTS/ARCHITECTURE anchors, managed docs, notes-on-change, verify, artifact hygiene) still do.
 *
 * Resolution is deterministic and fails closed: any unknown or ambiguous input resolves to `product`, so a check is
 * never silently skipped on the Playbook repo.
 */
export type RepoProfile = 'product' | 'consumer';

export type RepoProfileSource = 'config' | 'product-layout' | 'consumer-evidence' | 'fail-closed';

export type RepoProfileResolution = {
  profile: RepoProfile;
  source: RepoProfileSource;
  /** Stable, human-readable explanation of why this profile was chosen. */
  reason: string;
};

/** Top-level `playbook.config.json` field: explicit classification that always wins when valid. */
export const REPO_TYPE_CONFIG_FIELD = 'repoType';

/** Package names that identify the Playbook CLI package layout (`packages/cli/package.json`). */
const PRODUCT_CLI_PACKAGE_NAMES = new Set(['@fawxzzy/playbook', '@zachariahredfield/playbook']);
const PRODUCT_ROOT_PACKAGE_NAME = 'playbook-monorepo';
const PRODUCT_COMMAND_TRUTH_PATH = 'docs/contracts/command-truth.json';

/** Evidence that a repository adopted Playbook as a consumer (none of these exist by accident in an unrelated repo). */
const CONSUMER_EVIDENCE_PATHS = [
  'playbook.config.json',
  '.playbookignore',
  // Not the bare `.playbook/` directory: Playbook commands create it as run output, so it would flip the profile mid-run.
  '.playbook/README.md',
  'scripts/playbook-runtime.mjs',
  'docs/PLAYBOOK_NOTES.md'
] as const;

type JsonRead = { kind: 'missing' } | { kind: 'invalid' } | { kind: 'ok'; value: unknown };

const readJson = (repoRoot: string, relativePath: string): JsonRead => {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    return { kind: 'missing' };
  }

  try {
    return { kind: 'ok', value: JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown };
  } catch {
    return { kind: 'invalid' };
  }
};

const packageName = (read: JsonRead): string | undefined => {
  if (read.kind !== 'ok' || !read.value || typeof read.value !== 'object' || Array.isArray(read.value)) {
    return undefined;
  }
  const name = (read.value as Record<string, unknown>).name;
  return typeof name === 'string' ? name : undefined;
};

const detectProductSignals = (repoRoot: string): string[] => {
  const signals: string[] = [];

  if (packageName(readJson(repoRoot, 'package.json')) === PRODUCT_ROOT_PACKAGE_NAME) {
    signals.push(`package.json name is ${PRODUCT_ROOT_PACKAGE_NAME}`);
  }

  const cliName = packageName(readJson(repoRoot, 'packages/cli/package.json'));
  if (cliName && PRODUCT_CLI_PACKAGE_NAMES.has(cliName)) {
    signals.push(`packages/cli/package.json declares the Playbook CLI package (${cliName})`);
  }

  // Consumers may keep their own consumer-scoped command-truth.json (ladders only); only the generated product
  // contract, which carries the full command list, counts as product evidence.
  const commandTruth = readJson(repoRoot, PRODUCT_COMMAND_TRUTH_PATH);
  if (commandTruth.kind === 'ok' && commandTruth.value && typeof commandTruth.value === 'object' && Array.isArray((commandTruth.value as Record<string, unknown>).commandTruth)) {
    signals.push(`${PRODUCT_COMMAND_TRUTH_PATH} carries the Playbook command list`);
  }

  return signals;
};

const failClosed = (reason: string): RepoProfileResolution => ({ profile: 'product', source: 'fail-closed', reason });

export const resolveRepoProfile = (repoRoot: string): RepoProfileResolution => {
  // 1. Explicit config wins. An unreadable config or an unknown value is ambiguous and fails closed.
  const config = readJson(repoRoot, 'playbook.config.json');
  if (config.kind === 'invalid') {
    return failClosed('playbook.config.json is not valid JSON; keeping product checks.');
  }

  if (config.kind === 'ok') {
    if (!config.value || typeof config.value !== 'object' || Array.isArray(config.value)) {
      return failClosed('playbook.config.json is not a JSON object; keeping product checks.');
    }
    const declared = (config.value as Record<string, unknown>)[REPO_TYPE_CONFIG_FIELD];
    if (declared === 'product' || declared === 'consumer') {
      return { profile: declared, source: 'config', reason: `playbook.config.json ${REPO_TYPE_CONFIG_FIELD} is "${declared}".` };
    }
    if (declared !== undefined) {
      return failClosed(`playbook.config.json ${REPO_TYPE_CONFIG_FIELD} must be "product" or "consumer"; keeping product checks.`);
    }
  }

  // 2. The Playbook product layout is positive evidence for `product`.
  const productSignals = detectProductSignals(repoRoot);
  if (productSignals.length > 0) {
    return { profile: 'product', source: 'product-layout', reason: `Playbook product layout detected: ${productSignals.join('; ')}.` };
  }

  // 3. `consumer` needs positive adoption evidence AND no product signal.
  const evidence = CONSUMER_EVIDENCE_PATHS.filter((relativePath) => fs.existsSync(path.join(repoRoot, relativePath)));
  if (evidence.length > 0) {
    return {
      profile: 'consumer',
      source: 'consumer-evidence',
      reason: `No Playbook product layout and Playbook adoption evidence found: ${evidence.join(', ')}.`
    };
  }

  // 4. Nothing identifies the repo either way: fail closed.
  return failClosed(`No ${REPO_TYPE_CONFIG_FIELD} config, product layout, or Playbook adoption evidence; keeping product checks.`);
};

export const isProductRepo = (repoRoot: string): boolean => resolveRepoProfile(repoRoot).profile === 'product';
