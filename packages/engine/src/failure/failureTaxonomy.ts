import { createHash } from 'node:crypto';
import { normalizeAssertionShape } from '../testAutofix/failureSignature.js';

/**
 * General failure taxonomy (PB-V06-FAILURE-TAXONOMY-001).
 * Deterministic, offline, read-only: classification is a pure function of the input record.
 * Contract: docs/contracts/FAILURE_INTELLIGENCE_CONTRACT.md, docs/contracts/FAILURE_TAXONOMY_SCHEMA.json.
 */

export const FAILURE_TAXONOMY_SCHEMA_VERSION = '1.0' as const;

export const FAILURE_CATEGORIES = [
  'build.type-error',
  'build.compile-error',
  'lint.violation',
  'test.assertion',
  'test.snapshot-mismatch',
  'test.timeout',
  'dependency.resolution',
  'contract.schema-drift',
  'config.invalid',
  'filesystem.permission',
  'network.unreachable',
  'runtime.exception',
  'unknown'
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export const FAILURE_SOURCES = ['build', 'ci', 'lint', 'manual', 'runtime', 'test', 'verify'] as const;
export type FailureSource = (typeof FAILURE_SOURCES)[number];

export type FailureRecordInput = {
  id?: string;
  source?: string;
  message: string;
  file?: string;
  evidence?: string[];
};

export type ClassifiedFailure = {
  id: string;
  source: FailureSource;
  category: FailureCategory;
  matchedRule: string;
  signature: string;
  message: string;
  file: string | null;
  evidence: string[];
};

export type FailureIngestArtifact = {
  schemaVersion: typeof FAILURE_TAXONOMY_SCHEMA_VERSION;
  kind: 'playbook-failure-taxonomy';
  command: 'failure-ingest';
  inputPath: string;
  total: number;
  categories: Array<{ category: FailureCategory; count: number }>;
  failures: ClassifiedFailure[];
};

export type PreventionSuggestion = {
  category: FailureCategory;
  failureIds: string[];
  rule: string;
  test: string;
  docs: string;
  remediation: string;
};

export type FailureSuggestArtifact = {
  schemaVersion: typeof FAILURE_TAXONOMY_SCHEMA_VERSION;
  kind: 'playbook-failure-suggestions';
  command: 'failure-suggest';
  inputPath: string;
  suggestions: PreventionSuggestion[];
};

type ClassifierRule = { id: string; category: FailureCategory; pattern: RegExp };

// Ordered: first match wins. More specific rules come before broader ones.
const CLASSIFIER_RULES: readonly ClassifierRule[] = [
  { id: 'snapshot-mismatch', category: 'test.snapshot-mismatch', pattern: /snapshot .*(mismatch|did not match|obsolete|failed)|toMatchSnapshot|toMatchInlineSnapshot/i },
  { id: 'test-timeout', category: 'test.timeout', pattern: /test timed out|hook timed out|exceeded timeout of \d+ ?ms|timeout of \d+ ?ms exceeded/i },
  { id: 'type-error', category: 'build.type-error', pattern: /\bTS\d{4}\b|type '.*' is not assignable|is not assignable to type|cannot find name '/i },
  { id: 'module-resolution', category: 'dependency.resolution', pattern: /cannot find module|module not found|err_module_not_found|err_pnpm_|eresolve|404 not found - get https?:\/\/.*registry|lockfile.*(out of date|not up to date)|frozen-lockfile/i },
  { id: 'schema-drift', category: 'contract.schema-drift', pattern: /contract surface changed|schema (drift|mismatch|validation failed)|snapshot drift|does not match the committed|contracts:check/i },
  { id: 'compile-error', category: 'build.compile-error', pattern: /syntaxerror|unexpected token|build failed|failed to compile|esbuild.*error|could not resolve "/i },
  { id: 'lint-violation', category: 'lint.violation', pattern: /\beslint\b|\d+ problems? \(\d+ errors?|no-unused-vars|prettier.*(check|failed)/i },
  { id: 'assertion', category: 'test.assertion', pattern: /assertionerror|expected .* (to be|to equal|to match|to contain|received)|\bexpect\(.*\)\.|expected:\s|received:\s/i },
  { id: 'permission', category: 'filesystem.permission', pattern: /\beacces\b|\beperm\b|permission denied|access is denied|erofs/i },
  { id: 'network', category: 'network.unreachable', pattern: /econnrefused|econnreset|enotfound|etimedout|eai_again|getaddrinfo|network (error|unreachable)|socket hang up/i },
  { id: 'config-invalid', category: 'config.invalid', pattern: /invalid (config|configuration)|config(uration)? (error|is invalid|not found)|unexpected key|unknown option|missing required (field|option|config)/i },
  { id: 'runtime-exception', category: 'runtime.exception', pattern: /\b(typeerror|referenceerror|rangeerror|unhandledrejection|uncaught exception|segmentation fault)\b|\bat .+\(.+:\d+:\d+\)/i }
];

export const compareCodeUnits = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const normalizeSource = (value: string | undefined): FailureSource => {
  const lowered = (value ?? '').trim().toLowerCase();
  return (FAILURE_SOURCES as readonly string[]).includes(lowered) ? (lowered as FailureSource) : 'manual';
};

const normalizePath = (value: string): string => value.replaceAll('\\', '/');

export const classifyFailureText = (text: string): { category: FailureCategory; matchedRule: string } => {
  for (const rule of CLASSIFIER_RULES) {
    if (rule.pattern.test(text)) {
      return { category: rule.category, matchedRule: rule.id };
    }
  }
  return { category: 'unknown', matchedRule: 'no-match' };
};

export const buildTaxonomySignature = (category: FailureCategory, message: string, file: string | null): string =>
  `failtax-${createHash('sha256')
    .update(JSON.stringify({ category, file: file ?? '', shape: normalizeAssertionShape(message) }))
    .digest('hex')
    .slice(0, 16)}`;

export const classifyFailure = (input: FailureRecordInput, index: number): ClassifiedFailure => {
  const message = String(input.message ?? '').trim();
  const evidence = (input.evidence ?? []).map((entry) => String(entry).trim()).filter(Boolean);
  const file = input.file ? normalizePath(String(input.file)) : null;
  const { category, matchedRule } = classifyFailureText([message, ...evidence].join('\n'));
  return {
    id: input.id?.trim() || `failure-${String(index + 1).padStart(4, '0')}`,
    source: normalizeSource(input.source),
    category,
    matchedRule,
    signature: buildTaxonomySignature(category, message, file),
    message,
    file,
    evidence
  };
};

/** Accepts `{ failures: [...] }`, a bare array, or a single record. Throws on invalid shapes. */
export const parseFailureInput = (payload: unknown): FailureRecordInput[] => {
  const rawList = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { failures?: unknown }).failures)
      ? (payload as { failures: unknown[] }).failures
      : payload && typeof payload === 'object'
        ? [payload]
        : null;
  if (!rawList) {
    throw new Error('Invalid failure input: expected an object, an array, or { failures: [...] }.');
  }
  return rawList.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || typeof (entry as { message?: unknown }).message !== 'string' || !(entry as { message: string }).message.trim()) {
      throw new Error(`Invalid failure input: entry ${index} must be an object with a non-empty string "message".`);
    }
    return entry as FailureRecordInput;
  });
};

export const buildFailureIngestArtifact = (payload: unknown, inputPath: string): FailureIngestArtifact => {
  const failures = parseFailureInput(payload)
    .map((entry, index) => classifyFailure(entry, index))
    .sort((a, b) => compareCodeUnits(a.id, b.id) || compareCodeUnits(a.signature, b.signature));
  const counts = new Map<FailureCategory, number>();
  for (const failure of failures) counts.set(failure.category, (counts.get(failure.category) ?? 0) + 1);
  return {
    schemaVersion: FAILURE_TAXONOMY_SCHEMA_VERSION,
    kind: 'playbook-failure-taxonomy',
    command: 'failure-ingest',
    inputPath: normalizePath(inputPath),
    total: failures.length,
    categories: [...counts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => compareCodeUnits(a.category, b.category)),
    failures
  };
};

const PREVENTION: Record<FailureCategory, Omit<PreventionSuggestion, 'category' | 'failureIds'>> = {
  'build.type-error': { rule: 'Keep typecheck in the verify gate (pnpm -r build) before merge.', test: 'Add a typed fixture or contract test covering the failing signature.', docs: 'Document the type contract in the owning command/contract doc.', remediation: 'Fix the type at the declaring contract; avoid casts at call sites.' },
  'build.compile-error': { rule: 'Require a clean build in CI before merge.', test: 'Add a build smoke step for the affected package.', docs: 'Note the build prerequisite in the package README or AGENTS.md.', remediation: 'Fix the syntax or unresolved import, then rebuild.' },
  'lint.violation': { rule: 'Keep lint in the pre-merge gate (pnpm lint).', test: 'No new test; run the lint rule against the offending path.', docs: 'Record the lint rule rationale if it is non-obvious.', remediation: 'Apply the lint fix or add a justified, scoped suppression.' },
  'test.assertion': { rule: 'Require the regression test to land with the fix.', test: 'Add or tighten the failing assertion as a named regression test.', docs: 'Update the behavior doc if the expected behavior changed.', remediation: 'Fix the behavior or the stale expectation; confirm with test-triage.' },
  'test.snapshot-mismatch': { rule: 'Require snapshot changes to be reviewed in the PR diff.', test: 'Regenerate snapshots only via the repo snapshot script and review the diff.', docs: 'Mention intentional contract changes in the changelog.', remediation: 'Run the repo snapshot update script, then review the diff.' },
  'test.timeout': { rule: 'Keep explicit timeouts for I/O-heavy tests.', test: 'Add a deterministic fixture instead of real I/O where possible.', docs: 'Document the timeout ceiling in the test config.', remediation: 'Remove the slow dependency or raise the ceiling with justification.' },
  'dependency.resolution': { rule: 'Require pnpm install --frozen-lockfile in CI.', test: 'Add an import smoke test for the missing module.', docs: 'Document required installs in the setup docs.', remediation: 'Install or declare the dependency and refresh the lockfile.' },
  'contract.schema-drift': { rule: 'Require pnpm contracts:check before merge.', test: 'Add or update the contract snapshot test.', docs: 'Update the contract doc and changelog.', remediation: 'Regenerate contract snapshots deliberately and review the diff.' },
  'config.invalid': { rule: 'Validate config against its schema at load time.', test: 'Add a config validation test with the offending value.', docs: 'Document the valid configuration shape.', remediation: 'Correct the configuration value or key.' },
  'filesystem.permission': { rule: 'Restrict writes to declared artifact paths.', test: 'Add a test for the unwritable-path error message.', docs: 'Document required filesystem permissions.', remediation: 'Fix path permissions or use a writable artifact path.' },
  'network.unreachable': { rule: 'Keep verify and tests offline-deterministic.', test: 'Stub the network boundary in the failing test.', docs: 'Document network-dependent steps as optional.', remediation: 'Retry only network-bound steps; do not retry deterministic ones.' },
  'runtime.exception': { rule: 'Guard the failing code path with explicit input validation.', test: 'Add a regression test reproducing the exception.', docs: 'Document the failure mode in the command doc.', remediation: 'Handle the exceptional input and return a deterministic error.' },
  unknown: { rule: 'No rule proposed: classification is unknown.', test: 'Add a classifier fixture once the failure is understood.', docs: 'None.', remediation: 'Triage manually, then extend the classifier with a rule and test.' }
};

export const buildFailureSuggestArtifact = (ingest: FailureIngestArtifact, inputPath: string): FailureSuggestArtifact => {
  const byCategory = new Map<FailureCategory, string[]>();
  for (const failure of ingest.failures) {
    const ids = byCategory.get(failure.category) ?? [];
    ids.push(failure.id);
    byCategory.set(failure.category, ids);
  }
  const suggestions = [...byCategory.entries()]
    .map(([category, ids]) => ({ category, failureIds: ids.sort(compareCodeUnits), ...PREVENTION[category] }))
    .sort((a, b) => compareCodeUnits(a.category, b.category));
  return {
    schemaVersion: FAILURE_TAXONOMY_SCHEMA_VERSION,
    kind: 'playbook-failure-suggestions',
    command: 'failure-suggest',
    inputPath: normalizePath(inputPath),
    suggestions
  };
};

export const validateFailureIngestArtifact = (value: unknown): FailureIngestArtifact => {
  const artifact = value as Partial<FailureIngestArtifact> | null;
  if (!artifact || artifact.kind !== 'playbook-failure-taxonomy' || artifact.schemaVersion !== FAILURE_TAXONOMY_SCHEMA_VERSION || !Array.isArray(artifact.failures)) {
    throw new Error('Invalid failure taxonomy artifact: expected kind "playbook-failure-taxonomy" with schemaVersion "1.0".');
  }
  return artifact as FailureIngestArtifact;
};
