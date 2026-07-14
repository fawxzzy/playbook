import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { applyPlaybookDemoManagedDocsCompatibility } from '../../scripts/demo-managed-docs-compat.mjs';
import { writeCommandTruthContract } from '../../scripts/managed-docs-lib.mjs';
import {
  createPatchedNodeArgs,
  createScriptEnv,
  nodeCommand,
  repoRootFromImportMeta,
  resolvePackageManagerCommand
} from './helpers/runtime-test-utils.mjs';

const repoRoot = repoRootFromImportMeta(import.meta.url);
const demoRefreshScript = path.join(repoRoot, 'scripts', 'demo-refresh.mjs');
const cliPath = path.join(repoRoot, 'scripts', 'playbook-cli-proxy.mjs');

const requiredAnchorFiles = [
  'README.md',
  'AGENTS.md',
  'docs/index.md',
  'docs/ARCHITECTURE.md',
  'docs/commands/README.md',
  'docs/PLAYBOOK_PRODUCT_ROADMAP.md',
  'docs/PLAYBOOK_BUSINESS_STRATEGY.md',
  'docs/CONSUMER_INTEGRATION_CONTRACT.md',
  'docs/roadmap/README.md',
  'docs/roadmap/ROADMAP.json',
  'docs/roadmap/IMPROVEMENTS_BACKLOG.md',
  'docs/archive/README.md',
  'packages/cli/README.md'
];

const copyRequiredDocs = (targetRoot) => {
  for (const relativePath of requiredAnchorFiles) {
    const sourcePath = path.join(repoRoot, relativePath);
    const targetPath = path.join(targetRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
  }
};

const writePackageLock = (targetRoot, name) => {
  fs.writeFileSync(
    path.join(targetRoot, 'package-lock.json'),
    JSON.stringify(
      {
        name,
        version: '0.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': {
            name,
            version: '0.0.0'
          }
        }
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
};

const writePackageJson = (targetRoot, name) => {
  fs.writeFileSync(
    path.join(targetRoot, 'package.json'),
    JSON.stringify(
      {
        name,
        version: '0.0.0',
        private: true,
        scripts: {
          'refresh:playbook': 'node scripts/refresh-demo-artifacts.mjs'
        }
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
};

const runNode = (cwd, args, env = {}) =>
  spawnSync(nodeCommand, args, {
    cwd,
    encoding: 'utf8',
    env: createScriptEnv(env)
  });

const resolveCommand = (command) => {
  if (process.platform === 'win32' && ['npm', 'pnpm', 'yarn'].includes(command)) {
    return `${command}.cmd`;
  }

  return command;
};

const runCommand = (cwd, command, args, env = {}) =>
  spawnSync(resolvePackageManagerCommand(command).command, [...resolvePackageManagerCommand(command).extraArgs, ...args], {
    cwd,
    encoding: 'utf8',
    env: createScriptEnv(env)
  });

const createDemoRepoFixture = (name) => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  copyRequiredDocs(fixtureRoot);
  fs.mkdirSync(path.join(fixtureRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, '.playbook', 'demo-artifacts'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, '.gitignore'),
    [
      'node_modules/',
      '.playbook/doctrine-candidates.json',
      '.playbook/memory/',
      '.playbook/pattern-review-queue.json',
      '.playbook/patterns.json',
      '.playbook/runtime/'
    ].join('\n') + '\n'
  );
  fs.writeFileSync(
    path.join(fixtureRoot, 'scripts', 'refresh-demo-artifacts.mjs'),
    `#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cliPath = process.env.PLAYBOOK_CLI_PATH;
if (!cliPath) {
  throw new Error('PLAYBOOK_CLI_PATH is required for this fixture.');
}

const result = spawnSync(process.execPath, [cliPath, 'doctor', '--json'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: process.env
});

if (result.status !== 0) {
  process.stderr.write(result.stderr ?? '');
  process.stdout.write(result.stdout ?? '');
  process.exit(result.status ?? 1);
}

fs.mkdirSync(path.join(process.cwd(), '.playbook', 'demo-artifacts'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), '.playbook', 'demo-artifacts', 'doctor.txt'), 'doctor ok\\n');
`
  );

  writePackageJson(fixtureRoot, name);
  writePackageLock(fixtureRoot, name);
  assert.equal(
    fs.existsSync(path.join(fixtureRoot, 'package.json')),
    true,
    'demo refresh fixture must be a valid package before dependency install runs',
  );
  const initResult = runCommand(fixtureRoot, 'git', ['init', '-b', 'main']);
  assert.equal(initResult.status, 0, initResult.stderr || initResult.stdout);
  const addResult = runCommand(fixtureRoot, 'git', ['add', '.']);
  assert.equal(addResult.status, 0, addResult.stderr || addResult.stdout);
  const commitResult = runCommand(fixtureRoot, 'git', ['commit', '-m', 'initial fixture'], {
    GIT_AUTHOR_NAME: 'Playbook Test',
    GIT_AUTHOR_EMAIL: 'playbook-test@example.com',
    GIT_COMMITTER_NAME: 'Playbook Test',
    GIT_COMMITTER_EMAIL: 'playbook-test@example.com'
  });
  assert.equal(commitResult.status, 0, commitResult.stderr || commitResult.stdout);

  return fixtureRoot;
};

const createNestedManagedDocsFixture = (name) => {
  const fixtureRoot = createDemoRepoFixture(name);
  const roadmapPath = path.join(fixtureRoot, 'docs', 'PLAYBOOK_PRODUCT_ROADMAP.md');

  fs.mkdirSync(path.join(fixtureRoot, 'src', 'lib'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, 'src', 'lib', 'demo-governance.js'),
    `import fs from 'node:fs';
import path from 'node:path';

export function regenerateManagedDocs(rootDir = process.cwd()) {
  const commandTruthPath = path.join(rootDir, 'docs', 'contracts', 'command-truth.json');
  fs.mkdirSync(path.dirname(commandTruthPath), { recursive: true });
  fs.writeFileSync(
    commandTruthPath,
    JSON.stringify(
      {
        schemaVersion: '1.0',
        generatedBy: 'fixture-demo-governance',
        commands: ['doctor']
      },
      null,
      2
    ) + '\\n',
    'utf8'
  );
}
`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(fixtureRoot, 'scripts', 'update-managed-docs.mjs'),
    `import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { regenerateManagedDocs } from '../src/lib/demo-governance.js';

function main() {
  const rootDir = process.env.PLAYBOOK_MANAGED_DOCS_ROOT ? path.resolve(process.env.PLAYBOOK_MANAGED_DOCS_ROOT) : process.cwd();
  regenerateManagedDocs(rootDir);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { main };
`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(fixtureRoot, 'scripts', 'refresh-demo-artifacts.mjs'),
    `#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-demo-managed-docs-'));

try {
  for (const relativePath of ['AGENTS.md', 'docs', 'scripts', 'src', 'packages', '.playbook', 'package.json', 'package-lock.json', 'README.md', 'tsconfig.json']) {
    const sourcePath = path.join(rootDir, relativePath);
    if (fs.existsSync(sourcePath)) {
      fs.cpSync(sourcePath, path.join(tempRoot, relativePath), { recursive: true });
    }
  }

  const managedDocs = spawnSync(process.execPath, ['scripts/update-managed-docs.mjs'], {
    cwd: tempRoot,
    encoding: 'utf8',
    env: process.env
  });
  if ((managedDocs.status ?? 1) !== 0) {
    process.stderr.write(managedDocs.stderr ?? '');
    process.stdout.write(managedDocs.stdout ?? '');
    process.exit(managedDocs.status ?? 1);
  }

  const roadmapText = fs.readFileSync(path.join(tempRoot, 'docs', 'PLAYBOOK_PRODUCT_ROADMAP.md'), 'utf8');
  const roadmapEvidence = {
    fact: /(^|\\n)##\\s+Fact\\b/i.test(roadmapText),
    interpretation: /(^|\\n)##\\s+Interpretation\\b/i.test(roadmapText),
    narrative: /(^|\\n)##\\s+Narrative\\b/i.test(roadmapText)
  };

  const doctor = spawnSync(process.execPath, [process.env.PLAYBOOK_CLI_PATH, 'doctor', '--json'], {
    cwd: tempRoot,
    encoding: 'utf8',
    env: process.env
  });
  if ((doctor.status ?? 1) !== 0) {
    process.stderr.write(doctor.stderr ?? '');
    process.stdout.write(doctor.stdout ?? '');
    process.exit(doctor.status ?? 1);
  }

  const artifactsDir = path.join(rootDir, '.playbook', 'demo-artifacts');
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(artifactsDir, 'doctor.txt'), 'doctor ok\\n');
  fs.writeFileSync(path.join(artifactsDir, 'roadmap-check.json'), JSON.stringify(roadmapEvidence, null, 2) + '\\n');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
`,
    'utf8'
  );
  fs.writeFileSync(
    roadmapPath,
    `# Playbook Product Roadmap (legacy pointer)

Roadmap entries are now maintained as structured contract data in:

- \`docs/roadmap/ROADMAP.json\`
`,
    'utf8'
  );

  const addResult = runCommand(fixtureRoot, 'git', ['add', '.']);
  assert.equal(addResult.status, 0, addResult.stderr || addResult.stdout);
  const commitResult = runCommand(fixtureRoot, 'git', ['commit', '--amend', '--no-edit'], {
    GIT_AUTHOR_NAME: 'Playbook Test',
    GIT_AUTHOR_EMAIL: 'playbook-test@example.com',
    GIT_COMMITTER_NAME: 'Playbook Test',
    GIT_COMMITTER_EMAIL: 'playbook-test@example.com'
  });
  assert.equal(commitResult.status, 0, commitResult.stderr || commitResult.stdout);

  return fixtureRoot;
};

test('writeCommandTruthContract repairs missing contract so doctor passes', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-command-truth-'));
  copyRequiredDocs(repo);

  const before = runNode(repo, [cliPath, 'doctor', '--json']);
  assert.notEqual(before.status, 0);
  assert.match(before.stdout, /Command truth contract is missing or invalid/);

  await writeCommandTruthContract(repo);

  const after = runNode(repo, [cliPath, 'doctor', '--json']);
  assert.equal(after.status, 0, after.stderr || after.stdout);
  assert.doesNotMatch(after.stdout, /Command truth contract is missing or invalid/);
});

test('demo managed docs compatibility repairs command truth and roadmap revision layers', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-demo-managed-docs-'));
  copyRequiredDocs(repo);
  fs.rmSync(path.join(repo, 'docs', 'contracts', 'command-truth.json'), { force: true });
  fs.writeFileSync(
    path.join(repo, 'docs', 'PLAYBOOK_PRODUCT_ROADMAP.md'),
    `# Playbook Product Roadmap (legacy pointer)

Roadmap entries are now maintained as structured contract data in:

- \`docs/roadmap/ROADMAP.json\`
`,
    'utf8'
  );

  await applyPlaybookDemoManagedDocsCompatibility(repo);

  const audit = runNode(repo, [cliPath, 'docs', 'audit', '--json']);
  assert.equal(audit.status, 0, audit.stderr || audit.stdout);
  const payload = JSON.parse(audit.stdout);
  assert.equal(payload.findings.some((finding) => finding.ruleId === 'docs.command-truth.missing'), false);
  assert.equal(
    payload.findings.some((finding) => finding.ruleId === 'docs.command-status-block.drift'),
    false
  );
  assert.equal(
    payload.findings.some(
      (finding) =>
        finding.ruleId === 'docs.revision-layer.required-sections' &&
        finding.path === 'docs/PLAYBOOK_PRODUCT_ROADMAP.md'
    ),
    false
  );
});

test('demo refresh syncs command-truth before running doctor in the demo repo', () => {
  const fixtureRepo = createDemoRepoFixture('playbook-demo-refresh-fixture');
  const refreshCommandNodePath = nodeCommand.replace(/\\/g, '/');
  const result = runNode(repoRoot, createPatchedNodeArgs(
    demoRefreshScript,
    [
    '--dry-run',
    '--repo-url',
    fixtureRepo,
    '--feature-id',
    'PB-V1-DEMO-REFRESH-001'
    ]
  ), {
    PLAYBOOK_DEMO_REFRESH_CMD: `"${refreshCommandNodePath}" scripts/refresh-demo-artifacts.mjs`
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Validated required managed docs\/contracts in temp demo repo before demo refresh/);
  assert.match(result.stdout, /Using refresh command: .*refresh-demo-artifacts\.mjs/);
  assert.match(result.stdout, /Detected changes:/);
  assert.match(result.stdout, /docs\/contracts\/command-truth\.json/);
  assert.match(result.stdout, /\.playbook\/demo-artifacts\/doctor\.txt/);
  assert.doesNotMatch(result.stdout, /\.playbook\/finding-state\.json/);
  assert.match(result.stdout, /Dry-run mode: no commit\/push\/PR actions taken\./);
});

test('demo refresh patches nested managed docs so temporary demo doctor sees current contracts', () => {
  const fixtureRepo = createNestedManagedDocsFixture('playbook-demo-nested-managed-docs');
  const refreshCommandNodePath = nodeCommand.replace(/\\/g, '/');
  const result = runNode(repoRoot, createPatchedNodeArgs(
    demoRefreshScript,
    [
      '--dry-run',
      '--repo-url',
      fixtureRepo,
      '--feature-id',
      'PB-V1-DEMO-REFRESH-001'
    ]
  ), {
    PLAYBOOK_DEMO_REFRESH_CMD: `"${refreshCommandNodePath}" scripts/refresh-demo-artifacts.mjs`
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Using refresh command: .*refresh-demo-artifacts\.mjs/);
  assert.match(result.stdout, /\.playbook\/demo-artifacts\/doctor\.txt/);
  assert.match(result.stdout, /\.playbook\/demo-artifacts\/roadmap-check\.json/);
  assert.doesNotMatch(result.stdout, /docs\/PLAYBOOK_PRODUCT_ROADMAP\.md/);
});
