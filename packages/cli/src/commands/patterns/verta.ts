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

const VERTA_DERIVATIVE_PACK_RELATIVE_PATH = ['docs', 'contracts', 'VERTA_DERIVATIVE_PATTERN_PACK.md'] as const;
const VERTA_DERIVATIVE_RECEIPT_RELATIVE_PATH = ['docs', 'contracts', 'VERTA_DERIVATIVE_PATTERN_PROMOTION_RECEIPT.md'] as const;
const VERTA_PATTERNS_INDEX_RELATIVE_PATH = ['docs', 'PATTERNS.md'] as const;

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

const buildPayload = (cwd: string): VertaLookupPayload => {
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

export const runPatternsVerta = (cwd: string, options: PatternsOptions): number => {
  const payload = buildPayload(cwd);

  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'patterns', payload, outFile: options.outFile });
    return ExitCode.Success;
  }

  if (!options.quiet) {
    console.log(renderText(payload));
  }

  return ExitCode.Success;
};
