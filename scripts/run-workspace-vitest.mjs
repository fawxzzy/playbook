#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const PNPM_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const packageRelativePath = path.relative(repoRoot, process.cwd()).replace(/\\/g, '/');
const result = spawnSync(PNPM_BIN, ['exec', 'vitest', '--root', packageRelativePath, ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
