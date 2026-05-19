import fs from 'node:fs';
import path from 'node:path';
import { emitJsonOutput } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';

type PatternsOptions = {
  format: 'text' | 'json';
  quiet: boolean;
  outFile?: string;
};

type VertaPatternTableRow = {
  pattern_id: string;
  pattern: string;
  admitted_derivative: string;
  source_posture: string;
  reason_admitted: string;
};

type VertaDeferredClass = {
  candidate_class: string;
  current_state: string;
  next_proof_needed: string;
};

type VertaRejectedClass = {
  candidate_class: string;
  rejected_derivative: string;
  reason_rejected: string;
};

type VertaPromotedEntry = {
  pattern_id: string;
  source_provenance: string;
  trust_boundary: string;
  admitted_derivative_statement: string;
  owner_repo: string;
  verification_evidence: string[];
  downstream_routing_rule: string;
  non_goals: string;
};

type VertaLookupPattern = VertaPatternTableRow & VertaPromotedEntry;

type VertaLookupPayload = {
  schemaVersion: '1.0';
  command: 'patterns';
  action: 'verta';
  status: 'read-only admitted doctrine lookup';
  owner_repo: 'playbook';
  seam_id: 'verta-derivative-pattern-pack';
  source_artifacts: {
    derivative_pack: string;
    promotion_receipt: string;
    index_surface: string;
  };
  index_surface: {
    references_derivative_pack: boolean;
    references_promotion_receipt: boolean;
  };
  publication: {
    remote_publication_status: string;
    remote_merge_record: string;
  };
  admitted_count: number;
  admitted_patterns: VertaLookupPattern[];
  deferred_classes: VertaDeferredClass[];
  rejected_classes: VertaRejectedClass[];
};

type VertaGateVerdict = 'reject' | 'pause' | 'go';

type VertaGateOwnerRoute = 'playbook' | 'lifeline' | '_stack' | 'app repo' | 'atlas-root-policy' | 'none';

type VertaGatePayload = {
  schemaVersion: '1.0';
  command: 'patterns';
  action: 'verta-gate';
  status: 'read-only seam candidate validation';
  verdict: VertaGateVerdict;
  owner_route: VertaGateOwnerRoute;
  satisfied_checks: string[];
  failed_checks: string[];
  missing_fields: string[];
  cited_pattern_ids: string[];
  raw_verta_posture: {
    status: 'passed' | 'failed';
    reason: string;
  };
  rollback_confidence: 'none' | 'weak' | 'acceptable' | 'strong';
  non_goals_enforced: string[];
};

type CandidateRecord = Record<string, unknown>;

type NormalizedCandidateRecord = {
  behavior: unknown;
  ownerRepo: unknown;
  whyItShouldExist: unknown;
  sourceProvenance: unknown;
  seamBoundary: unknown;
  inputs: unknown;
  outputs: unknown;
  rollbackPath: unknown;
  verification: unknown;
  whyRawVertaStaysProvenanceOnly: unknown;
};

const VERTA_DERIVATIVE_PACK_RELATIVE_PATH = ['docs', 'contracts', 'VERTA_DERIVATIVE_PATTERN_PACK.md'] as const;
const VERTA_DERIVATIVE_RECEIPT_RELATIVE_PATH = ['docs', 'contracts', 'VERTA_DERIVATIVE_PATTERN_PROMOTION_RECEIPT.md'] as const;
const VERTA_PATTERNS_INDEX_RELATIVE_PATH = ['docs', 'PATTERNS.md'] as const;
const RAW_VERTA_REFERENCE_PATTERN = /repos[\\/]+Verta-Core(?:[\\/]|$)|Verta-Core\.zip|raw Verta|raw Verta-Core|unreviewed historical material|extracted raw Verta/i;
const RAW_VERTA_SAFETY_PATTERN = /\b(forbidden|must not|never|provenance-only|provenance only|quarantined|do not|no raw verta|exclude|fail closed)\b/i;
const VAGUE_VALUE_PATTERN = /^(unknown|unclear|not stated|tbd|todo|n\/a|na|none|unspecified)$/i;

const readOptionValue = (args: string[], flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const emitVertaError = (cwd: string, options: PatternsOptions, action: 'verta' | 'verta-gate', message: string): number => {
  if (options.format === 'json') {
    emitJsonOutput({
      cwd,
      command: 'patterns',
      payload: { schemaVersion: '1.0', command: 'patterns', action, error: message },
      outFile: options.outFile
    });
  } else {
    console.error(message);
  }

  return ExitCode.Failure;
};

const stripGlobalPatternFlags = (commandArgs: string[]): string[] => {
  const sanitized: string[] = [];
  for (let index = 0; index < commandArgs.length; index += 1) {
    const value = commandArgs[index]!;
    if (value === '--json' || value === '--text' || value === '--quiet') {
      continue;
    }
    if (value === '--out') {
      index += 1;
      continue;
    }
    sanitized.push(value);
  }
  return sanitized;
};

const readRequiredFile = (cwd: string, relativePath: readonly string[], label: string): string => {
  const filePath = path.join(cwd, ...relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`playbook patterns verta: missing ${label} at ${relativePath.join('/')}.`);
  }

  return fs.readFileSync(filePath, 'utf8');
};

const normalizeInlineCode = (value: string): string => value.replace(/`/g, '').trim();

const extractSection = (text: string, heading: string): string => {
  const lines = text.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex < 0) {
    throw new Error(`playbook patterns verta: missing section ${heading}.`);
  }

  const headingMatch = heading.match(/^(#+)\s/);
  if (!headingMatch) {
    throw new Error(`playbook patterns verta: invalid heading format ${heading}.`);
  }

  const headingLevel = headingMatch[1]!.length;
  const collected: string[] = [];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    const candidateHeading = line.match(/^(#+)\s/);
    if (candidateHeading && candidateHeading[1]!.length <= headingLevel) {
      break;
    }
    collected.push(line);
  }

  return collected.join('\n').trim();
};

const parseMarkdownTable = (section: string): string[][] => {
  const rows = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'));

  if (rows.length < 2) {
    throw new Error('playbook patterns verta: expected a markdown table with header and rows.');
  }

  return rows
    .slice(2)
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.some((cell) => cell.length > 0));
};

const parseAdmittedPatterns = (packText: string): VertaPatternTableRow[] =>
  parseMarkdownTable(extractSection(packText, '### Admitted Patterns')).map((cells) => ({
    pattern_id: normalizeInlineCode(cells[0] ?? ''),
    pattern: cells[1] ?? '',
    admitted_derivative: cells[2] ?? '',
    source_posture: cells[3] ?? '',
    reason_admitted: cells[4] ?? ''
  }));

const parseRejectedPatterns = (packText: string): VertaRejectedClass[] =>
  parseMarkdownTable(extractSection(packText, '### Rejected Patterns')).map((cells) => ({
    candidate_class: cells[0] ?? '',
    rejected_derivative: cells[1] ?? '',
    reason_rejected: cells[2] ?? ''
  }));

const parseDeferredPatterns = (packText: string): VertaDeferredClass[] =>
  parseMarkdownTable(extractSection(packText, '### Pending Patterns')).map((cells) => ({
    candidate_class: cells[0] ?? '',
    current_state: cells[1] ?? '',
    next_proof_needed: cells[2] ?? ''
  }));

const extractBulletValue = (block: string, label: string): string => {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`^- ${escapedLabel}:\\s*(.+)$`, 'm'));
  if (!match) {
    throw new Error(`playbook patterns verta: missing bullet "${label}" in promoted derivative entry.`);
  }

  return match[1]!.trim();
};

const parseVerificationEvidence = (value: string): string[] =>
  value
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);

const parsePromotedEntries = (packText: string): Map<string, VertaPromotedEntry> => {
  const promotedSection = extractSection(packText, '## Promoted Derivative Entries');
  const entries = new Map<string, VertaPromotedEntry>();

  const lines = promotedSection.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.trim();
    const headingMatch = line.match(/^### `([^`]+)`$/);
    if (!headingMatch) {
      continue;
    }

    const patternId = normalizeInlineCode(headingMatch[1] ?? '');
    const blockLines: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextLine = lines[cursor]!;
      if (nextLine.trim().match(/^### `([^`]+)`$/)) {
        break;
      }
      blockLines.push(nextLine);
      index = cursor;
    }

    const block = blockLines.join('\n');
    entries.set(patternId, {
      pattern_id: patternId,
      source_provenance: extractBulletValue(block, 'Source / provenance'),
      trust_boundary: extractBulletValue(block, 'Trust boundary'),
      admitted_derivative_statement: extractBulletValue(block, 'Admitted derivative statement'),
      owner_repo: normalizeInlineCode(extractBulletValue(block, 'Owner repo')),
      verification_evidence: parseVerificationEvidence(extractBulletValue(block, 'Verification evidence')),
      downstream_routing_rule: extractBulletValue(block, 'Downstream routing rule'),
      non_goals: extractBulletValue(block, 'Non-goals')
    });
  }

  return entries;
};

const parseReceiptPromotedIds = (receiptText: string): string[] =>
  parseMarkdownTable(extractSection(receiptText, '## Promoted Pattern IDs')).map((cells) => normalizeInlineCode(cells[0] ?? ''));

const extractReceiptMetadata = (receiptText: string, label: string): string => {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = receiptText.match(new RegExp(`^- ${escapedLabel}:\\s*(.+)$`, 'm'));
  if (!match) {
    throw new Error(`playbook patterns verta: missing receipt metadata "${label}".`);
  }

  return match[1]!.trim();
};

const validateReceiptAgainstPack = (packIds: string[], receiptIds: string[]): void => {
  const normalizedPack = [...packIds].sort((left, right) => left.localeCompare(right));
  const normalizedReceipt = [...receiptIds].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(normalizedPack) !== JSON.stringify(normalizedReceipt)) {
    throw new Error('playbook patterns verta: promoted pattern IDs differ between derivative pack and promotion receipt.');
  }
};

const normalizeFieldKey = (value: string): string => value.replace(/[^a-z0-9]/gi, '').toLowerCase();

const toCandidateRecord = (value: unknown): CandidateRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('playbook patterns verta gate: candidate record must be a JSON object.');
  }

  return value as CandidateRecord;
};

const toNormalizedLookup = (record: CandidateRecord): Map<string, unknown> => {
  const lookup = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    lookup.set(normalizeFieldKey(key), value);
  }
  return lookup;
};

const readCandidateField = (lookup: Map<string, unknown>, aliases: readonly string[]): unknown => {
  for (const alias of aliases) {
    const value = lookup.get(normalizeFieldKey(alias));
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
};

const normalizeCandidateRecord = (record: CandidateRecord): NormalizedCandidateRecord => {
  const lookup = toNormalizedLookup(record);
  return {
    behavior: readCandidateField(lookup, ['behavior']),
    ownerRepo: readCandidateField(lookup, ['owner repo', 'owner_repo', 'ownerRepo', 'owner']),
    whyItShouldExist: readCandidateField(lookup, ['why it should exist', 'why_it_should_exist', 'whyItShouldExist', 'why']),
    sourceProvenance: readCandidateField(lookup, ['source/provenance', 'source_provenance', 'sourceProvenance', 'source', 'provenance']),
    seamBoundary: readCandidateField(lookup, ['seam boundary', 'seam_boundary', 'seamBoundary', 'boundary']),
    inputs: readCandidateField(lookup, ['inputs']),
    outputs: readCandidateField(lookup, ['outputs']),
    rollbackPath: readCandidateField(lookup, ['rollback path', 'rollback_path', 'rollbackPath', 'rollback']),
    verification: readCandidateField(lookup, ['verification']),
    whyRawVertaStaysProvenanceOnly: readCandidateField(lookup, [
      'why raw verta stays provenance-only',
      'why_raw_verta_stays_provenance_only',
      'whyRawVertaStaysProvenanceOnly',
      'raw_verta_provenance_only',
      'rawVertaProvenanceOnly'
    ])
  };
};

const hasMeaningfulValue = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).length > 0;
  }
  return value !== undefined && value !== null;
};

const isVagueValue = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return VAGUE_VALUE_PATTERN.test(value.trim());
  }
  if (Array.isArray(value)) {
    return value.length === 0 || value.every((entry) => isVagueValue(entry));
  }
  if (value && typeof value === 'object') {
    const entries = Object.values(value);
    return entries.length === 0 || entries.every((entry) => isVagueValue(entry));
  }
  return value === undefined || value === null;
};

const stringifyValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => stringifyValue(entry)).filter(Boolean).join('; ');
  }
  if (value && typeof value === 'object') {
    return JSON.stringify(value);
  }
  if (value === undefined || value === null) {
    return '';
  }
  return String(value);
};

const ownerRouteDefinitions: Array<{ route: VertaGateOwnerRoute; aliases: string[] }> = [
  { route: 'playbook', aliases: ['playbook', 'fawxzzy-playbook'] },
  { route: 'lifeline', aliases: ['lifeline', 'fawxzzy-lifeline'] },
  { route: '_stack', aliases: ['_stack'] },
  { route: 'atlas-root-policy', aliases: ['atlas root', 'atlas-root', 'atlas root policy'] },
  { route: 'app repo', aliases: ['app repo', 'application repo', 'fawxzzy-fitness', 'fitness', 'fawxzzy-mazer', 'mazer', 'fawxzzy-trove', 'trove'] }
];

const findRouteMatches = (ownerText: string): VertaGateOwnerRoute[] => {
  const normalized = ownerText.toLowerCase();
  return ownerRouteDefinitions
    .filter(({ aliases }) =>
      aliases.some((alias) => {
        const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const positive = new RegExp(`\\b${escapedAlias}\\b`, 'i');
        const negated = new RegExp(`\\bnot\\s+${escapedAlias}\\b`, 'i');
        return positive.test(normalized) && !negated.test(normalized);
      })
    )
    .map((entry) => entry.route);
};

const classifyOwnerRoute = (ownerValue: unknown): { route: VertaGateOwnerRoute; ambiguous: boolean } => {
  const ownerText = stringifyValue(ownerValue);
  if (!ownerText) {
    return { route: 'none', ambiguous: false };
  }

  const matches = findRouteMatches(ownerText);
  if (matches.length !== 1) {
    return { route: matches[0] ?? 'none', ambiguous: matches.length > 1 };
  }

  return { route: matches[0]!, ambiguous: false };
};

const usesRawVertaAsInput = (value: unknown): boolean => {
  const text = stringifyValue(value);
  if (!text || !RAW_VERTA_REFERENCE_PATTERN.test(text)) {
    return false;
  }
  return !RAW_VERTA_SAFETY_PATTERN.test(text);
};

const inferRollbackConfidence = (rollbackPath: unknown): VertaGatePayload['rollback_confidence'] => {
  const text = stringifyValue(rollbackPath).toLowerCase();
  if (!text) {
    return 'none';
  }
  if (/(delete|remove|revert)/.test(text) && !/(migration|data repair|cleanup needed|manual cleanup)/.test(text)) {
    return 'strong';
  }
  if (/(revert|rollback|remove)/.test(text)) {
    return 'acceptable';
  }
  return isVagueValue(rollbackPath) ? 'weak' : 'acceptable';
};

const hasConcreteVerification = (verification: unknown): boolean => {
  if (!hasMeaningfulValue(verification) || isVagueValue(verification)) {
    return false;
  }
  const text = stringifyValue(verification).toLowerCase();
  return /(pnpm|npm|node|python|vitest|test|build|verify|audit)/.test(text);
};

const isSpecificBehavior = (behavior: unknown): boolean => {
  const text = stringifyValue(behavior);
  return text.length >= 12 && !isVagueValue(behavior);
};

const hasExplicitIo = (value: unknown): boolean => hasMeaningfulValue(value) && !isVagueValue(value);

const allowsMutationOutsideOwner = (seamBoundary: unknown): boolean => {
  const text = stringifyValue(seamBoundary).toLowerCase();
  if (!text) {
    return true;
  }
  if (/(lane creation|create pr|create pull request|start codex|automatic lane|automatic pr)/.test(text)) {
    return true;
  }
  if (/(lifeline|_stack|app repo|atlas root)/.test(text) && /(change|mutat|runtime|operator|adapter|parity|stack lock)/.test(text)) {
    return true;
  }
  return false;
};

const isReadOnlyOrBoundedSeam = (seamBoundary: unknown): boolean => {
  const text = stringifyValue(seamBoundary).toLowerCase();
  if (!text || isVagueValue(seamBoundary)) {
    return false;
  }
  if (allowsMutationOutsideOwner(seamBoundary)) {
    return false;
  }
  return /(read-only|read only|ui\/read-model only|read-model only|bounded to the owner|bounded owner seam|no mutation|no runtime behavior)/.test(text);
};

const buildLookupPayload = (cwd: string): VertaLookupPayload => {
  const packText = readRequiredFile(cwd, VERTA_DERIVATIVE_PACK_RELATIVE_PATH, 'Verta derivative pattern pack');
  const receiptText = readRequiredFile(cwd, VERTA_DERIVATIVE_RECEIPT_RELATIVE_PATH, 'Verta derivative promotion receipt');
  const patternsIndexText = readRequiredFile(cwd, VERTA_PATTERNS_INDEX_RELATIVE_PATH, 'Playbook pattern index');

  const admittedRows = parseAdmittedPatterns(packText);
  const promotedEntries = parsePromotedEntries(packText);
  const receiptIds = parseReceiptPromotedIds(receiptText);
  validateReceiptAgainstPack(
    admittedRows.map((row) => row.pattern_id),
    receiptIds
  );

  const admittedPatterns = admittedRows.map((row) => {
    const promoted = promotedEntries.get(row.pattern_id);
    if (!promoted) {
      throw new Error(`playbook patterns verta: missing promoted derivative entry for ${row.pattern_id}.`);
    }

    return {
      ...row,
      ...promoted
    };
  });

  return {
    schemaVersion: '1.0',
    command: 'patterns',
    action: 'verta',
    status: 'read-only admitted doctrine lookup',
    owner_repo: 'playbook',
    seam_id: 'verta-derivative-pattern-pack',
    source_artifacts: {
      derivative_pack: VERTA_DERIVATIVE_PACK_RELATIVE_PATH.join('/'),
      promotion_receipt: VERTA_DERIVATIVE_RECEIPT_RELATIVE_PATH.join('/'),
      index_surface: VERTA_PATTERNS_INDEX_RELATIVE_PATH.join('/')
    },
    index_surface: {
      references_derivative_pack: patternsIndexText.includes('docs/contracts/VERTA_DERIVATIVE_PATTERN_PACK.md'),
      references_promotion_receipt: patternsIndexText.includes('docs/contracts/VERTA_DERIVATIVE_PATTERN_PROMOTION_RECEIPT.md')
    },
    publication: {
      remote_publication_status: extractReceiptMetadata(receiptText, 'remote publication status'),
      remote_merge_record: extractReceiptMetadata(receiptText, 'remote merge record')
    },
    admitted_count: admittedPatterns.length,
    admitted_patterns: admittedPatterns,
    deferred_classes: parseDeferredPatterns(packText),
    rejected_classes: parseRejectedPatterns(packText)
  };
};

const parseCandidateRecord = (cwd: string, commandArgs: string[]): CandidateRecord => {
  const filePath = readOptionValue(commandArgs, '--file');
  if (!filePath) {
    throw new Error('playbook patterns verta gate: requires --file <candidate-record.json>.');
  }

  const resolvedPath = path.resolve(cwd, filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`playbook patterns verta gate: candidate record not found: ${filePath}`);
  }

  try {
    return toCandidateRecord(JSON.parse(fs.readFileSync(resolvedPath, 'utf8')));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('candidate record must be a JSON object')) {
      throw error;
    }
    throw new Error(`playbook patterns verta gate: invalid JSON in ${filePath}.`);
  }
};

const buildGatePayload = (cwd: string, commandArgs: string[]): VertaGatePayload => {
  const lookupPayload = buildLookupPayload(cwd);
  const candidate = normalizeCandidateRecord(parseCandidateRecord(cwd, commandArgs));

  const satisfiedChecks: string[] = [];
  const failedChecks: string[] = [];
  const missingFields: string[] = [];
  const requiredFields: Array<{ label: string; value: unknown }> = [
    { label: 'behavior', value: candidate.behavior },
    { label: 'owner repo', value: candidate.ownerRepo },
    { label: 'why it should exist', value: candidate.whyItShouldExist },
    { label: 'source/provenance', value: candidate.sourceProvenance },
    { label: 'seam boundary', value: candidate.seamBoundary },
    { label: 'inputs', value: candidate.inputs },
    { label: 'outputs', value: candidate.outputs },
    { label: 'rollback path', value: candidate.rollbackPath },
    { label: 'verification', value: candidate.verification },
    { label: 'why raw Verta stays provenance-only', value: candidate.whyRawVertaStaysProvenanceOnly }
  ];

  for (const field of requiredFields) {
    if (!hasMeaningfulValue(field.value)) {
      missingFields.push(field.label);
    }
  }
  if (missingFields.length === 0) {
    satisfiedChecks.push('required-fields-present');
  } else {
    failedChecks.push('required-fields-present');
  }

  const owner = classifyOwnerRoute(candidate.ownerRepo);
  if (owner.route !== 'none' && !owner.ambiguous) {
    satisfiedChecks.push('single-owner-route');
  } else {
    failedChecks.push('single-owner-route');
  }

  if (isSpecificBehavior(candidate.behavior)) {
    satisfiedChecks.push('specific-behavior');
  } else {
    failedChecks.push('specific-behavior');
  }

  if (hasExplicitIo(candidate.inputs) && hasExplicitIo(candidate.outputs)) {
    satisfiedChecks.push('explicit-inputs-and-outputs');
  } else {
    failedChecks.push('explicit-inputs-and-outputs');
  }

  const rollbackConfidence = inferRollbackConfidence(candidate.rollbackPath);
  if (rollbackConfidence === 'strong' || rollbackConfidence === 'acceptable') {
    satisfiedChecks.push('rollback-path');
  } else {
    failedChecks.push('rollback-path');
  }

  if (hasConcreteVerification(candidate.verification)) {
    satisfiedChecks.push('verification-plan');
  } else {
    failedChecks.push('verification-plan');
  }

  if (isReadOnlyOrBoundedSeam(candidate.seamBoundary)) {
    satisfiedChecks.push('read-only-or-bounded-seam');
  } else {
    failedChecks.push('read-only-or-bounded-seam');
  }

  const rawVertaViolation =
    usesRawVertaAsInput(candidate.sourceProvenance) ||
    usesRawVertaAsInput(candidate.inputs) ||
    usesRawVertaAsInput(candidate.behavior);
  const rawVertaPosture = rawVertaViolation
    ? { status: 'failed' as const, reason: 'Candidate references raw Verta as a source, input, or owner truth.' }
    : { status: 'passed' as const, reason: 'Candidate stays within admitted derivative doctrine and keeps raw Verta provenance-only.' };

  if (rawVertaPosture.status === 'passed') {
    satisfiedChecks.push('raw-verta-provenance-only');
  } else {
    failedChecks.push('raw-verta-provenance-only');
  }

  const policyCandidate = owner.route === 'atlas-root-policy';
  const runtimeDeferredCandidate = owner.route === 'lifeline';
  const stackProjectionCandidate = owner.route === '_stack';
  const impliedCrossRepoMutation = allowsMutationOutsideOwner(candidate.seamBoundary);
  if (impliedCrossRepoMutation) {
    failedChecks.push('no-cross-repo-side-effects');
  } else {
    satisfiedChecks.push('no-cross-repo-side-effects');
  }

  let verdict: VertaGateVerdict = 'go';
  if (
    missingFields.length > 0 ||
    owner.route === 'none' ||
    owner.ambiguous ||
    rawVertaPosture.status === 'failed' ||
    rollbackConfidence === 'none' ||
    !hasConcreteVerification(candidate.verification) ||
    impliedCrossRepoMutation ||
    (!isSpecificBehavior(candidate.behavior) && runtimeDeferredCandidate)
  ) {
    verdict = 'reject';
  } else if (
    policyCandidate ||
    stackProjectionCandidate ||
    runtimeDeferredCandidate ||
    (owner.route === 'app repo' && !isReadOnlyOrBoundedSeam(candidate.seamBoundary))
  ) {
    verdict = 'pause';
  } else if (
    owner.route !== 'playbook' && owner.route !== 'app repo'
  ) {
    verdict = 'pause';
  }

  return {
    schemaVersion: '1.0',
    command: 'patterns',
    action: 'verta-gate',
    status: 'read-only seam candidate validation',
    verdict,
    owner_route: owner.route,
    satisfied_checks: [...new Set(satisfiedChecks)],
    failed_checks: [...new Set(failedChecks)],
    missing_fields: missingFields,
    cited_pattern_ids: lookupPayload.admitted_patterns.map((entry) => entry.pattern_id),
    raw_verta_posture: rawVertaPosture,
    rollback_confidence: rollbackConfidence,
    non_goals_enforced: [
      'no-raw-verta-reads',
      'no-mutation-path',
      'no-runtime-authority-without-owner',
      'no-lane-creation'
    ]
  };
};

const renderText = (payload: VertaLookupPayload): string => {
  const lines = [
    'Status: read-only admitted doctrine lookup',
    `Owner repo: ${payload.owner_repo}`,
    `Seam: ${payload.seam_id}`,
    `Admitted patterns: ${payload.admitted_count}`,
    `Deferred classes: ${payload.deferred_classes.length}`,
    `Remote publication: ${payload.publication.remote_publication_status}`,
    ''
  ];

  lines.push('Admitted patterns:');
  for (const pattern of payload.admitted_patterns) {
    lines.push(`- ${pattern.pattern_id}: ${pattern.admitted_derivative_statement}`);
  }

  lines.push('');
  lines.push('Deferred classes:');
  for (const deferred of payload.deferred_classes) {
    lines.push(`- ${deferred.candidate_class}: ${deferred.next_proof_needed}`);
  }

  return lines.join('\n');
};

const renderGateText = (payload: VertaGatePayload): string => {
  const lines = [
    `Verdict: ${payload.verdict}`,
    `Owner route: ${payload.owner_route}`,
    `Raw Verta posture: ${payload.raw_verta_posture.status} (${payload.raw_verta_posture.reason})`
  ];

  if (payload.failed_checks.length > 0) {
    lines.push(`Failed checks: ${payload.failed_checks.join(', ')}`);
  }
  if (payload.missing_fields.length > 0) {
    lines.push(`Missing fields: ${payload.missing_fields.join(', ')}`);
  }

  return lines.join('\n');
};

export const runPatternsVerta = (cwd: string, commandArgs: string[], options: PatternsOptions): number => {
  try {
    const sanitizedArgs = stripGlobalPatternFlags(commandArgs);

    if (sanitizedArgs[0] === 'gate') {
      const payload = buildGatePayload(cwd, sanitizedArgs.slice(1));
      if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
        return ExitCode.Success;
      }

      if (!options.quiet) {
        console.log(renderGateText(payload));
      }
      return ExitCode.Success;
    }

    if (sanitizedArgs.length > 0) {
      return emitVertaError(cwd, options, 'verta', 'playbook patterns verta: unsupported subcommand. Use gate --file <candidate-record.json> or omit subcommands for doctrine lookup.');
    }

    const payload = buildLookupPayload(cwd);

    if (options.format === 'json') {
      emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
      return ExitCode.Success;
    }

    if (!options.quiet) {
      console.log(renderText(payload));
    }

    return ExitCode.Success;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const sanitizedArgs = stripGlobalPatternFlags(commandArgs);
    return emitVertaError(cwd, options, sanitizedArgs[0] === 'gate' ? 'verta-gate' : 'verta', message);
  }
};
