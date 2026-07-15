import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const preflightPath = path.join(repoRoot, 'scripts', 'ensure-lifeline-observer-home.mjs');

const readStartContract = () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const startCommand = packageJson.scripts?.['start:lifeline'];
  assert.equal(typeof startCommand, 'string');

  const commandSegments = startCommand.split(' && ');
  assert.equal(commandSegments.length, 2, 'start:lifeline must initialize then serve');
  const [initializeCommand, serveCommand] = commandSegments;
  const initializeMatch = initializeCommand.match(/^node scripts\/ensure-lifeline-observer-home\.mjs (\S+)$/);
  assert.ok(initializeMatch, 'start:lifeline must create its runtime home recursively');

  const tokens = serveCommand.trim().split(/\s+/);
  assert.deepEqual(tokens.slice(0, 2), ['pnpm', 'playbook']);

  const optionValue = (name) => {
    assert.equal(tokens.filter((token) => token === name).length, 1, `${name} must appear exactly once`);
    const index = tokens.indexOf(name);
    assert.ok(index >= 0 && tokens[index + 1], `${name} must have one value`);
    return tokens[index + 1];
  };

  return {
    startCommand,
    initializedRoot: initializeMatch[1],
    repoRoot: optionValue('--repo'),
    host: optionValue('--host'),
    port: optionValue('--port'),
    observerRoot: optionValue('--root')
  };
};

test('start:lifeline pins lifecycle telemetry and Observer state to the canonical Atlas runtime home', () => {
  const { startCommand, initializedRoot, repoRoot: lifecycleRootArgument, host, port, observerRoot } = readStartContract();

  assert.match(startCommand, / && pnpm playbook --repo \S+ observer serve /);
  assert.equal(host, '127.0.0.1');
  assert.equal(port, '4300');
  assert.equal(initializedRoot, '../../runtime/playbook/observer');
  assert.equal(lifecycleRootArgument, '../../runtime/playbook/observer');
  assert.equal(observerRoot, '.');
  assert.equal(path.isAbsolute(initializedRoot), false);
  assert.equal(path.isAbsolute(lifecycleRootArgument), false);
  assert.equal(path.isAbsolute(observerRoot), false);
  assert.doesNotMatch(initializedRoot, /^[A-Za-z]:[\\/]|^\\\\/);
  assert.doesNotMatch(lifecycleRootArgument, /^[A-Za-z]:[\\/]|^\\\\/);
  assert.doesNotMatch(observerRoot, /^[A-Za-z]:[\\/]|^\\\\/);

  const atlasRoot = path.join(repoRoot, '.atlas-topology-contract');
  const canonicalRepoWorkingDirectory = path.join(atlasRoot, 'repos', 'playbook');
  const canonicalObserverHome = path.join(atlasRoot, 'runtime', 'playbook', 'observer');

  const lifecycleRoot = path.resolve(canonicalRepoWorkingDirectory, lifecycleRootArgument);
  assert.equal(path.resolve(canonicalRepoWorkingDirectory, initializedRoot), canonicalObserverHome);
  assert.equal(lifecycleRoot, canonicalObserverHome);
  assert.equal(path.resolve(lifecycleRoot, observerRoot), canonicalObserverHome);
  assert.equal(
    path.relative(canonicalRepoWorkingDirectory, canonicalObserverHome).split(path.sep).join('/'),
    lifecycleRootArgument
  );
});

test('the Lifeline runtime-home preflight fails closed when the home cannot be created', () => {
  const atlasRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-lifeline-preflight-'));
  try {
    const sourceCheckout = path.join(atlasRoot, 'repos', 'playbook');
    fs.mkdirSync(sourceCheckout, { recursive: true });
    fs.writeFileSync(path.join(atlasRoot, 'runtime'), 'blocks runtime directory creation', 'utf8');

    const result = spawnSync(process.execPath, [preflightPath, '../../runtime/playbook/observer'], {
      cwd: sourceCheckout,
      encoding: 'utf8'
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /^ensure-lifeline-observer-home: failed to create \.\.\/\.\.\/runtime\/playbook\/observer \([A-Z]+\)\r?\n$/);
    assert.equal(fs.existsSync(path.join(sourceCheckout, '.playbook')), false);
  } finally {
    fs.rmSync(atlasRoot, { recursive: true, force: true });
  }
});

test('the Lifeline app contract keeps repository-root start semantics', () => {
  const manifest = fs.readFileSync(path.join(repoRoot, '.lifeline', 'playbook.lifeline.yml'), 'utf8');

  assert.match(manifest, /^startCommand: pnpm start:lifeline\r?$/m);
  assert.match(manifest, /^  workingDirectory: \.\.\r?$/m);
});
