import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTestTriageArtifact, renderTestTriageText } from '../src/testTriage.js';
import { buildTestFixPlanArtifact } from '../src/testFixPlan.js';

describe('test triage engine', () => {
  it('classifies snapshot mismatch and plans narrow reruns deterministically', () => {
    const log = [
      '@fawxzzy/playbook test: FAIL  packages/cli/src/commands/schema.test.ts',
      '  × renders schema snapshot',
      '    Snapshot `renders schema snapshot 1` mismatch',
      '    - Expected',
      '    + Received'
    ].join('\n');

    const artifact = buildTestTriageArtifact(log, { input: 'file', path: 'fixtures/log.txt' });
    expect(artifact.findings[0]?.failure_kind).toBe('snapshot_drift');
    expect(artifact.findings[0]?.repair_class).toBe('autofix_plan_only');
    expect(artifact.rerun_plan.commands).toEqual([
      'pnpm --filter @fawxzzy/playbook exec vitest run packages/cli/src/commands/schema.test.ts',
      'pnpm --filter @fawxzzy/playbook test',
      'pnpm -r test'
    ]);
    expect(renderTestTriageText(artifact)).toContain('## Governance');
    expect(renderTestTriageText(artifact)).toContain('- Rule:');
    expect(renderTestTriageText(artifact)).toContain('- Pattern:');
    expect(renderTestTriageText(artifact)).toContain('- Failure Mode:');
  });

  it('classifies optional esbuild dependency failures as environment limitations', () => {
    const log = [
      'Error: Cannot find module @esbuild/linux-x64',
      'ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @fawxzzy/playbook test: `node ./scripts/run-tests.mjs`'
    ].join('\n');

    const artifact = buildTestTriageArtifact(log, { input: 'stdin', path: null });
    expect(artifact.findings[0]?.failure_kind).toBe('environment_limitation');
    expect(artifact.findings[0]?.repair_class).toBe('review_required');
    expect(artifact.failureLayer).toBe('infra_failure');
    expect(artifact.automationEligibility).toBe('blocked_infra_failure');
  });

  it('detects ordering-only array drift from expected versus received arrays', () => {
    const log = [
      '@fawxzzy/playbook test: FAIL  packages/cli/src/commands/query.test.ts',
      '  × sorts module names deterministically',
      '    Expected: ["alpha", "beta"]',
      '    Received: ["beta", "alpha"]'
    ].join('\n');

    const artifact = buildTestTriageArtifact(log, { input: 'file', path: 'ordering.log' });
    expect(artifact.findings[0]?.failure_kind).toBe('ordering_drift');
    expect(artifact.findings[0]?.suggested_fix_strategy).toContain('deterministic ordering');
    expect(artifact.failureLayer).toBe('product_failure');
    expect(artifact.automationEligibility).toBe('eligible_for_product_remediation');
  });

  it('classifies install timeout logs as infra failures', () => {
    const log = [
      'ERR_PNPM_FETCH_504 GET https://registry.npmjs.org/typescript: request to registry timed out',
      ' WARN  GET https://registry.npmjs.org/vitest error (ETIMEDOUT). Will retry in 10 seconds.'
    ].join('\n');

    const artifact = buildTestTriageArtifact(log, { input: 'file', path: '.playbook/ci-failure.log' });
    expect(artifact.primaryFailureClass).toBe('registry_timeout_install_failure');
    expect(artifact.failureLayer).toBe('infra_failure');
    expect(artifact.automationEligibility).toBe('blocked_infra_failure');
  });

  it('keeps the real export assertion review-required when setup mentions the registry', () => {
    // Minimized from a captured repository CI failure; raw logs stay outside source.
    const log = fs.readFileSync(new URL('./fixtures/registry-config-export-failure.log', import.meta.url), 'utf8');
    const source = { input: 'file' as const, path: 'fixtures/registry-config-export-failure.log' };
    const artifact = buildTestTriageArtifact(log, source);
    const plan = buildTestFixPlanArtifact(artifact);

    expect(artifact.primaryFailureClass).toBe('test_expectation_drift');
    expect(artifact.failureLayer).toBe('product_failure');
    expect(artifact.findings).toHaveLength(1);
    expect(artifact.findings[0]?.repair_class).toBe('review_required');
    expect(artifact.findings[0]?.evidence).toContain("code: 'ERR_ASSERTION'");
    expect(artifact.recommendedNextChecks.some((check) => check.includes('registry reachability'))).toBe(false);
    expect(plan.tasks).toEqual([]);
    expect(plan.excluded).toHaveLength(1);
    expect(plan.excluded[0]?.repair_class).toBe('review_required');
    expect(buildTestTriageArtifact(log, source)).toEqual(artifact);
    expect(buildTestFixPlanArtifact(artifact)).toEqual(plan);
  });

  it('does not infer a registry outage from a configuration URL alone', () => {
    const artifact = buildTestTriageArtifact('pnpm config set registry https://registry.npmjs.org/', { input: 'stdin', path: null });

    expect(artifact.primaryFailureClass).not.toBe('registry_timeout_install_failure');
    expect(artifact.findings.every((finding) => finding.repair_class === 'review_required')).toBe(true);
    expect(buildTestFixPlanArtifact(artifact).tasks).toEqual([]);
  });

  it.each([
    'ERR_SOCKET_TIMEOUT: package download timed out',
    'ERR_PNPM_META_FETCH_FAIL GET https://registry.npmjs.org/lodash: Bad Gateway - 502',
    'WARN GET https://registry.npmjs.org/lodash error (ECONNRESET). Will retry in 10 seconds.',
    'GET https://registry.npmjs.org/lodash: Bad Gateway - 502',
    'npm ERR! 503 Service Unavailable - GET https://registry.npmjs.org/lodash',
    'npm error 502 Bad Gateway - GET https://registry.npmjs.org/lodash',
    'npm http fetch GET 503 https://registry.npmjs.org/lodash 40ms',
    'GET https://registry.npmjs.org/lodash 503 Service Unavailable',
    'GET https://registry.npmjs.org/lodash HTTP/1.1 503 Service Unavailable',
    'GET https://registry.npmjs.org/lodash status code: 503',
    'GET https://registry.npmjs.org/lodash 503 upstream connect error',
    'GET https://registry.npmjs.org/lodash 503 upstream connect error or disconnect/reset before headers. reset reason: connection failure',
    'FAIL packages/engine/test/request.test.ts\nGET https://registry.npmjs.org/lodash 503 upstream connect error\nExpected: true\nReceived: false',
    'npm ERR! 429 Too Many Requests - GET https://registry.npmjs.org/lodash',
    'GET https://registry.npmjs.org/lodash 429 Too Many Requests',
    'GET https://registry.npmjs.org/lodash Too Many Requests - 429',
    'GET https://registry.npmjs.org/lodash HTTP/1.1 403 Forbidden',
    'npm http fetch GET 401 https://registry.npmjs.org/lodash 40ms',
    'Error: Error when performing the request to https://registry.npmjs.org/pnpm/latest\nTypeError: fetch failed',
    'FAIL packages/engine/test/request.test.ts\nTypeError: fetch failed\nError when performing the request to https://registry.npmjs.org/pnpm/latest',
    'Error: getaddrinfo ENOTFOUND registry.npmjs.org',
    'Error: registry.npmjs.org request failed with EAI_AGAIN',
    'Error: connect EHOSTUNREACH registry.npmjs.org',
    'Error: write EPIPE registry.npmjs.org',
    'Error: ENETUNREACH registry.npmjs.org',
    'Error: ECONNABORTED registry.npmjs.org',
    'Error: UND_ERR_SOCKET registry.npmjs.org',
    'Error: CERT_HAS_EXPIRED registry.npmjs.org',
    'GET https://registry.npmjs.org/vitest error (ETIMEDOUT)',
    'request to https://registry.npmjs.org/vitest failed',
    'request to https://packages.registry.example.test/vitest failed',
    'request to https://registry.npmjs.org/vitest timed out'
  ])('preserves actual registry failure evidence: %s', (log) => {
    const artifact = buildTestTriageArtifact(log, { input: 'stdin', path: null });

    expect(artifact.primaryFailureClass).toBe('registry_timeout_install_failure');
    expect(artifact.failureLayer).toBe('infra_failure');
    expect(artifact.automationEligibility).toBe('blocked_infra_failure');
    expect(buildTestFixPlanArtifact(artifact).tasks).toEqual([]);
  });

  it.each(['lodash', 'package-502', 'lodash/5.0.0', 'lodash/503'])('does not infer an outage from a successful registry GET for %s before an assertion', (name) => {
    const log = `FAIL packages/engine/test/request.test.ts\nGET https://registry.npmjs.org/${name} 200 OK\nExpected: true\nReceived: false`;
    const artifact = buildTestTriageArtifact(log, { input: 'stdin', path: null });
    expect(artifact.primaryFailureClass).toBe('test_expectation_drift');
    expect(artifact.failureLayer).toBe('product_failure');
    expect(buildTestFixPlanArtifact(artifact).tasks).toEqual([]);
  });

  it.each([
    'npm ERR! 503 Service Unavailable - GET https://registry.npmjs.org/lodash',
    'npm error 429 Too Many Requests - GET https://registry.npmjs.org/lodash',
    'ERR_PNPM_META_FETCH_FAIL GET https://registry.npmjs.org/lodash: Bad Gateway - 502',
    'GET https://registry.npmjs.org/lodash 503 upstream connect error'
  ])('preserves registry failure lines before an Actions exit trailer: %s', (error) => {
    const log = `${error}\nError: Process completed with exit code 1.`;
    const artifact = buildTestTriageArtifact(log, { input: 'stdin', path: null });
    expect(artifact.primaryFailureClass).toBe('registry_timeout_install_failure');
    expect(artifact.failureLayer).toBe('infra_failure');
    expect(artifact.automationEligibility).toBe('blocked_infra_failure');
    expect(buildTestFixPlanArtifact(artifact).tasks).toEqual([]);
  });

  it('keeps successful registry setup before an Actions exit trailer outside the outage bucket', () => {
    const log = 'pnpm config set registry https://registry.npmjs.org/\nGET https://registry.npmjs.org/lodash 200 OK\nError: Process completed with exit code 1.';
    const artifact = buildTestTriageArtifact(log, { input: 'stdin', path: null });
    expect(artifact.primaryFailureClass).toBe('runtime_failure');
    expect(artifact.failureLayer).toBe('product_failure');
    expect(buildTestFixPlanArtifact(artifact).tasks).toEqual([]);
  });

  it.each([
    'GET https://registry.npmjs.org/lodash 200 OK in 503 ms',
    'npm http fetch GET 200 https://registry.npmjs.org/lodash 503ms (cache miss)',
    'GET https://registry.npmjs.org/lodash 503 ms',
    'GET https://registry.npmjs.org/lodash 503 cache hits',
    'GET https://registry.npmjs.org/lodash 503 kB/s',
    'GET https://registry.npmjs.org/lodash 503 upstream connect error count',
    'GET https://registry.npmjs.org/lodash 200 OK\n503 ms elapsed'
  ])('does not treat registry latency as HTTP failure evidence: %s', (request) => {
    const log = `FAIL packages/engine/test/request.test.ts\n${request}\nExpected: true\nReceived: false`;
    const artifact = buildTestTriageArtifact(log, { input: 'stdin', path: null });
    expect(artifact.primaryFailureClass).toBe('test_expectation_drift');
    expect(artifact.failureLayer).toBe('product_failure');
    expect(buildTestFixPlanArtifact(artifact).tasks).toEqual([]);
  });

  it.each([
    'TypeError: fetch failed',
    'Error: getaddrinfo ENOTFOUND api.example.test',
    'Error: Error when performing the request to https://api.example.test/data\nTypeError: fetch failed',
    'Error: Error when performing the request to https://api.example.test/registry/data\nTypeError: fetch failed',
    'Error: GET https://api.example.test/registry/data 503 Service Unavailable',
    'Error: request to https://api.example.test/registry/data failed'
  ])('does not correlate an unrelated network failure with registry configuration: %s', (error) => {
    const log = `FAIL packages/engine/test/request.test.ts\npnpm config set registry https://registry.npmjs.org/\n${error}`;
    const artifact = buildTestTriageArtifact(log, { input: 'stdin', path: null });
    expect(artifact.primaryFailureClass).toBe('runtime_failure');
    expect(artifact.failureLayer).toBe('product_failure');
    expect(buildTestFixPlanArtifact(artifact).tasks).toEqual([]);
  });

  it('keeps a missing artifact named after the registry outside the transport bucket', () => {
    const artifact = buildTestTriageArtifact('Error: ENOENT registry.npmjs.org', { input: 'stdin', path: null });
    expect(artifact.primaryFailureClass).toBe('missing_artifact');
    expect(artifact.failureLayer).toBe('product_failure');
    expect(buildTestFixPlanArtifact(artifact).tasks).toEqual([]);
  });

  it('classifies release-governance preflight failures as governance failures', () => {
    const log = [
      'Run preflight verify for release governance',
      'Preflight verify failed before pnpm test; see .playbook/verify-preflight.json for canonical machine detail.'
    ].join('\n');

    const artifact = buildTestTriageArtifact(log, { input: 'file', path: '.playbook/ci-failure.log' });
    expect(artifact.primaryFailureClass).toBe('release_governance_preflight_failure');
    expect(artifact.failureLayer).toBe('governance_failure');
    expect(artifact.automationEligibility).toBe('blocked_governance_failure');
  });
});
