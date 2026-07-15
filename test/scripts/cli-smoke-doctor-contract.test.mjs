import assert from 'node:assert/strict';
import test from 'node:test';

import { assertExpectedDoctorDiagnosticFailure } from '../../scripts/cli-smoke-doctor-contract.mjs';

const createResult = (overrides = {}) => ({
  status: 1,
  stderr: '',
  stdout: JSON.stringify({
    schemaVersion: '1.0',
    command: 'doctor',
    status: 'error',
    summary: { errors: 2, warnings: 1, info: 1 },
    findings: [
      {
        category: 'Docs',
        severity: 'error',
        id: 'doctor.docs.docs.required-anchor.missing',
        message: 'Required documentation anchor is missing.'
      }
    ],
    failureDomains: ['contract_validation', 'governance_planning'],
    primaryFailureDomain: 'contract_validation',
    domainBlockers: [
      {
        domain: 'contract_validation',
        signal: 'doctor.docs.docs.required-anchor.missing',
        summary: 'Required documentation anchor is missing.'
      }
    ]
  }),
  ...overrides
});

test('accepts the structured expected Doctor diagnostic failure', () => {
  const report = assertExpectedDoctorDiagnosticFailure(createResult());

  assert.equal(report.command, 'doctor');
  assert.equal(report.status, 'error');
  assert.equal(report.primaryFailureDomain, 'contract_validation');
});

test('rejects crash-shaped stderr even when the process exits 1', () => {
  assert.throws(
    () => assertExpectedDoctorDiagnosticFailure(createResult({ stderr: 'Error: simulated crash\n' })),
    /diagnostic stderr must be empty/
  );
});

test('rejects malformed JSON even when the process exits 1', () => {
  assert.throws(
    () => assertExpectedDoctorDiagnosticFailure(createResult({ stdout: '{not-json' })),
    /emitted malformed JSON/
  );
});

test('rejects an unexpected Doctor failure domain', () => {
  const result = createResult();
  const report = JSON.parse(result.stdout);
  report.failureDomains.push('runtime_execution');

  assert.throws(
    () => assertExpectedDoctorDiagnosticFailure({ ...result, stdout: JSON.stringify(report) }),
    /unexpected doctor failureDomains/
  );
});
