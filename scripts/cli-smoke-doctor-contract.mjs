const expectedFailureDomains = ['contract_validation', 'governance_planning'];

const fail = (message) => {
  throw new Error(`cli-smoke failed: ${message}`);
};

const hasExactFailureDomains = (failureDomains) =>
  Array.isArray(failureDomains) &&
  failureDomains.length === expectedFailureDomains.length &&
  failureDomains.every((domain, index) => domain === expectedFailureDomains[index]);

export const assertExpectedDoctorDiagnosticFailure = ({ status, stdout, stderr }) => {
  if (status !== 1) {
    fail(`expected doctor diagnostic exit 1, got ${String(status)}`);
  }

  if (typeof stderr !== 'string' || stderr.trim() !== '') {
    fail(`doctor --json diagnostic stderr must be empty\n${String(stderr)}`);
  }

  if (typeof stdout !== 'string' || stdout.trim() === '') {
    fail('doctor --json diagnostic output is missing');
  }

  let report;
  try {
    report = JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`doctor --json emitted malformed JSON: ${message}`);
  }

  if (report?.schemaVersion !== '1.0' || report?.command !== 'doctor') {
    fail('doctor --json diagnostic envelope must include schemaVersion=1.0 and command=doctor');
  }

  if (report.status !== 'error') {
    fail(`expected doctor diagnostic status=error, got ${String(report.status)}`);
  }

  const summary = report.summary;
  if (
    !summary ||
    typeof summary.errors !== 'number' ||
    typeof summary.warnings !== 'number' ||
    typeof summary.info !== 'number' ||
    summary.errors <= 0 ||
    summary.warnings < 0 ||
    summary.info < 0
  ) {
    fail('doctor diagnostic summary must include positive errors and non-negative warnings/info counts');
  }

  if (report.primaryFailureDomain !== 'contract_validation') {
    fail(`expected doctor primaryFailureDomain=contract_validation, got ${String(report.primaryFailureDomain)}`);
  }

  if (!hasExactFailureDomains(report.failureDomains)) {
    fail(
      `unexpected doctor failureDomains: expected ${expectedFailureDomains.join(',')}, got ${JSON.stringify(report.failureDomains)}`
    );
  }

  if (
    !Array.isArray(report.domainBlockers) ||
    !report.domainBlockers.some((blocker) => blocker?.domain === 'contract_validation')
  ) {
    fail('doctor diagnostic must include a contract_validation domain blocker');
  }

  if (
    !Array.isArray(report.findings) ||
    !report.findings.some(
      (finding) =>
        finding?.category === 'Docs' &&
        finding?.severity === 'error' &&
        typeof finding?.id === 'string' &&
        finding.id.startsWith('doctor.docs.')
    )
  ) {
    fail('doctor diagnostic must include a structured Docs error finding');
  }

  return report;
};
