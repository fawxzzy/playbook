import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ATLAS_KNOWLEDGE_CANDIDATE_QUEUE_RELATIVE_PATH,
  admitAtlasKnowledgeCandidate,
  type AtlasKnowledgeCandidate,
  type AtlasKnowledgeCandidateQueue
} from './atlasCandidateAdmission.js';

// The admission digests (candidate content digest, record id, receipt id) are stored in the queue and recomputed on
// replay. They must not depend on `localeCompare`, and a record written by an older version must still replay.
// Like the main admission suite, this needs the Atlas contracts package and is skipped where it is not available.

const atlasContractsRoot = process.env.PLAYBOOK_ATLAS_CONTRACTS_ROOT
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..', 'packages', 'atlas-contracts');
const validFixturePath = path.join(atlasContractsRoot, 'fixtures', 'valid', 'knowledge-candidate.v2.json');
const describeWithAtlas = fs.existsSync(validFixturePath) ? describe : describe.skip;

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-atlas-candidate-locale-'));
const queuePath = (repoRoot: string): string => path.join(repoRoot, ATLAS_KNOWLEDGE_CANDIDATE_QUEUE_RELATIVE_PATH);
const readQueue = (repoRoot: string): AtlasKnowledgeCandidateQueue => JSON.parse(fs.readFileSync(queuePath(repoRoot), 'utf8')) as AtlasKnowledgeCandidateQueue;
const readFixture = (): AtlasKnowledgeCandidate => JSON.parse(fs.readFileSync(validFixturePath, 'utf8')) as AtlasKnowledgeCandidate;

const writeCandidate = (repoRoot: string, candidate: AtlasKnowledgeCandidate): string => {
  const artifactPath = path.join(repoRoot, 'candidate.json');
  fs.writeFileSync(artifactPath, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
  return artifactPath;
};
const admit = (repoRoot: string, artifactPath: string) => admitAtlasKnowledgeCandidate({ projectRoot: repoRoot, artifactPath, atlasContractsRoot });

// Sibling keys that locale collation orders differently from UTF-16 code units, in the only free-form part of the contract.
const collidingCandidate = (): AtlasKnowledgeCandidate => ({
  ...readFixture(),
  extensions: { scoredAt: 2, scoreVersion: 1, B: 3, a: 4, _c: 5, nested: { Z: 1, z: 2, a_b: 3, aB: 4 } }
});

const localeCanonicalize = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(localeCanonicalize)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value as Record<string, unknown>)
            .sort((left, right) => left.localeCompare(right))
            .map((key) => [key, localeCanonicalize((value as Record<string, unknown>)[key])])
        )
      : value;
/** Digest as a previous version computed it: keys ordered with localeCompare. */
const legacyDigest = (value: unknown): string => createHash('sha256').update(JSON.stringify(localeCanonicalize(value))).digest('hex');

const reverseLocaleCompare = (): void => {
  vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (this: string, other: string): number {
    const left = String(this);
    return left < other ? 1 : left > other ? -1 : 0;
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describeWithAtlas('Atlas KnowledgeCandidate admission digests are locale independent', () => {
  it('keeps the ids and digests emitted before the change for the real Atlas fixture', async () => {
    const repoRoot = createRepo();
    const artifactPath = path.join(repoRoot, 'candidate.json');
    fs.copyFileSync(validFixturePath, artifactPath);

    const result = await admit(repoRoot, artifactPath);

    // Captured from the build before this change (localeCompare key order). They must not move.
    expect(result.candidate_record_id).toBe('playbook-akc-0bcabbfeb78baa705c9b0ad7');
    expect(result.receipt.receipt_id).toBe('playbook-akc-receipt-406210133f6a8677a0575263');
    expect(result.receipt.candidate_content_sha256).toBe('1e4303291ebcce31e53aebaf9bfa46583f55ae8af1e1a9e9173c3b375e50c832');
    expect(result.proof.doctrine_snapshot_sha256).toBe('a20fc99f01216b83e67e06fe0ccc23b3ad554ade9551db424e1a2399bb6ff496');
    expect(result.proof.candidate_record_sha256).toBe('0cdbee3ed68cab55843e04400ad4686f7efee1cdbc953d81fd66affcc0c06126');
    expect(result.proof.queue_bytes_sha256).toBe('8b274149ebe01cffbd698c8eb35d7e8712cdee2d3defbdb51fa85db0fe07e581');
  });

  it('replays a candidate with colliding extension keys when localeCompare orders strings differently', async () => {
    const repoRoot = createRepo();
    const artifactPath = writeCandidate(repoRoot, collidingCandidate());
    const admitted = await admit(repoRoot, artifactPath);
    const bytes = fs.readFileSync(queuePath(repoRoot), 'utf8');

    reverseLocaleCompare();
    const replayed = await admit(repoRoot, artifactPath);

    expect(admitted.status).toBe('admitted');
    expect(replayed.status).toBe('replayed');
    expect(replayed.candidate_record_id).toBe(admitted.candidate_record_id);
    expect(replayed.receipt.receipt_id).toBe(admitted.receipt.receipt_id);
    expect(fs.readFileSync(queuePath(repoRoot), 'utf8')).toBe(bytes);
  });

  it('replays a queue record whose digests were written with the previous locale-collation key order', async () => {
    const repoRoot = createRepo();
    const candidate = collidingCandidate();
    const artifactPath = writeCandidate(repoRoot, candidate);
    await admit(repoRoot, artifactPath);

    // Rewrite the stored record the way a previous version would have written it for the same admission.
    const queue = readQueue(repoRoot);
    const record = queue.candidates[0]!;
    const legacyContentDigest = legacyDigest(candidate);
    expect(legacyContentDigest).not.toBe(record.candidate_content_sha256);
    const legacyRecordId = `playbook-akc-${legacyDigest({ candidate_id: candidate.candidate_id, source_artifact: record.source_artifact }).slice(0, 24)}`;
    const legacyReceiptId = `playbook-akc-receipt-${legacyDigest({
      candidate_id: candidate.candidate_id,
      candidate_record_id: legacyRecordId,
      candidate_content_sha256: legacyContentDigest,
      source_contract: 'atlas.knowledge-candidate.v2',
      source_artifact: record.source_artifact,
      suggested_destination: candidate.suggested_destination,
      decision: 'candidate-only-admitted',
      owner_disposition: 'accept'
    }).slice(0, 24)}`;
    record.record_id = legacyRecordId;
    record.candidate_content_sha256 = legacyContentDigest;
    record.consumer_receipt.receipt_id = legacyReceiptId;
    record.consumer_receipt.candidate_record_id = legacyRecordId;
    record.consumer_receipt.candidate_content_sha256 = legacyContentDigest;
    record.consumer_receipt.correlation.candidate_record_id = legacyRecordId;
    fs.writeFileSync(queuePath(repoRoot), `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
    const legacyBytes = fs.readFileSync(queuePath(repoRoot), 'utf8');

    const replayed = await admit(repoRoot, artifactPath);

    expect(replayed.status).toBe('replayed');
    expect(replayed.candidate_record_id).toBe(legacyRecordId);
    expect(fs.readFileSync(queuePath(repoRoot), 'utf8')).toBe(legacyBytes);
  });

  it('still rejects a stored record whose content digest matches neither key order', async () => {
    const repoRoot = createRepo();
    const artifactPath = writeCandidate(repoRoot, collidingCandidate());
    await admit(repoRoot, artifactPath);
    const queue = readQueue(repoRoot);
    queue.candidates[0]!.candidate_content_sha256 = '0'.repeat(64);
    queue.candidates[0]!.consumer_receipt.candidate_content_sha256 = '0'.repeat(64);
    fs.writeFileSync(queuePath(repoRoot), `${JSON.stringify(queue, null, 2)}\n`, 'utf8');

    await expect(admit(repoRoot, artifactPath)).rejects.toMatchObject({ reasonCode: 'KNOWLEDGE_IDENTITY_LOST' });
  });
});
