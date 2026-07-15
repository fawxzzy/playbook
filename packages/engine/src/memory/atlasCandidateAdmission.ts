import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ATLAS_KNOWLEDGE_CANDIDATE_CONTRACT = 'atlas.knowledge-candidate.v2' as const;
export const ATLAS_KNOWLEDGE_CANDIDATE_QUEUE_RELATIVE_PATH = '.playbook/memory/atlas-knowledge-candidates.json' as const;

export const ATLAS_KNOWLEDGE_ADMISSION_REASON_CODES = [
  'KNOWLEDGE_PROVENANCE_MISMATCH',
  'KNOWLEDGE_DESTINATION_UNSUPPORTED',
  'KNOWLEDGE_IDENTITY_LOST',
  'KNOWLEDGE_AUTO_PROMOTION_FORBIDDEN',
  'KNOWLEDGE_CONSUMER_RECEIPT_MISSING',
  'KNOWLEDGE_ATLAS_VALIDATION_FAILED',
  'KNOWLEDGE_ATLAS_VALIDATOR_UNAVAILABLE'
] as const;

export type AtlasKnowledgeAdmissionReasonCode = (typeof ATLAS_KNOWLEDGE_ADMISSION_REASON_CODES)[number];

export type AtlasKnowledgeCandidateKind =
  | 'rule'
  | 'pattern'
  | 'failure-mode'
  | 'automation-opportunity'
  | 'governance-gap';

export type AtlasKnowledgeProvenance = {
  source_type: 'repository' | 'receipt' | 'task' | 'conversation' | 'external-source' | 'operator-decision';
  ref: string;
  classification: 'verified' | 'reported' | 'inferred' | 'unknown';
};

export type AtlasKnowledgeCandidate = {
  contract_version: typeof ATLAS_KNOWLEDGE_CANDIDATE_CONTRACT;
  candidate_id: string;
  kind: AtlasKnowledgeCandidateKind;
  name: string;
  statement: string;
  scope: string;
  provenance: AtlasKnowledgeProvenance[];
  review: {
    status: 'candidate' | 'accepted' | 'rejected' | 'superseded';
    reviewer: string | null;
    reviewed_at: string | null;
    decision_note: string | null;
  };
  suggested_destination: string;
  created_at: string;
  extensions?: Record<string, unknown>;
};

export type AtlasKnowledgeConsumerReceipt = {
  schema_version: '1.0';
  kind: 'playbook.atlas-knowledge-candidate.consumer-receipt.v1';
  receipt_id: string;
  candidate_id: string;
  candidate_record_id: string;
  candidate_content_sha256: string;
  source_contract: typeof ATLAS_KNOWLEDGE_CANDIDATE_CONTRACT;
  suggested_destination: string;
  decision: 'candidate-only-admitted';
  review_status: 'candidate';
  promotion_authority: 'none';
  atlas_validator: {
    package: '@atlas/contracts';
    export: './validator';
    schema: typeof ATLAS_KNOWLEDGE_CANDIDATE_CONTRACT;
  };
  correlation: {
    candidate_id: string;
    candidate_record_id: string;
  };
};

export type AtlasKnowledgeCandidateRecord = {
  record_id: string;
  external_candidate_id: string;
  candidate_content_sha256: string;
  candidate: AtlasKnowledgeCandidate;
  admission: {
    state: 'review-candidate';
    promotion_authority: 'none';
    suggested_destination_authority: 'proposal-only';
  };
  consumer_receipt: AtlasKnowledgeConsumerReceipt;
};

export type AtlasKnowledgeCandidateQueue = {
  schema_version: '1.0';
  kind: 'playbook.atlas-knowledge-candidate.queue.v1';
  candidates: AtlasKnowledgeCandidateRecord[];
};

export type AdmitAtlasKnowledgeCandidateOptions = {
  projectRoot: string;
  artifactPath: string;
  atlasContractsRoot: string;
  attemptPromotion?: boolean;
};

export type AtlasKnowledgeCandidateAdmissionResult = {
  schemaVersion: '1.0';
  command: 'atlas-knowledge-candidate-admit';
  status: 'admitted' | 'replayed';
  candidate_id: string;
  candidate_record_id: string;
  queue_path: typeof ATLAS_KNOWLEDGE_CANDIDATE_QUEUE_RELATIVE_PATH;
  candidate_count: number;
  receipt: AtlasKnowledgeConsumerReceipt;
  proof: {
    candidate_identity_exact: true;
    provenance_exact: true;
    suggested_destination_proposal_only: true;
    consumer_receipt_correlated: true;
    auto_promotion: false;
    doctrine_unchanged: true;
    doctrine_snapshot_sha256: string;
    candidate_record_sha256: string;
    queue_bytes_sha256: string;
  };
};

type AtlasValidatorModule = {
  loadJson: (filePath: string) => Promise<unknown>;
  loadKnownSchema: (reference: string) => Promise<
    | { ok: true; schema: unknown }
    | { ok: false; code: string; error: string }
  >;
  validateJsonSchema: (value: unknown, schema: unknown) => string[];
};

const SUPPORTED_DESTINATIONS: Readonly<Partial<Record<AtlasKnowledgeCandidateKind, string>>> = Object.freeze({
  rule: 'Playbook/rules',
  pattern: 'Playbook/patterns',
  'failure-mode': 'Playbook/failure-modes'
});

export const PLAYBOOK_DOCTRINE_PATHS = Object.freeze([
  '.playbook/memory/candidates.json',
  '.playbook/memory/knowledge/decisions.json',
  '.playbook/memory/knowledge/patterns.json',
  '.playbook/memory/knowledge/failure-modes.json',
  '.playbook/memory/knowledge/invariants.json',
  '.playbook/patterns.json',
  '.playbook/patterns-promoted.json',
  '.playbook/story-candidates.json',
  '.playbook/stories.json',
  'docs/PLAYBOOK_NOTES.md'
] as const);

export class AtlasKnowledgeCandidateAdmissionError extends Error {
  readonly reasonCode: AtlasKnowledgeAdmissionReasonCode;
  readonly details: string[];

  constructor(reasonCode: AtlasKnowledgeAdmissionReasonCode, message: string, details: string[] = []) {
    super(`${reasonCode}: ${message}`);
    this.name = 'AtlasKnowledgeCandidateAdmissionError';
    this.reasonCode = reasonCode;
    this.details = details;
  }
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, canonicalize(record[key])])
    );
  }
  return value;
};

const deterministicStringify = (value: unknown): string => `${JSON.stringify(canonicalize(value), null, 2)}\n`;
const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
const contentDigest = (value: unknown): string => sha256(JSON.stringify(canonicalize(value)));
const sameValue = (left: unknown, right: unknown): boolean => JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const fail = (reasonCode: AtlasKnowledgeAdmissionReasonCode, message: string, details: string[] = []): never => {
  throw new AtlasKnowledgeCandidateAdmissionError(reasonCode, message, details);
};

const loadAtlasValidator = async (atlasContractsRoot: string): Promise<AtlasValidatorModule> => {
  const packageRoot = path.resolve(atlasContractsRoot);
  const packageJsonPath = path.join(packageRoot, 'package.json');
  let packageJson: unknown;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch (error) {
    return fail('KNOWLEDGE_ATLAS_VALIDATOR_UNAVAILABLE', `Atlas package metadata is unavailable at ${packageJsonPath}.`, [String(error)]);
  }

  const packageRecord = packageJson as Record<string, unknown>;
  const exportsRecord = isRecord(packageRecord.exports) ? packageRecord.exports : {};
  const validatorExport = exportsRecord['./validator'];
  if (packageRecord.name !== '@atlas/contracts' || typeof validatorExport !== 'string') {
    return fail('KNOWLEDGE_ATLAS_VALIDATOR_UNAVAILABLE', 'The Atlas package does not expose the required @atlas/contracts ./validator seam.');
  }

  const validatorPath = path.resolve(packageRoot, validatorExport as string);
  const relativeValidatorPath = path.relative(packageRoot, validatorPath);
  if (relativeValidatorPath.startsWith('..') || path.isAbsolute(relativeValidatorPath)) {
    fail('KNOWLEDGE_ATLAS_VALIDATOR_UNAVAILABLE', 'The Atlas ./validator export resolves outside the Atlas contracts package.');
  }

  try {
    const loaded = await import(pathToFileURL(validatorPath).href) as Partial<AtlasValidatorModule>;
    if (typeof loaded.loadJson !== 'function' || typeof loaded.loadKnownSchema !== 'function' || typeof loaded.validateJsonSchema !== 'function') {
      fail('KNOWLEDGE_ATLAS_VALIDATOR_UNAVAILABLE', 'The Atlas ./validator export is missing its public validation functions.');
    }
    return loaded as AtlasValidatorModule;
  } catch (error) {
    if (error instanceof AtlasKnowledgeCandidateAdmissionError) throw error;
    return fail('KNOWLEDGE_ATLAS_VALIDATOR_UNAVAILABLE', `The Atlas ./validator export could not be loaded from ${validatorPath}.`, [String(error)]);
  }
};

const loadValidatedCandidate = async (artifactPath: string, atlasContractsRoot: string): Promise<AtlasKnowledgeCandidate> => {
  const validator = await loadAtlasValidator(atlasContractsRoot);
  const loadedSchema = await validator.loadKnownSchema(ATLAS_KNOWLEDGE_CANDIDATE_CONTRACT);
  if (!loadedSchema.ok) {
    return fail('KNOWLEDGE_ATLAS_VALIDATOR_UNAVAILABLE', `Atlas did not register ${ATLAS_KNOWLEDGE_CANDIDATE_CONTRACT}.`, [loadedSchema.code, loadedSchema.error]);
  }

  let candidate: unknown;
  try {
    candidate = await validator.loadJson(path.resolve(artifactPath));
  } catch (error) {
    fail('KNOWLEDGE_ATLAS_VALIDATION_FAILED', 'The Atlas KnowledgeCandidate artifact is not readable JSON.', [String(error)]);
  }

  const errors = validator.validateJsonSchema(candidate, loadedSchema.schema);
  if (errors.length > 0) {
    fail('KNOWLEDGE_ATLAS_VALIDATION_FAILED', 'Atlas-owned schema validation rejected the KnowledgeCandidate artifact.', errors);
  }
  return canonicalize(candidate) as AtlasKnowledgeCandidate;
};

const snapshotDoctrine = (projectRoot: string): Record<string, string | null> => Object.fromEntries(
  PLAYBOOK_DOCTRINE_PATHS.map((relativePath) => {
    const targetPath = path.join(projectRoot, relativePath);
    return [relativePath, fs.existsSync(targetPath) ? sha256(fs.readFileSync(targetPath, 'utf8')) : null];
  })
);

const emptyQueue = (): AtlasKnowledgeCandidateQueue => ({
  schema_version: '1.0',
  kind: 'playbook.atlas-knowledge-candidate.queue.v1',
  candidates: []
});

const readQueue = (projectRoot: string): AtlasKnowledgeCandidateQueue => {
  const queuePath = path.join(projectRoot, ATLAS_KNOWLEDGE_CANDIDATE_QUEUE_RELATIVE_PATH);
  if (!fs.existsSync(queuePath)) return emptyQueue();
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  } catch (error) {
    fail('KNOWLEDGE_IDENTITY_LOST', 'The Playbook Atlas candidate queue is not readable JSON.', [String(error)]);
  }
  if (!isRecord(parsed)
    || parsed.schema_version !== '1.0'
    || parsed.kind !== 'playbook.atlas-knowledge-candidate.queue.v1'
    || !Array.isArray(parsed.candidates)) {
    fail('KNOWLEDGE_IDENTITY_LOST', 'The Playbook Atlas candidate queue has an unsupported shape.');
  }
  return parsed as AtlasKnowledgeCandidateQueue;
};

const buildReceipt = (
  candidate: AtlasKnowledgeCandidate,
  candidateRecordId: string,
  candidateContentSha256: string
): AtlasKnowledgeConsumerReceipt => {
  const receiptIdentity = {
    candidate_id: candidate.candidate_id,
    candidate_record_id: candidateRecordId,
    candidate_content_sha256: candidateContentSha256,
    source_contract: ATLAS_KNOWLEDGE_CANDIDATE_CONTRACT,
    suggested_destination: candidate.suggested_destination,
    decision: 'candidate-only-admitted'
  };
  return {
    schema_version: '1.0',
    kind: 'playbook.atlas-knowledge-candidate.consumer-receipt.v1',
    receipt_id: `playbook-akc-receipt-${contentDigest(receiptIdentity).slice(0, 24)}`,
    candidate_id: candidate.candidate_id,
    candidate_record_id: candidateRecordId,
    candidate_content_sha256: candidateContentSha256,
    source_contract: ATLAS_KNOWLEDGE_CANDIDATE_CONTRACT,
    suggested_destination: candidate.suggested_destination,
    decision: 'candidate-only-admitted',
    review_status: 'candidate',
    promotion_authority: 'none',
    atlas_validator: {
      package: '@atlas/contracts',
      export: './validator',
      schema: ATLAS_KNOWLEDGE_CANDIDATE_CONTRACT
    },
    correlation: {
      candidate_id: candidate.candidate_id,
      candidate_record_id: candidateRecordId
    }
  };
};

const validateDestination = (candidate: AtlasKnowledgeCandidate): void => {
  const supportedDestination = SUPPORTED_DESTINATIONS[candidate.kind];
  if (!supportedDestination || candidate.suggested_destination !== supportedDestination) {
    fail(
      'KNOWLEDGE_DESTINATION_UNSUPPORTED',
      `Playbook does not support the exact destination ${JSON.stringify(candidate.suggested_destination)} for Atlas kind ${JSON.stringify(candidate.kind)}.`
    );
  }
};

export const assertAtlasKnowledgeCandidateAdmission = (input: {
  source: AtlasKnowledgeCandidate;
  record: AtlasKnowledgeCandidateRecord;
  receipt: unknown;
  attemptedPromotion?: boolean;
}): void => {
  const { source, record, receipt } = input;
  if (record.external_candidate_id !== source.candidate_id || record.candidate?.candidate_id !== source.candidate_id) {
    fail('KNOWLEDGE_IDENTITY_LOST', 'Atlas candidate_id was not preserved byte-for-byte as the external Playbook identity.');
  }
  if (!sameValue(record.candidate?.provenance, source.provenance)) {
    fail('KNOWLEDGE_PROVENANCE_MISMATCH', 'Atlas provenance references or classifications changed during Playbook admission.');
  }
  if (!sameValue(record.candidate, source)) {
    fail('KNOWLEDGE_IDENTITY_LOST', 'The stored Playbook review candidate does not retain the exact validated Atlas candidate fields.');
  }
  validateDestination(source);
  if (input.attemptedPromotion
    || source.review.status !== 'candidate'
    || record.admission?.state !== 'review-candidate'
    || record.admission?.promotion_authority !== 'none'
    || record.admission?.suggested_destination_authority !== 'proposal-only') {
    fail('KNOWLEDGE_AUTO_PROMOTION_FORBIDDEN', 'Atlas KnowledgeCandidate admission cannot create or authorize promoted Playbook doctrine.');
  }

  if (!isRecord(receipt)
    || receipt.schema_version !== '1.0'
    || receipt.kind !== 'playbook.atlas-knowledge-candidate.consumer-receipt.v1'
    || receipt.receipt_id !== record.consumer_receipt?.receipt_id
    || receipt.candidate_id !== source.candidate_id
    || receipt.candidate_record_id !== record.record_id
    || receipt.candidate_content_sha256 !== record.candidate_content_sha256
    || receipt.source_contract !== ATLAS_KNOWLEDGE_CANDIDATE_CONTRACT
    || receipt.suggested_destination !== source.suggested_destination
    || receipt.decision !== 'candidate-only-admitted'
    || receipt.review_status !== 'candidate'
    || receipt.promotion_authority !== 'none'
    || !isRecord(receipt.atlas_validator)
    || receipt.atlas_validator.package !== '@atlas/contracts'
    || receipt.atlas_validator.export !== './validator'
    || receipt.atlas_validator.schema !== ATLAS_KNOWLEDGE_CANDIDATE_CONTRACT
    || !isRecord(receipt.correlation)
    || receipt.correlation.candidate_id !== source.candidate_id
    || receipt.correlation.candidate_record_id !== record.record_id) {
    fail('KNOWLEDGE_CONSUMER_RECEIPT_MISSING', 'A valid deterministic consumer receipt correlated to the Atlas candidate and Playbook record is required.');
  }
};

const buildRecord = (candidate: AtlasKnowledgeCandidate): AtlasKnowledgeCandidateRecord => {
  const candidateContentSha256 = contentDigest(candidate);
  const recordId = `playbook-akc-${contentDigest({ candidate_id: candidate.candidate_id, candidate_content_sha256: candidateContentSha256 }).slice(0, 24)}`;
  const receipt = buildReceipt(candidate, recordId, candidateContentSha256);
  return {
    record_id: recordId,
    external_candidate_id: candidate.candidate_id,
    candidate_content_sha256: candidateContentSha256,
    candidate,
    admission: {
      state: 'review-candidate',
      promotion_authority: 'none',
      suggested_destination_authority: 'proposal-only'
    },
    consumer_receipt: receipt
  };
};

const validateExistingQueue = (queue: AtlasKnowledgeCandidateQueue): void => {
  const seen = new Set<string>();
  for (const record of queue.candidates) {
    if (!isRecord(record) || !isRecord(record.candidate)) {
      fail('KNOWLEDGE_IDENTITY_LOST', 'The Playbook Atlas candidate queue contains a malformed candidate record.');
    }
    const candidateId = record.external_candidate_id;
    if (typeof candidateId !== 'string' || seen.has(candidateId)) {
      fail('KNOWLEDGE_IDENTITY_LOST', 'The Playbook Atlas candidate queue contains missing or duplicate external identities.');
    }
    seen.add(candidateId);
    assertAtlasKnowledgeCandidateAdmission({
      source: record.candidate as AtlasKnowledgeCandidate,
      record,
      receipt: record.consumer_receipt
    });
  }
};

const writeQueueAtomically = (projectRoot: string, queue: AtlasKnowledgeCandidateQueue): string => {
  const queuePath = path.join(projectRoot, ATLAS_KNOWLEDGE_CANDIDATE_QUEUE_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  const temporaryPath = `${queuePath}.${process.pid}.tmp`;
  const bytes = deterministicStringify(queue);
  try {
    fs.writeFileSync(temporaryPath, bytes, 'utf8');
    fs.renameSync(temporaryPath, queuePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true });
  }
  return bytes;
};

export const admitAtlasKnowledgeCandidate = async (
  options: AdmitAtlasKnowledgeCandidateOptions
): Promise<AtlasKnowledgeCandidateAdmissionResult> => {
  const projectRoot = path.resolve(options.projectRoot);
  const absoluteQueuePath = path.join(projectRoot, ATLAS_KNOWLEDGE_CANDIDATE_QUEUE_RELATIVE_PATH);
  const previousQueueBytes = fs.existsSync(absoluteQueuePath) ? fs.readFileSync(absoluteQueuePath, 'utf8') : null;
  const doctrineBefore = snapshotDoctrine(projectRoot);
  const candidate = await loadValidatedCandidate(options.artifactPath, options.atlasContractsRoot);
  const prospectiveRecord = buildRecord(candidate);
  assertAtlasKnowledgeCandidateAdmission({
    source: candidate,
    record: prospectiveRecord,
    receipt: prospectiveRecord.consumer_receipt,
    attemptedPromotion: options.attemptPromotion
  });

  const queue = readQueue(projectRoot);
  validateExistingQueue(queue);
  const matches = queue.candidates.filter((record) => record.external_candidate_id === candidate.candidate_id);
  if (matches.length > 1) {
    fail('KNOWLEDGE_IDENTITY_LOST', `Atlas candidate identity ${JSON.stringify(candidate.candidate_id)} is duplicated in the Playbook queue.`);
  }

  const existing = matches[0];
  let status: AtlasKnowledgeCandidateAdmissionResult['status'];
  let record: AtlasKnowledgeCandidateRecord;
  let nextQueue: AtlasKnowledgeCandidateQueue;
  let queueBytes: string;
  if (existing) {
    if (!sameValue(existing.candidate.provenance, candidate.provenance)) {
      fail('KNOWLEDGE_PROVENANCE_MISMATCH', `Replay changed provenance for Atlas candidate ${JSON.stringify(candidate.candidate_id)}.`);
    }
    if (!sameValue(existing, prospectiveRecord)) {
      fail('KNOWLEDGE_IDENTITY_LOST', `Replay changed the content bound to Atlas candidate identity ${JSON.stringify(candidate.candidate_id)}.`);
    }
    status = 'replayed';
    record = existing;
    nextQueue = queue;
    queueBytes = fs.readFileSync(absoluteQueuePath, 'utf8');
  } else {
    status = 'admitted';
    record = prospectiveRecord;
    nextQueue = {
      ...queue,
      candidates: [...queue.candidates, prospectiveRecord]
        .sort((left, right) => left.external_candidate_id.localeCompare(right.external_candidate_id))
    };
    queueBytes = writeQueueAtomically(projectRoot, nextQueue);
  }

  const doctrineAfter = snapshotDoctrine(projectRoot);
  if (!sameValue(doctrineBefore, doctrineAfter)) {
    if (status === 'admitted') {
      if (previousQueueBytes === null) fs.rmSync(absoluteQueuePath, { force: true });
      else fs.writeFileSync(absoluteQueuePath, previousQueueBytes, 'utf8');
    }
    fail('KNOWLEDGE_AUTO_PROMOTION_FORBIDDEN', 'Canonical Playbook doctrine changed during Atlas candidate admission.');
  }

  return {
    schemaVersion: '1.0',
    command: 'atlas-knowledge-candidate-admit',
    status,
    candidate_id: candidate.candidate_id,
    candidate_record_id: record.record_id,
    queue_path: ATLAS_KNOWLEDGE_CANDIDATE_QUEUE_RELATIVE_PATH,
    candidate_count: nextQueue.candidates.length,
    receipt: record.consumer_receipt,
    proof: {
      candidate_identity_exact: true,
      provenance_exact: true,
      suggested_destination_proposal_only: true,
      consumer_receipt_correlated: true,
      auto_promotion: false,
      doctrine_unchanged: true,
      doctrine_snapshot_sha256: contentDigest(doctrineAfter),
      candidate_record_sha256: sha256(deterministicStringify(record)),
      queue_bytes_sha256: sha256(queueBytes)
    }
  };
};
