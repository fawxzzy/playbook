import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const hasExplicitFileParallelism = args.some((arg) => arg.startsWith('--fileParallelism'));
const hasExplicitPool = args.some((arg) => arg.startsWith('--pool'));
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const requireFromRepoRoot = createRequire(path.join(repoRoot, 'package.json'));
const vitestEntry = requireFromRepoRoot.resolve('vitest/vitest.mjs');

const run = (command, commandArgs, options = {}) => spawnSync(command, commandArgs, {
  stdio: 'inherit',
  shell: false,
  ...options
});

const exitWith = (result) => {
  if (typeof result.status === 'number') process.exit(result.status);
  process.exit(1);
};

const defaultVitestArgs = ['run'];

// Windows engine tests are git- and temp-heavy; serial file execution avoids worker timeout pressure.
if (process.platform === 'win32' && !hasExplicitFileParallelism) {
  defaultVitestArgs.push('--fileParallelism=false');
}

// Explicit thread workers avoid the Windows worker RPC timeout seen at suite teardown.
if (process.platform === 'win32' && !hasExplicitPool) {
  defaultVitestArgs.push('--pool=threads');
}

if (!fs.existsSync(vitestEntry)) {
  console.error(`Vitest entry not found at ${vitestEntry}. Run workspace install before executing package tests.`);
  process.exit(1);
}

const result = run(process.execPath, [vitestEntry, ...defaultVitestArgs, ...args], { cwd: packageRoot });
exitWith(result);
