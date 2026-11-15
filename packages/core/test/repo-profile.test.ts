import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runArchitectureAudit } from '../src/audit/architecture.js';
import { architectureAuditChecks } from '../src/audit/checks/architectureChecks.js';
import { isProductRepo, resolveRepoProfile } from '../src/repoProfile.js';

const roots: string[] = [];

const makeRepo = (files: Record<string, string> = {}): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-profile-'));
  roots.push(root);
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
  return root;
};

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

const PRODUCT_ONLY_AUDIT_IDS = [
  'ai.determinism-boundary',
  'artifact.evolution-policy',
  'docs.roadmap-coverage',
  'ecosystem.adapter-boundaries',
  'performance.context-efficiency',
  'remediation.trust-model',
  'scm.context-layer'
];

describe('resolveRepoProfile', () => {
  it('detects the Playbook product layout from the root package name', () => {
    const root = makeRepo({ 'package.json': JSON.stringify({ name: 'playbook-monorepo' }), 'docs/PLAYBOOK_NOTES.md': '# notes' });
    expect(resolveRepoProfile(root)).toMatchObject({ profile: 'product', source: 'product-layout' });
  });

  it('detects the Playbook product layout from the CLI package declaration', () => {
    const root = makeRepo({ 'packages/cli/package.json': JSON.stringify({ name: '@fawxzzy/playbook' }) });
    expect(resolveRepoProfile(root)).toMatchObject({ profile: 'product', source: 'product-layout' });
  });

  it('detects the Playbook product layout from the command-truth contract', () => {
    const root = makeRepo({ 'docs/contracts/command-truth.json': JSON.stringify({ commandTruth: [] }) });
    expect(resolveRepoProfile(root)).toMatchObject({ profile: 'product', source: 'product-layout' });
  });

  it('does not treat a consumer-scoped command-truth.json as product evidence', () => {
    const root = makeRepo({
      'docs/PLAYBOOK_NOTES.md': '# notes',
      'docs/contracts/command-truth.json': JSON.stringify({ scope: 'consumer', bootstrapLadder: [], remediationLoop: [] })
    });
    expect(resolveRepoProfile(root)).toMatchObject({ profile: 'consumer', source: 'consumer-evidence' });
  });

  it('product layout wins over consumer adoption evidence', () => {
    const root = makeRepo({ 'package.json': JSON.stringify({ name: 'playbook-monorepo' }), '.playbookignore': 'dist\n', 'docs/PLAYBOOK_NOTES.md': '# notes' });
    expect(resolveRepoProfile(root).profile).toBe('product');
  });

  it.each([
    ['playbook.config.json', '{"version":1}'],
    ['.playbookignore', 'dist\n'],
    ['.playbook/README.md', '# state'],
    ['scripts/playbook-runtime.mjs', '// bridge'],
    ['docs/PLAYBOOK_NOTES.md', '# notes']
  ])('classifies a repo with %s and no product layout as a consumer', (relativePath, content) => {
    const root = makeRepo({ 'package.json': JSON.stringify({ name: 'some-app' }), [relativePath]: content });
    expect(resolveRepoProfile(root)).toMatchObject({ profile: 'consumer', source: 'consumer-evidence' });
    expect(isProductRepo(root)).toBe(false);
  });

  it('fails closed to product when nothing identifies the repo', () => {
    const root = makeRepo({ 'package.json': JSON.stringify({ name: 'some-app' }), 'README.md': '# app' });
    expect(resolveRepoProfile(root)).toMatchObject({ profile: 'product', source: 'fail-closed' });
    expect(resolveRepoProfile(makeRepo())).toMatchObject({ profile: 'product', source: 'fail-closed' });
  });

  it('an explicit repoType wins over detection in both directions', () => {
    const consumerOverProduct = makeRepo({
      'package.json': JSON.stringify({ name: 'playbook-monorepo' }),
      'playbook.config.json': JSON.stringify({ version: 1, repoType: 'consumer' })
    });
    expect(resolveRepoProfile(consumerOverProduct)).toMatchObject({ profile: 'consumer', source: 'config' });

    const productOverConsumer = makeRepo({
      '.playbookignore': 'dist\n',
      'playbook.config.json': JSON.stringify({ version: 1, repoType: 'product' })
    });
    expect(resolveRepoProfile(productOverConsumer)).toMatchObject({ profile: 'product', source: 'config' });
  });

  it('fails closed on an unknown repoType value or an unreadable config, even with consumer evidence', () => {
    const unknownValue = makeRepo({ 'docs/PLAYBOOK_NOTES.md': '# notes', 'playbook.config.json': JSON.stringify({ version: 1, repoType: 'library' }) });
    expect(resolveRepoProfile(unknownValue)).toMatchObject({ profile: 'product', source: 'fail-closed' });

    const invalidJson = makeRepo({ 'docs/PLAYBOOK_NOTES.md': '# notes', 'playbook.config.json': '{ not json' });
    expect(resolveRepoProfile(invalidJson)).toMatchObject({ profile: 'product', source: 'fail-closed' });
  });

  it('a config without repoType falls through to detection', () => {
    const root = makeRepo({ 'playbook.config.json': JSON.stringify({ version: 1 }) });
    expect(resolveRepoProfile(root)).toMatchObject({ profile: 'consumer', source: 'consumer-evidence' });
  });
});

describe('architecture audit profile scoping', () => {
  it('marks exactly the Playbook-product hardening checks as productOnly', () => {
    expect(architectureAuditChecks.filter((check) => check.productOnly).map((check) => check.id).sort()).toEqual(PRODUCT_ONLY_AUDIT_IDS);
    expect(architectureAuditChecks.filter((check) => !check.productOnly).map((check) => check.id)).toEqual(['artifact.schema-versioning']);
  });

  it('runs every check for a product or unclassified repo', () => {
    for (const root of [makeRepo(), makeRepo({ 'package.json': JSON.stringify({ name: 'playbook-monorepo' }) })]) {
      const report = runArchitectureAudit(root);
      expect(report.audits.map((audit) => audit.id).sort()).toEqual([...PRODUCT_ONLY_AUDIT_IDS, 'artifact.schema-versioning'].sort());
      expect(report.audits.filter((audit) => audit.status === 'warn').map((audit) => audit.id)).toEqual(expect.arrayContaining(PRODUCT_ONLY_AUDIT_IDS));
    }
  });

  it('skips product-only checks for a consumer repo and keeps repo-agnostic ones', () => {
    const root = makeRepo({ 'docs/PLAYBOOK_NOTES.md': '# notes' });
    const report = runArchitectureAudit(root);
    expect(report.audits.map((audit) => audit.id)).toEqual(['artifact.schema-versioning']);
    expect(report.summary.checks).toBe(1);
  });

  it('honors an explicit consumer or product repoType', () => {
    const consumer = makeRepo({ 'playbook.config.json': JSON.stringify({ version: 1, repoType: 'consumer' }) });
    expect(runArchitectureAudit(consumer).audits.map((audit) => audit.id)).toEqual(['artifact.schema-versioning']);

    const product = makeRepo({ 'docs/PLAYBOOK_NOTES.md': '# notes', 'playbook.config.json': JSON.stringify({ version: 1, repoType: 'product' }) });
    expect(runArchitectureAudit(product).audits).toHaveLength(8);
  });
});
