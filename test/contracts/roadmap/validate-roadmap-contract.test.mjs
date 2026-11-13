import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const validatorPath = path.join(repoRoot, 'scripts', 'validate-roadmap-contract.mjs');

const createRoadmapFixture = (cwd, commandNames = ['verify']) => {
  const roadmapDir = path.join(cwd, 'docs', 'roadmap');
  const contractsDir = path.join(cwd, 'docs', 'contracts');
  fs.mkdirSync(roadmapDir, { recursive: true });
  fs.mkdirSync(contractsDir, { recursive: true });
  fs.writeFileSync(
    path.join(roadmapDir, 'ROADMAP.json'),
    JSON.stringify(
      {
        schemaVersion: '1.0',
        features: [
          {
            feature_id: 'PB-V08-KNOWLEDGE-COMPACTION-SPEC-001',
            version: 'v0.9',
            title: 'Knowledge Compaction Phase deterministic foundations',
            goal: 'Test fixture',
            commands: commandNames,
            contracts: [],
            tests: [],
            docs: [],
            dependencies: [],
            package_ownership: ['@fawxzzy/playbook'],
            verification_commands: ['node scripts/validate-roadmap-contract.mjs --ci'],
            status: 'in-progress'
          }
        ]
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(contractsDir, 'command-truth.json'),
    JSON.stringify(
      {
        commandTruth: commandNames.map((name) => ({ name, productFacing: true }))
      },
      null,
      2
    )
  );
};

const runValidator = ({ title = '', body = '', metadataFeatureIds = null, roadmapCommandNames = ['verify'], liveCommandNames = ['verify'] }) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-roadmap-validator-'));
  createRoadmapFixture(tempDir, roadmapCommandNames);

  if (JSON.stringify(liveCommandNames) !== JSON.stringify(roadmapCommandNames)) {
    const contractsDir = path.join(tempDir, 'docs', 'contracts');
    fs.writeFileSync(
      path.join(contractsDir, 'command-truth.json'),
      JSON.stringify({ commandTruth: liveCommandNames.map((name) => ({ name, productFacing: true })) }, null, 2)
    );
  }

  const eventPath = path.join(tempDir, 'event.json');
  fs.writeFileSync(eventPath, JSON.stringify({ pull_request: { title, body } }, null, 2));

  if (metadataFeatureIds) {
    const metadataDir = path.join(tempDir, '.playbook');
    fs.mkdirSync(metadataDir, { recursive: true });
    fs.writeFileSync(path.join(metadataDir, 'pr-metadata.json'), JSON.stringify({ featureIds: metadataFeatureIds }, null, 2));
  }

  return spawnSync('node', [validatorPath, '--ci', '--enforce-pr-feature-id'], {
    cwd: tempDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_PATH: eventPath
    }
  });
};

test('passes when PR title contains valid feature_id', () => {
  const result = runValidator({ title: 'PB-V08-KNOWLEDGE-COMPACTION-SPEC-001: update docs' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /roadmap-contract: ok/);
});

test('passes when PR body contains valid feature_id', () => {
  const result = runValidator({ body: 'Feature linkage: PB-V08-KNOWLEDGE-COMPACTION-SPEC-001' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /roadmap-contract: ok/);
});

test('passes with warning when repo metadata artifact contains valid feature_id but PR metadata does not', () => {
  const result = runValidator({
    title: 'No feature id in title',
    body: 'No feature id in body',
    metadataFeatureIds: ['PB-V08-KNOWLEDGE-COMPACTION-SPEC-001']
  });
  assert.equal(result.status, 0);
  assert.match(result.stderr, /warning: pull request title\/body missing roadmap feature_id/);
  assert.match(result.stdout, /roadmap-contract: ok/);
});

test('fails when neither PR metadata nor repo artifact contains valid feature_id', () => {
  const result = runValidator({ title: 'Missing id', body: 'Still missing id' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PR feature-id enforcement failed/);
});

test('ignores invalid repo artifact feature_ids and fails deterministically', () => {
  const result = runValidator({
    title: 'Missing id',
    body: 'Still missing id',
    metadataFeatureIds: ['PB-V99-NON-EXISTENT-001']
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PR feature-id enforcement failed/);
});


test('fails when roadmap includes command not present in command truth contract', () => {
  const result = runValidator({
    title: 'PB-V08-KNOWLEDGE-COMPACTION-SPEC-001: update docs',
    roadmapCommandNames: ['verify', 'ghost-command'],
    liveCommandNames: ['verify']
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown live command "ghost-command"/);
});

test('fails when roadmap feature command list contains duplicates', () => {
  const result = runValidator({
    title: 'PB-V08-KNOWLEDGE-COMPACTION-SPEC-001: update docs',
    roadmapCommandNames: ['verify', 'verify'],
    liveCommandNames: ['verify']
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /commands contains duplicate entries: verify/);
});

const runWithFeatureOverrides = (overrides, { files = [] } = {}) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-roadmap-validator-'));
  createRoadmapFixture(tempDir);
  const roadmapFile = path.join(tempDir, 'docs', 'roadmap', 'ROADMAP.json');
  const roadmap = JSON.parse(fs.readFileSync(roadmapFile, 'utf8'));
  Object.assign(roadmap.features[0], overrides);
  fs.writeFileSync(roadmapFile, JSON.stringify(roadmap, null, 2));
  for (const relativePath of files) {
    fs.mkdirSync(path.dirname(path.join(tempDir, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(tempDir, relativePath), 'fixture\n');
  }
  return spawnSync('node', [validatorPath], { cwd: tempDir, encoding: 'utf8' });
};

test('fails when a shipped feature of any roadmap version declares a missing test path', () => {
  const result = runWithFeatureOverrides({
    version: 'v0.3',
    status: 'implemented-hardening',
    tests: ['tests/contracts/does-not-exist.test.ts']
  });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes('tests references missing path: tests/contracts/does-not-exist.test.ts'), result.stderr);
});

test('fails when an implemented feature declares a missing contract path', () => {
  const result = runWithFeatureOverrides({ status: 'implemented', contracts: ['docs/contracts/NOT_THERE.md'] });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes('contracts references missing path: docs/contracts/NOT_THERE.md'), result.stderr);
});

test('fails when an in-progress feature declares a command that is not live', () => {
  const result = runWithFeatureOverrides({ version: 'v0.6', status: 'in-progress', commands: ['verify', 'failure'] });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes('unknown live command "failure"'), result.stderr);
});

test('allows planned features to declare artifacts that do not exist yet', () => {
  const result = runWithFeatureOverrides({
    status: 'planned',
    contracts: ['docs/contracts/FUTURE.md'],
    docs: ['docs/commands/future.md'],
    tests: ['tests/future.test.ts']
  });
  assert.equal(result.status, 0, result.stderr);
});

test('does not treat docs/commands/README.md as a command family', () => {
  const result = runWithFeatureOverrides(
    { status: 'implemented-hardening', docs: ['docs/commands/README.md'] },
    { files: ['docs/commands/README.md'] }
  );
  assert.equal(result.status, 0, result.stderr);
});
