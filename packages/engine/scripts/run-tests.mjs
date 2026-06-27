import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;
const hasExplicitFileParallelism = args.some((arg) => arg.startsWith('--fileParallelism'));
const hasExplicitPool = args.some((arg) => arg.startsWith('--pool'));
const PNPM_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');

const run = (command, commandArgs, options = {}) => spawnSync(command, commandArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
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

const result = run(
  PNPM_BIN,
  ['exec', 'vitest', ...defaultVitestArgs, '--root', 'packages/engine', ...args],
  { cwd: repoRoot }
);
exitWith(result);
