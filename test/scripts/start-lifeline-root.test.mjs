import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const readStartContract = () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const startCommand = packageJson.scripts?.['start:lifeline'];
  assert.equal(typeof startCommand, 'string');

  const tokens = startCommand.trim().split(/\s+/);
  assert.deepEqual(tokens.slice(0, 2), ['pnpm', 'playbook']);

  const optionValue = (name) => {
    assert.equal(tokens.filter((token) => token === name).length, 1, `${name} must appear exactly once`);
    const index = tokens.indexOf(name);
    assert.ok(index >= 0 && tokens[index + 1], `${name} must have one value`);
    return tokens[index + 1];
  };

  return {
    startCommand,
    repoRoot: optionValue('--repo'),
    host: optionValue('--host'),
    port: optionValue('--port'),
    observerRoot: optionValue('--root')
  };
};

test('start:lifeline pins lifecycle telemetry and Observer state to the canonical Atlas runtime home', () => {
  const { startCommand, repoRoot: lifecycleRootArgument, host, port, observerRoot } = readStartContract();

  assert.match(startCommand, /^pnpm playbook --repo \S+ observer serve /);
  assert.equal(host, '127.0.0.1');
  assert.equal(port, '4300');
  assert.equal(lifecycleRootArgument, '../../runtime/playbook/observer');
  assert.equal(observerRoot, '.');
  assert.equal(path.isAbsolute(lifecycleRootArgument), false);
  assert.equal(path.isAbsolute(observerRoot), false);
  assert.doesNotMatch(lifecycleRootArgument, /^[A-Za-z]:[\\/]|^\\\\/);
  assert.doesNotMatch(observerRoot, /^[A-Za-z]:[\\/]|^\\\\/);

  const atlasRoot = path.join(repoRoot, '.atlas-topology-contract');
  const canonicalRepoWorkingDirectory = path.join(atlasRoot, 'repos', 'playbook');
  const canonicalObserverHome = path.join(atlasRoot, 'runtime', 'playbook', 'observer');

  const lifecycleRoot = path.resolve(canonicalRepoWorkingDirectory, lifecycleRootArgument);
  assert.equal(lifecycleRoot, canonicalObserverHome);
  assert.equal(path.resolve(lifecycleRoot, observerRoot), canonicalObserverHome);
  assert.equal(
    path.relative(canonicalRepoWorkingDirectory, canonicalObserverHome).split(path.sep).join('/'),
    lifecycleRootArgument
  );
});

test('the Lifeline app contract keeps repository-root start semantics', () => {
  const manifest = fs.readFileSync(path.join(repoRoot, '.lifeline', 'playbook.lifeline.yml'), 'utf8');

  assert.match(manifest, /^startCommand: pnpm start:lifeline\r?$/m);
  assert.match(manifest, /^  workingDirectory: \.\.\r?$/m);
});
