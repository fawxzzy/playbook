import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const receiptPath = path.join(
  repoRoot,
  '.playbook',
  'memory',
  'atlas-knowledge-candidate-intake-receipts',
  'creation-os.v1.json'
);
const queuePath = path.join(repoRoot, '.playbook', 'memory', 'atlas-knowledge-candidates.json');
const sourceRevision = '66f756768792de35ef00d1741cf8c6f6c965b733';
const excludedDecisionId = 'creation-os-software-repo-voice-first-wedge';

const expectedCandidates = new Map(Object.entries({
  'creation-os-bootstrap-pointer-not-memory': {
    kind: 'rule',
    destination: 'Playbook/rules',
    path: 'data/knowledge-candidates/creation-os/creation-os-bootstrap-pointer-not-memory.knowledge-candidate.v2.json',
    sha256: 'sha256:71170a9442e24862e0f79876e3f8e7028c9146efe5a91bc20daacf1b3a679c05'
  },
  'creation-os-builder-creative-loop-separation': {
    kind: 'pattern',
    destination: 'Playbook/patterns',
    path: 'data/knowledge-candidates/creation-os/creation-os-builder-creative-loop-separation.knowledge-candidate.v2.json',
    sha256: 'sha256:8c50f2611698756850c88c15ff4ba3d3f09a8807378e4aeb339572842bf4d986'
  },
  'creation-os-human-directed-authority': {
    kind: 'rule',
    destination: 'Playbook/rules',
    path: 'data/knowledge-candidates/creation-os/creation-os-human-directed-authority.knowledge-candidate.v2.json',
    sha256: 'sha256:0aee7841a054b2460d0260699151d0e878602af4fd63961ca9697e5cf71e2b4a'
  },
  'creation-os-infrastructure-shopping-before-wedge': {
    kind: 'failure-mode',
    destination: 'Playbook/failure-modes',
    path: 'data/knowledge-candidates/creation-os/creation-os-infrastructure-shopping-before-wedge.knowledge-candidate.v2.json',
    sha256: 'sha256:44f882ae82ee35b4691457a6ac5039ff481c37d9aecb37fed75bbf659673405a'
  },
  'creation-os-platform-surface-vertical-contracts': {
    kind: 'pattern',
    destination: 'Playbook/patterns',
    path: 'data/knowledge-candidates/creation-os/creation-os-platform-surface-vertical-contracts.knowledge-candidate.v2.json',
    sha256: 'sha256:b8ce18b2720dbcc5900721e43de96dc660e91f4625223b683550c52de8bb8da2'
  },
  'creation-os-xr-device-novelty-trap': {
    kind: 'failure-mode',
    destination: 'Playbook/failure-modes',
    path: 'data/knowledge-candidates/creation-os/creation-os-xr-device-novelty-trap.knowledge-candidate.v2.json',
    sha256: 'sha256:d44055c02c0acb69a58e15a9f28fd8a69421b083d927cecbe6828e0aebad390d'
  }
}));

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const contentDigest = (value) => sha256(JSON.stringify(canonicalize(value)));
const clone = (value) => structuredClone(value);
const uniqueCount = (values) => new Set(values).size;

const readCanonicalIntake = () => ({
  receipt: JSON.parse(fs.readFileSync(receiptPath, 'utf8')),
  queue: JSON.parse(fs.readFileSync(queuePath, 'utf8')),
  queueBytes: fs.readFileSync(queuePath)
});

const validateCreationOsIntake = ({ receipt, queue, queueBytes }) => {
  assert.equal(receipt.schema_version, '1.0');
  assert.equal(receipt.kind, 'playbook.atlas-knowledge-candidate.owner-intake-receipt.v1');
  assert.equal(receipt.authority.mode, 'candidate-review-only');
  assert.equal(receipt.authority.promotion_authority, 'none');
  assert.equal(receipt.authority.doctrine_mutation, false);
  assert.deepEqual(receipt.authority.allowed_owner_dispositions, ['accept', 'revise', 'split', 'reject']);
  assert.equal(receipt.source.repository, 'fawxzzy/ATLAS');
  assert.equal(receipt.source.revision, sourceRevision, 'stale source revision');
  assert.equal(receipt.source.contract_version, 'atlas.knowledge-candidate.v2');
  assert.deepEqual(receipt.source.counts, {
    total_source_records: 7,
    knowledge_candidates: 6,
    deferred_decisions: 1
  });

  assert.equal(receipt.candidates.length, expectedCandidates.size, 'exact intake count mismatch');
  assert.equal(receipt.registry.candidate_count, expectedCandidates.size, 'registry count mismatch');
  assert.equal(receipt.registry.unique_source_id_count, expectedCandidates.size);
  assert.equal(receipt.registry.unique_source_hash_count, expectedCandidates.size);
  assert.equal(receipt.registry.unique_registry_identity_count, expectedCandidates.size);
  assert.equal(receipt.registry.owner_disposition_count, expectedCandidates.size);

  const receiptIds = receipt.candidates.map((candidate) => candidate.candidate_id);
  assert.equal(uniqueCount(receiptIds), expectedCandidates.size, 'duplicate source identity');
  assert.equal(uniqueCount(receipt.candidates.map((candidate) => candidate.source_artifact_sha256)), expectedCandidates.size, 'duplicate source artifact hash');
  assert.equal(uniqueCount(receipt.candidates.map((candidate) => candidate.candidate_record_id)), expectedCandidates.size, 'duplicate registry identity');
  assert.equal(receipt.candidates.filter((candidate) => candidate.owner_disposition).length, expectedCandidates.size, 'owner disposition count mismatch');
  assert.deepEqual([...receiptIds].sort(), [...expectedCandidates.keys()].sort(), 'missing or extra source identity');

  for (const candidate of receipt.candidates) {
    const expected = expectedCandidates.get(candidate.candidate_id);
    assert.ok(expected, `extra source identity: ${candidate.candidate_id}`);
    assert.equal(candidate.source_revision, sourceRevision, `stale source revision: ${candidate.candidate_id}`);
    assert.equal(candidate.source_artifact_path, expected.path, `source path mismatch: ${candidate.candidate_id}`);
    assert.equal(candidate.source_artifact_sha256, expected.sha256, `source artifact hash mismatch: ${candidate.candidate_id}`);
    assert.notEqual(candidate.kind, 'decision', `Decision input forbidden: ${candidate.candidate_id}`);
    assert.equal(candidate.kind, expected.kind, `kind mismatch: ${candidate.candidate_id}`);
    assert.equal(candidate.suggested_destination, expected.destination, `destination mismatch: ${candidate.candidate_id}`);
    assert.equal(candidate.contract_version, 'atlas.knowledge-candidate.v2');
    assert.equal(candidate.review_status, 'candidate');
    assert.match(candidate.manifest_record_sha256, /^sha256:[a-f0-9]{64}$/);
    assert.match(candidate.source_statement_sha256, /^sha256:[a-f0-9]{64}$/);
    assert.match(candidate.source_scope_sha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(candidate.provenance_preserved, true);
    assert.equal(candidate.owner_disposition.decision, 'accept');
    assert.equal(candidate.owner_disposition.effect, 'candidate-review-only');
    assert.equal(candidate.owner_disposition.reason_code, 'PLAYBOOK_CANDIDATE_REVIEW_ACCEPTED');
  }

  assert.equal(queue.schema_version, '1.0');
  assert.equal(queue.kind, 'playbook.atlas-knowledge-candidate.queue.v1');
  assert.equal(queue.candidates.length, expectedCandidates.size, 'missing or extra registry record');
  const queueIds = queue.candidates.map((record) => record.external_candidate_id);
  assert.equal(uniqueCount(queueIds), expectedCandidates.size, 'duplicate queue identity');
  assert.deepEqual([...queueIds].sort(), [...expectedCandidates.keys()].sort(), 'registry identity set mismatch');

  for (const candidate of receipt.candidates) {
    const record = queue.candidates.find((entry) => entry.external_candidate_id === candidate.candidate_id);
    assert.ok(record, `missing registry record: ${candidate.candidate_id}`);
    assert.equal(record.candidate.contract_version, candidate.contract_version);
    assert.equal(record.candidate.candidate_id, candidate.candidate_id);
    assert.equal(record.candidate.kind, candidate.kind);
    assert.equal(record.candidate.review.status, candidate.review_status);
    assert.equal(record.candidate.suggested_destination, candidate.suggested_destination);
    assert.ok(record.candidate.provenance.length > 0, `missing provenance: ${candidate.candidate_id}`);
    assert.deepEqual(record.source_artifact, {
      path: candidate.source_artifact_path,
      sha256: candidate.source_artifact_sha256
    });
    assert.equal(record.owner_disposition, 'accept');

    const candidateContentSha256 = contentDigest(record.candidate);
    const candidateRecordId = `playbook-akc-${contentDigest({
      candidate_id: candidate.candidate_id,
      source_artifact: record.source_artifact
    }).slice(0, 24)}`;
    const receiptId = `playbook-akc-receipt-${contentDigest({
      candidate_id: candidate.candidate_id,
      candidate_record_id: candidateRecordId,
      candidate_content_sha256: candidateContentSha256,
      source_contract: 'atlas.knowledge-candidate.v2',
      source_artifact: record.source_artifact,
      suggested_destination: candidate.suggested_destination,
      decision: 'candidate-only-admitted',
      owner_disposition: 'accept'
    }).slice(0, 24)}`;

    assert.equal(record.candidate_content_sha256, candidateContentSha256);
    assert.equal(candidate.candidate_content_sha256, candidateContentSha256);
    assert.equal(record.record_id, candidateRecordId);
    assert.equal(candidate.candidate_record_id, candidateRecordId);
    assert.equal(record.consumer_receipt.receipt_id, receiptId);
    assert.equal(candidate.consumer_receipt_id, receiptId);
    assert.deepEqual(record.consumer_receipt.source_artifact, record.source_artifact);
    assert.equal(record.consumer_receipt.decision, 'candidate-only-admitted');
    assert.equal(record.consumer_receipt.owner_disposition, 'accept');
    assert.equal(record.consumer_receipt.review_status, 'candidate');
    assert.equal(record.consumer_receipt.promotion_authority, 'none');
    assert.equal(record.consumer_receipt.correlation.source_artifact_path, candidate.source_artifact_path);
    assert.equal(record.consumer_receipt.correlation.source_artifact_sha256, candidate.source_artifact_sha256);
  }

  assert.equal(receipt.excluded.length, 1);
  assert.deepEqual(receipt.excluded[0], {
    candidate_id: excludedDecisionId,
    classification: 'atlas-product-decision',
    kind: 'decision',
    disposition: 'deferred-atlas-product-decision',
    reason: 'Decision is not an atlas.knowledge-candidate.v2 kind and Playbook has no Decision destination.'
  });
  assert.equal(JSON.stringify(queue).includes(excludedDecisionId), false, 'excluded Decision leaked into registry');
  assert.equal(receipt.candidates.some((candidate) => candidate.candidate_id === excludedDecisionId), false, 'excluded Decision leaked into candidate outputs');

  const queueSha256 = `sha256:${sha256(queueBytes)}`;
  assert.equal(receipt.registry.queue_sha256, queueSha256, 'queue byte hash mismatch');
  assert.equal(receipt.proof.deterministic_replay.queue_sha256_before, queueSha256);
  assert.equal(receipt.proof.deterministic_replay.queue_sha256_after, queueSha256);
  assert.equal(receipt.proof.deterministic_replay.replayed_candidate_count, expectedCandidates.size);
  assert.equal(receipt.proof.deterministic_replay.queue_bytes_stable, true);
  assert.equal(receipt.proof.deterministic_replay.duplicate_registry_records, 0);

  for (const doctrinePath of receipt.proof.doctrine_invariance.paths) {
    assert.equal(doctrinePath.before_sha256, doctrinePath.after_sha256, `doctrine changed: ${doctrinePath.path}`);
    const absolutePath = path.join(repoRoot, doctrinePath.path);
    const liveSha256 = fs.existsSync(absolutePath) ? `sha256:${sha256(fs.readFileSync(absolutePath))}` : null;
    assert.equal(liveSha256, doctrinePath.after_sha256, `doctrine byte hash drift: ${doctrinePath.path}`);
  }
};

test('admits exactly the six Creation OS candidates with correlated accept dispositions', () => {
  validateCreationOsIntake(readCanonicalIntake());
});

test('fails closed on missing, extra, duplicate, stale, hash, kind, destination, and Decision inputs', () => {
  const canonical = readCanonicalIntake();

  const missing = clone(canonical);
  missing.receipt.candidates.pop();
  assert.throws(() => validateCreationOsIntake(missing), /exact intake count mismatch/);

  const extra = clone(canonical);
  extra.receipt.candidates.push({ ...extra.receipt.candidates[0], candidate_id: 'creation-os-seventh' });
  assert.throws(() => validateCreationOsIntake(extra), /exact intake count mismatch/);

  const duplicate = clone(canonical);
  duplicate.receipt.candidates[5].candidate_id = duplicate.receipt.candidates[0].candidate_id;
  assert.throws(() => validateCreationOsIntake(duplicate), /duplicate source identity/);

  const stale = clone(canonical);
  stale.receipt.candidates[0].source_revision = '0000000000000000000000000000000000000000';
  assert.throws(() => validateCreationOsIntake(stale), /stale source revision/);

  const hashMismatch = clone(canonical);
  hashMismatch.receipt.candidates[0].source_artifact_sha256 = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => validateCreationOsIntake(hashMismatch), /source artifact hash mismatch/);

  const kindMismatch = clone(canonical);
  kindMismatch.receipt.candidates[0].kind = 'pattern';
  assert.throws(() => validateCreationOsIntake(kindMismatch), /kind mismatch/);

  const destinationMismatch = clone(canonical);
  destinationMismatch.receipt.candidates[0].suggested_destination = 'Playbook/patterns';
  assert.throws(() => validateCreationOsIntake(destinationMismatch), /destination mismatch/);

  const decisionInput = clone(canonical);
  decisionInput.receipt.candidates[0].kind = 'decision';
  assert.throws(() => validateCreationOsIntake(decisionInput), /Decision input forbidden/);
});
