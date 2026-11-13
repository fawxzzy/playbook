import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  redactSecretsForLogs,
  validateRemediationPlan,
  validateRepoBoundary
} from '../../packages/engine/dist/security/guards.js';

const makeRepo = () => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-security-'));

test('Path Traversal Protection blocks ../../etc/passwd', () => {
  const repo = makeRepo();
  assert.throws(() => validateRepoBoundary(repo, '../../etc/passwd'), /escapes repository root/);
});

test('Repo Boundary Protection blocks writes outside repository root', () => {
  const repo = makeRepo();
  assert.throws(() => {
    validateRemediationPlan(repo, [
      {
        id: 'task-1',
        ruleId: 'notes.missing',
        file: '../outside.md',
        action: 'write file',
        autoFix: true
      }
    ]);
  }, /escapes repository root/);
});

test('Plan Validation rejects malformed plans', () => {
  const repo = makeRepo();
  assert.throws(() => {
    validateRemediationPlan(repo, [
      {
        id: 'task-1',
        ruleId: 'notes.missing',
        file: 'docs/unsafe.exe',
        action: 'x'.repeat(500),
        autoFix: true
      }
    ]);
  }, /action must be between 1 and 400 characters/);
});

test('Level 3 (security-sensitive) auto-fix tasks are rejected by default plan validation', () => {
  const repo = makeRepo();
  assert.throws(() => {
    validateRemediationPlan(repo, [
      {
        id: 'task-1',
        ruleId: 'plugin.workflow',
        file: '.github/workflows/release.yml',
        action: 'rewrite workflow',
        autoFix: true
      }
    ]);
  }, /change level exceeds the apply ceiling/);

  assert.doesNotThrow(() => {
    validateRemediationPlan(repo, [
      {
        id: 'task-2',
        ruleId: 'plugin.workflow',
        file: '.github/workflows/release.yml',
        action: 'advisory only',
        autoFix: false
      }
    ]);
  });
});

test('Level 3 ceiling classifies the resolved path, not the raw task string', () => {
  const repo = makeRepo();
  const spellings = [
    'docs/../.github/workflows/ci.yml',
    '.playbook/../.github/x.yml',
    'src/../.husky/pre-commit',
    './/.github/workflows/ci.yml',
    '.github./workflows/ci.yml',
    '.GITHUB/workflows/ci.yml',
    'a/../.npmrc',
    'docs/../secrets/x.json',
    path.join(repo, '.github', 'workflows', 'ci.yml')
  ];

  for (const file of spellings) {
    assert.throws(
      () =>
        validateRemediationPlan(repo, [
          { id: 'task-obfuscated', ruleId: 'docs-consolidation.managed-write', file, action: 'write docs', autoFix: true }
        ]),
      /change level exceeds the apply ceiling/,
      `expected ${file} to be rejected`
    );
  }
});

test('Level 3 ceiling still rejects when the file extension allow-list would pass', () => {
  const repo = makeRepo();
  assert.throws(
    () =>
      validateRemediationPlan(repo, [
        { id: 'task-yml', ruleId: 'docs-consolidation.managed-write', file: 'docs/../.github/workflows/ci.yml', action: 'write docs', autoFix: true }
      ]),
    /change level exceeds the apply ceiling \(level 2\) for task-yml \(level 3\)/
  );
});

test('Secret Redaction removes credentials from log messages', () => {
  const redacted = redactSecretsForLogs('token=super-secret-value ghp_abcdefghijklmnopqrstuvwxyz1234');
  assert.equal(redacted.includes('super-secret-value'), false);
  assert.equal(redacted.includes('ghp_abcdefghijklmnopqrstuvwxyz1234'), false);
  assert.equal(redacted.includes('[REDACTED]'), true);
});
