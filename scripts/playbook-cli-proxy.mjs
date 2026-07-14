#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLAYBOOK_REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const targetRepoRoot = process.cwd();
const forwardedArgs = process.argv.slice(2);

const resolvePnpmCommand = (args) => {
  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', 'pnpm', ...args]
    };
  }

  return {
    command: 'pnpm',
    args
  };
};

const commandArgs = ['--silent', 'playbook', '--repo', targetRepoRoot, ...forwardedArgs];
const resolved = resolvePnpmCommand(commandArgs);
const result = spawnSync(resolved.command, resolved.args, {
  cwd: PLAYBOOK_REPO_ROOT,
  stdio: 'inherit',
  env: process.env,
  encoding: 'utf8'
});

process.exit(result.status ?? 1);
