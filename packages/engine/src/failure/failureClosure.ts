import {
  FAILURE_TAXONOMY_SCHEMA_VERSION,
  buildFailureIngestArtifact,
  buildFailureSuggestArtifact,
  compareCodeUnits,
  validateFailureIngestArtifact,
  type ClassifiedFailure,
  type FailureCategory,
  type FailureIngestArtifact,
  type PreventionSuggestion
} from './failureTaxonomy.js';

/**
 * Failure reports, closure rule and remediation scaffolds (PB-V06-FAILURE-TAXONOMY-001).
 * Pure and deterministic: no network, clock, locale or filesystem access. The CLI owns file I/O
 * and only ever writes under `.playbook/`.
 * Contract: docs/contracts/FAILURE_INTELLIGENCE_CONTRACT.md.
 */

export const FAILURE_REPORT_KIND = 'playbook-failure-report' as const;
export const FAILURE_SCAFFOLD_KIND = 'playbook-failure-scaffolds' as const;
export const FAILURE_CLOSURE_KIND = 'playbook-failure-closure' as const;
export const FAILURE_REPORT_DIR = '.playbook/failures' as const;

export const FAILURE_CLOSURE_STATUSES = ['codification_required', 'closed'] as const;
export type FailureClosureStatus = (typeof FAILURE_CLOSURE_STATUSES)[number];

export type FailureReport = {
  schemaVersion: typeof FAILURE_TAXONOMY_SCHEMA_VERSION;
  kind: typeof FAILURE_REPORT_KIND;
  command: 'failure-classify';
  failure: ClassifiedFailure;
  prevention: Omit<PreventionSuggestion, 'failureIds'>;
  closure: { status: FailureClosureStatus; preventionTargets: string[] };
};

export type FailureReportFile = { path: string; report: FailureReport };

/** Stable, filesystem-safe file stem for a failure id; code-unit based, no locale. */
export const failureReportFileStem = (failure: Pick<ClassifiedFailure, 'id' | 'signature'>): string => {
  const safe = failure.id.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 64);
  return `${safe || 'failure'}-${failure.signature.slice('failtax-'.length, 'failtax-'.length + 8)}`;
};

export const failureReportPath = (failure: Pick<ClassifiedFailure, 'id' | 'signature'>): string =>
  `${FAILURE_REPORT_DIR}/${failureReportFileStem(failure)}.report.json`;

/** Accepts a taxonomy artifact (kind playbook-failure-taxonomy) or raw failure records. */
export const resolveIngestArtifact = (payload: unknown, inputPath: string): FailureIngestArtifact =>
  payload && typeof payload === 'object' && (payload as { kind?: unknown }).kind === 'playbook-failure-taxonomy'
    ? validateFailureIngestArtifact(payload)
    : buildFailureIngestArtifact(payload, inputPath);

export const buildFailureReports = (ingest: FailureIngestArtifact, inputPath: string): FailureReportFile[] => {
  const suggestions = new Map<FailureCategory, PreventionSuggestion>(
    buildFailureSuggestArtifact(ingest, inputPath).suggestions.map((entry) => [entry.category, entry])
  );
  return ingest.failures
    .map((failure) => {
      const { failureIds: _ids, ...prevention } = suggestions.get(failure.category) as PreventionSuggestion;
      void _ids;
      return {
        path: failureReportPath(failure),
        report: {
          schemaVersion: FAILURE_TAXONOMY_SCHEMA_VERSION,
          kind: FAILURE_REPORT_KIND,
          command: 'failure-classify' as const,
          failure,
          prevention,
          closure: { status: 'codification_required' as const, preventionTargets: [] }
        }
      };
    })
    .sort((a, b) => compareCodeUnits(a.path, b.path));
};

/**
 * Re-classifying must not reopen a failure a human already closed: keep an existing closed
 * closure when the signature is unchanged.
 */
export const mergeExistingClosure = (next: FailureReport, existing: unknown): FailureReport => {
  const previous = existing as Partial<FailureReport> | null;
  if (
    previous &&
    previous.kind === FAILURE_REPORT_KIND &&
    previous.failure?.signature === next.failure.signature &&
    previous.closure?.status === 'closed' &&
    Array.isArray(previous.closure.preventionTargets) &&
    previous.closure.preventionTargets.length > 0
  ) {
    return { ...next, closure: { status: 'closed', preventionTargets: [...previous.closure.preventionTargets].map(String).sort(compareCodeUnits) } };
  }
  return next;
};

export type ScaffoldKind = 'rule' | 'test' | 'doc';

export type FailureScaffold = {
  kind: ScaffoldKind;
  targetId: string;
  proposedPath: string;
  summary: string;
  content: string;
};

export type FailureScaffoldEntry = {
  failureId: string;
  signature: string;
  category: FailureCategory;
  scaffolds: FailureScaffold[];
};

export type FailureScaffoldArtifact = {
  schemaVersion: typeof FAILURE_TAXONOMY_SCHEMA_VERSION;
  kind: typeof FAILURE_SCAFFOLD_KIND;
  command: 'failure-scaffold';
  inputPath: string;
  proposeOnly: true;
  total: number;
  entries: FailureScaffoldEntry[];
};

const categorySlug = (category: FailureCategory): string => category.replace(/\./g, '-');

export const buildFailureScaffold = (failure: ClassifiedFailure): FailureScaffoldEntry => {
  const slug = categorySlug(failure.category);
  const shortSig = failure.signature.slice('failtax-'.length);
  const prevention = buildFailureSuggestArtifact(
    { schemaVersion: FAILURE_TAXONOMY_SCHEMA_VERSION, kind: 'playbook-failure-taxonomy', command: 'failure-ingest', inputPath: '', total: 1, categories: [], failures: [failure] },
    ''
  ).suggestions[0];
  const lines = (...parts: string[]): string => `${parts.join('\n')}\n`;
  const scaffolds: FailureScaffold[] = [
    {
      kind: 'rule',
      targetId: `rule:failure-prevention/${slug}`,
      proposedPath: `docs/rules/failure-prevention-${slug}.md`,
      summary: prevention.rule,
      content: lines(
        `# Rule proposal: ${failure.category}`,
        '',
        `Status: proposed (generated from ${failure.id}, ${failure.signature}). Human review required before adoption.`,
        '',
        `Rule: ${prevention.rule}`,
        `Trigger: ${failure.matchedRule}`,
        `Evidence: ${failure.message}`
      )
    },
    {
      kind: 'test',
      targetId: `test:failure-regression/${shortSig}`,
      proposedPath: `tests/unit/failure-regressions/${slug}-${shortSig}.test.ts`,
      summary: prevention.test,
      content: lines(
        `import { describe, it } from 'vitest';`,
        '',
        `// Proposed regression test for ${failure.id} (${failure.signature}, ${failure.category}).`,
        `// ${prevention.test}`,
        `describe(${JSON.stringify(`failure regression ${shortSig}`)}, () => {`,
        `  it.todo(${JSON.stringify(`reproduce: ${failure.message.split('\n')[0].slice(0, 120)}`)});`,
        '});'
      )
    },
    {
      kind: 'doc',
      targetId: `doc:failure-modes/${slug}`,
      proposedPath: `docs/failure-modes/${slug}.md`,
      summary: prevention.docs,
      content: lines(
        `# Failure mode: ${failure.category}`,
        '',
        `Failure Mode: ${failure.message.split('\n')[0].slice(0, 160)}`,
        `Remediation: ${prevention.remediation}`,
        `Documentation action: ${prevention.docs}`
      )
    }
  ];
  return { failureId: failure.id, signature: failure.signature, category: failure.category, scaffolds };
};

export const buildFailureScaffoldArtifact = (ingest: FailureIngestArtifact, inputPath: string, failureId?: string): FailureScaffoldArtifact => {
  const selected = failureId ? ingest.failures.filter((failure) => failure.id === failureId) : ingest.failures;
  if (failureId && selected.length === 0) {
    throw new Error(`playbook failure scaffold: no failure with id "${failureId}" in the taxonomy artifact.`);
  }
  const entries = selected.map(buildFailureScaffold).sort((a, b) => compareCodeUnits(a.failureId, b.failureId) || compareCodeUnits(a.signature, b.signature));
  return {
    schemaVersion: FAILURE_TAXONOMY_SCHEMA_VERSION,
    kind: FAILURE_SCAFFOLD_KIND,
    command: 'failure-scaffold',
    inputPath: inputPath.replaceAll('\\', '/'),
    proposeOnly: true,
    total: entries.length,
    entries
  };
};

export type FailureClosureViolation = { path: string; failureId: string; reason: 'codification_required' | 'closed-without-prevention-targets' | 'invalid-closure-status' };

export type FailureClosureArtifact = {
  schemaVersion: typeof FAILURE_TAXONOMY_SCHEMA_VERSION;
  kind: typeof FAILURE_CLOSURE_KIND;
  command: 'failure-check';
  ok: boolean;
  checked: number;
  closed: number;
  violations: FailureClosureViolation[];
};

/**
 * CI closure rule: every failure report must be `closed` with at least one linked prevention
 * target id. Reports still `codification_required` fail. Non-report JSON files are ignored.
 */
export const evaluateFailureClosure = (files: Array<{ path: string; value: unknown }>): FailureClosureArtifact => {
  const violations: FailureClosureViolation[] = [];
  let checked = 0;
  let closed = 0;
  for (const file of [...files].sort((a, b) => compareCodeUnits(a.path, b.path))) {
    const report = file.value as Partial<FailureReport> | null;
    if (!report || report.kind !== FAILURE_REPORT_KIND) continue;
    checked += 1;
    const failureId = String(report.failure?.id ?? '');
    const status = report.closure?.status;
    const targets = Array.isArray(report.closure?.preventionTargets) ? report.closure.preventionTargets.filter((t) => typeof t === 'string' && t.trim()) : [];
    if (status === 'closed') {
      if (targets.length === 0) violations.push({ path: file.path, failureId, reason: 'closed-without-prevention-targets' });
      else closed += 1;
    } else if (status === 'codification_required') {
      violations.push({ path: file.path, failureId, reason: 'codification_required' });
    } else {
      violations.push({ path: file.path, failureId, reason: 'invalid-closure-status' });
    }
  }
  return {
    schemaVersion: FAILURE_TAXONOMY_SCHEMA_VERSION,
    kind: FAILURE_CLOSURE_KIND,
    command: 'failure-check',
    ok: violations.length === 0,
    checked,
    closed,
    violations
  };
};
