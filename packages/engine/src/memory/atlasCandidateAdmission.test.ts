import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ATLAS_KNOWLEDGE_CANDIDATE_QUEUE_RELATIVE_PATH,
  PLAYBOOK_DOCTRINE_PATHS,
  admitAtlasKnowledgeCandidate,
  type AtlasKnowledgeCandidate,
  type AtlasKnowledgeCandidateQueue
} from './atlasCandidateAdmission.js';

const atlasContractsRoot = process.env.PLAYBOOK_ATLAS_CONTRACTS_ROOT
  ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..', 'packages', 'atlas-contracts');
const validFixturePath = path.join(atlasContractsRoot, 'fixtures', 'valid', 'knowledge-candidate.v2.json');
const badKindFixturePath = path.join(atlasContractsRoot, 'fixtures', 'invalid', 'knowledge-candidate.v2.bad-kind.json');
const describeWithAtlas = fs.existsSync(validFixturePath) && fs.existsSync(badKindFixturePath) ? describe : describe.skip;

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-atlas-candidate-'));
const queuePath = (repoRoot: string): string => path.join(repoRoot, ATLAS_KNOWLEDGE_CANDIDATE_QUEUE_RELATIVE_PATH);
const readQueue = (repoRoot: string): AtlasKnowledgeCandidateQueue => JSON.parse(fs.readFileSync(queuePath(repoRoot), 'utf8')) as AtlasKnowledgeCandidateQueue;
const writeQueue = (repoRoot: string, queue: AtlasKnowledgeCandidateQueue): void => {
  fs.mkdirSync(path.dirname(queuePath(repoRoot)), { recursive: true });
  fs.writeFileSync(queuePath(repoRoot), `${JSON.stringify(queue, null, 2)}\n`, 'utf8');
};
const readFixture = (): AtlasKnowledgeCandidate => JSON.parse(fs.readFileSync(validFixturePath, 'utf8')) as AtlasKnowledgeCandidate;
const exactArtifactSha256 = (artifactPath: string): string => `sha256:${createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex')}`;
const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  }
  return value;
};
const contentDigest = (value: unknown): string => createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');

const buildLegacyRecord = (candidate: AtlasKnowledgeCandidate): AtlasKnowledgeCandidateQueue['candidates'][number] => {
  const candidateContentSha256 = contentDigest(candidate);
  const recordId = `playbook-akc-${contentDigest({ candidate_id: candidate.candidate_id, candidate_content_sha256: candidateContentSha256 }).slice(0, 24)}`;
  const receiptIdentity = {
    candidate_id: candidate.candidate_id,
    candidate_record_id: recordId,
    candidate_content_sha256: candidateContentSha256,
    source_contract: 'atlas.knowledge-candidate.v2',
    suggested_destination: candidate.suggested_destination,
    decision: 'candidate-only-admitted'
  };
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
    consumer_receipt: {
      schema_version: '1.0',
      kind: 'playbook.atlas-knowledge-candidate.consumer-receipt.v1',
      receipt_id: `playbook-akc-receipt-${contentDigest(receiptIdentity).slice(0, 24)}`,
      candidate_id: candidate.candidate_id,
      candidate_record_id: recordId,
      candidate_content_sha256: candidateContentSha256,
      source_contract: 'atlas.knowledge-candidate.v2',
      suggested_destination: candidate.suggested_destination,
      decision: 'candidate-only-admitted',
      review_status: 'candidate',
      promotion_authority: 'none',
      atlas_validator: {
        package: '@atlas/contracts',
        export: './validator',
        schema: 'atlas.knowledge-candidate.v2'
      },
      correlation: {
        candidate_id: candidate.candidate_id,
        candidate_record_id: recordId
      }
    }
  } as unknown as AtlasKnowledgeCandidateQueue['candidates'][number];
};

const writeCandidate = (repoRoot: string, candidate: AtlasKnowledgeCandidate, name = 'candidate.json'): string => {
  const artifactPath = path.join(repoRoot, name);
  fs.writeFileSync(artifactPath, `${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
  return artifactPath;
};

const admit = (repoRoot: string, artifactPath = validFixturePath, attemptPromotion = false) =>
  admitAtlasKnowledgeCandidate({ projectRoot: repoRoot, artifactPath, atlasContractsRoot, attemptPromotion });

const doctrineBytes = (repoRoot: string): Record<string, string> => Object.fromEntries(
  PLAYBOOK_DOCTRINE_PATHS.map((relativePath) => [relativePath, fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')])
);

describeWithAtlas('Atlas KnowledgeCandidate admission', () => {
  it('admits the Atlas valid fixture exactly, replays byte-identically, and leaves doctrine unchanged', async () => {
    const repoRoot = createRepo();
    for (const relativePath of PLAYBOOK_DOCTRINE_PATHS) {
      const targetPath = path.join(repoRoot, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, `unchanged:${relativePath}\n`, 'utf8');
    }
    const doctrineBefore = doctrineBytes(repoRoot);
    const source = readFixture();

    const admitted = await admit(repoRoot);
    const firstQueueBytes = fs.readFileSync(queuePath(repoRoot), 'utf8');
    const replayed = await admit(repoRoot);
    const replayQueueBytes = fs.readFileSync(queuePath(repoRoot), 'utf8');
    const queue = readQueue(repoRoot);

    expect(admitted.status).toBe('admitted');
    expect(replayed.status).toBe('replayed');
    expect(replayed.candidate_record_id).toBe(admitted.candidate_record_id);
    expect(replayed.receipt).toEqual(admitted.receipt);
    expect(replayed.proof.candidate_record_sha256).toBe(admitted.proof.candidate_record_sha256);
    expect(replayed.proof.queue_bytes_sha256).toBe(admitted.proof.queue_bytes_sha256);
    expect(replayQueueBytes).toBe(firstQueueBytes);
    expect(queue.candidates).toHaveLength(1);
    expect(queue.candidates[0]?.external_candidate_id).toBe(source.candidate_id);
    expect(queue.candidates[0]?.candidate).toEqual(source);
    expect(queue.candidates[0]?.candidate.provenance).toEqual(source.provenance);
    expect(queue.candidates[0]?.source_artifact).toEqual({
      path: 'packages/atlas-contracts/fixtures/valid/knowledge-candidate.v2.json',
      sha256: exactArtifactSha256(validFixturePath)
    });
    expect(queue.candidates[0]?.owner_disposition).toBe('accept');
    expect(queue.candidates[0]?.consumer_receipt.candidate_id).toBe(source.candidate_id);
    expect(queue.candidates[0]?.consumer_receipt.owner_disposition).toBe('accept');
    expect(queue.candidates[0]?.consumer_receipt.correlation).toMatchObject({
      source_artifact_path: 'packages/atlas-contracts/fixtures/valid/knowledge-candidate.v2.json',
      source_artifact_sha256: exactArtifactSha256(validFixturePath)
    });
    expect(queue.candidates[0]?.consumer_receipt.correlation.candidate_record_id).toBe(admitted.candidate_record_id);
    expect(queue.candidates[0]?.admission).toEqual({
      state: 'review-candidate',
      promotion_authority: 'none',
      suggested_destination_authority: 'proposal-only'
    });
    expect(admitted.proof).toMatchObject({
      candidate_identity_exact: true,
      source_artifact_exact: true,
      provenance_exact: true,
      owner_disposition: 'accept',
      suggested_destination_proposal_only: true,
      consumer_receipt_correlated: true,
      auto_promotion: false,
      doctrine_unchanged: true
    });
    expect(doctrineBytes(repoRoot)).toEqual(doctrineBefore);
  });

  it('appends a second distinct review candidate without duplicates or doctrine writes', async () => {
    const repoRoot = createRepo();
    const secondCandidate: AtlasKnowledgeCandidate = {
      ...readFixture(),
      candidate_id: 'knowledge-002',
      name: 'Second deterministic knowledge candidate'
    };
    const secondArtifactPath = writeCandidate(repoRoot, secondCandidate, 'candidate-002.json');

    const first = await admit(repoRoot);
    const second = await admit(repoRoot, secondArtifactPath);
    const queueAfterAppend = fs.readFileSync(queuePath(repoRoot), 'utf8');
    const secondReplay = await admit(repoRoot, secondArtifactPath);
    const queue = readQueue(repoRoot);

    expect(first.candidate_count).toBe(1);
    expect(second.status).toBe('admitted');
    expect(second.candidate_count).toBe(2);
    expect(secondReplay.status).toBe('replayed');
    expect(secondReplay.candidate_count).toBe(2);
    expect(fs.readFileSync(queuePath(repoRoot), 'utf8')).toBe(queueAfterAppend);
    expect(queue.candidates.map((record) => record.external_candidate_id)).toEqual([
      'knowledge-001',
      'knowledge-002'
    ]);
    expect(queue.candidates[1]?.source_artifact.path).toBe('project://candidate-002.json');
    expect(new Set(queue.candidates.map((record) => record.record_id)).size).toBe(2);
    expect(new Set(queue.candidates.map((record) => record.consumer_receipt.receipt_id)).size).toBe(2);
    expect(PLAYBOOK_DOCTRINE_PATHS.every((relativePath) => !fs.existsSync(path.join(repoRoot, relativePath)))).toBe(true);
  });

  it('fails closed instead of persisting an artifact path outside stable roots', async () => {
    const repoRoot = createRepo();
    const externalRoot = createRepo();
    const artifactPath = writeCandidate(externalRoot, readFixture());

    await expect(admit(repoRoot, artifactPath)).rejects.toMatchObject({
      reasonCode: 'KNOWLEDGE_SOURCE_ARTIFACT_MISMATCH'
    });
    expect(fs.existsSync(queuePath(repoRoot))).toBe(false);
  });

  it('derives the same project-local record identity across checkout roots', async () => {
    const firstRepoRoot = createRepo();
    const secondRepoRoot = createRepo();
    const firstArtifactPath = writeCandidate(firstRepoRoot, readFixture());
    const secondArtifactPath = writeCandidate(secondRepoRoot, readFixture());

    const first = await admit(firstRepoRoot, firstArtifactPath);
    const second = await admit(secondRepoRoot, secondArtifactPath);

    expect(first.candidate_record_id).toBe(second.candidate_record_id);
    expect(readQueue(firstRepoRoot).candidates[0]?.source_artifact.path).toBe('project://candidate.json');
    expect(readQueue(secondRepoRoot).candidates[0]?.source_artifact.path).toBe('project://candidate.json');
  });

  it('keeps project-local identity when the Atlas contracts root is vendored inside the project', async () => {
    const externalContractsRepoRoot = createRepo();
    const vendoredContractsRepoRoot = createRepo();
    const vendoredAtlasContractsRoot = path.join(vendoredContractsRepoRoot, 'packages', 'atlas-contracts');
    fs.cpSync(atlasContractsRoot, vendoredAtlasContractsRoot, { recursive: true });
    const externalArtifactPath = writeCandidate(externalContractsRepoRoot, readFixture());
    const vendoredArtifactPath = writeCandidate(vendoredContractsRepoRoot, readFixture());

    const external = await admit(externalContractsRepoRoot, externalArtifactPath);
    const vendored = await admitAtlasKnowledgeCandidate({
      projectRoot: vendoredContractsRepoRoot,
      artifactPath: vendoredArtifactPath,
      atlasContractsRoot: vendoredAtlasContractsRoot
    });

    expect(vendored.candidate_record_id).toBe(external.candidate_record_id);
    expect(readQueue(vendoredContractsRepoRoot).candidates[0]?.source_artifact.path).toBe('project://candidate.json');
  });

  it('rejects the Atlas bad-kind fixture through the Atlas-owned validator', async () => {
    await expect(admit(createRepo(), badKindFixturePath)).rejects.toMatchObject({
      reasonCode: 'KNOWLEDGE_ATLAS_VALIDATION_FAILED',
      details: expect.arrayContaining([expect.stringContaining('$.kind')])
    });
  });

  it('rejects unsupported destinations without normalizing spelling or meaning', async () => {
    const repoRoot = createRepo();
    const artifactPath = writeCandidate(repoRoot, { ...readFixture(), suggested_destination: 'playbook/failure-modes' });
    await expect(admit(repoRoot, artifactPath)).rejects.toMatchObject({
      reasonCode: 'KNOWLEDGE_DESTINATION_UNSUPPORTED'
    });
  });

  it('rejects explicit and review-state auto-promotion paths', async () => {
    await expect(admit(createRepo(), validFixturePath, true)).rejects.toMatchObject({
      reasonCode: 'KNOWLEDGE_AUTO_PROMOTION_FORBIDDEN'
    });

    const repoRoot = createRepo();
    const artifactPath = writeCandidate(repoRoot, {
      ...readFixture(),
      review: {
        status: 'accepted',
        reviewer: 'operator',
        reviewed_at: '2026-07-13T04:00:00Z',
        decision_note: 'Still requires explicit Playbook promotion.'
      }
    });
    await expect(admit(repoRoot, artifactPath)).rejects.toMatchObject({
      reasonCode: 'KNOWLEDGE_AUTO_PROMOTION_FORBIDDEN'
    });
  });

  it('rejects stored candidate identity loss on replay', async () => {
    const repoRoot = createRepo();
    await admit(repoRoot);
    const queue = readQueue(repoRoot);
    queue.candidates[0]!.candidate.candidate_id = 'mutated-identity';
    writeQueue(repoRoot, queue);

    await expect(admit(repoRoot)).rejects.toMatchObject({ reasonCode: 'KNOWLEDGE_IDENTITY_LOST' });
  });

  it('upgrades an exact legacy queue record once and then replays byte-identically', async () => {
    const repoRoot = createRepo();
    writeQueue(repoRoot, {
      schema_version: '1.0',
      kind: 'playbook.atlas-knowledge-candidate.queue.v1',
      candidates: [buildLegacyRecord(readFixture())]
    });

    const upgraded = await admit(repoRoot);
    const upgradedBytes = fs.readFileSync(queuePath(repoRoot), 'utf8');
    const replayed = await admit(repoRoot);

    expect(upgraded.status).toBe('upgraded');
    expect(replayed.status).toBe('replayed');
    expect(replayed.candidate_record_id).toBe(upgraded.candidate_record_id);
    expect(fs.readFileSync(queuePath(repoRoot), 'utf8')).toBe(upgradedBytes);
    expect(readQueue(repoRoot).candidates).toHaveLength(1);
  });

  it('rejects byte-different replay even when parsed candidate content is unchanged', async () => {
    const repoRoot = createRepo();
    const candidate = readFixture();
    const artifactPath = writeCandidate(repoRoot, candidate);
    await admit(repoRoot, artifactPath);
    fs.writeFileSync(artifactPath, `${JSON.stringify(candidate)}\n`, 'utf8');

    await expect(admit(repoRoot, artifactPath)).rejects.toMatchObject({
      reasonCode: 'KNOWLEDGE_SOURCE_ARTIFACT_MISMATCH'
    });
  });

  it('rejects provenance classification loss on replay', async () => {
    const repoRoot = createRepo();
    await admit(repoRoot);
    const queue = readQueue(repoRoot);
    queue.candidates[0]!.candidate.provenance[0]!.classification = 'unknown';
    writeQueue(repoRoot, queue);

    await expect(admit(repoRoot)).rejects.toMatchObject({ reasonCode: 'KNOWLEDGE_PROVENANCE_MISMATCH' });
  });

  it('rejects a missing correlated consumer receipt on replay', async () => {
    const repoRoot = createRepo();
    await admit(repoRoot);
    const queue = readQueue(repoRoot) as AtlasKnowledgeCandidateQueue & { candidates: Array<Record<string, unknown>> };
    delete queue.candidates[0]!.consumer_receipt;
    writeQueue(repoRoot, queue as AtlasKnowledgeCandidateQueue);

    await expect(admit(repoRoot)).rejects.toMatchObject({ reasonCode: 'KNOWLEDGE_CONSUMER_RECEIPT_MISSING' });
  });

  it('fails closed when the Atlas validator seam is unavailable', async () => {
    await expect(admitAtlasKnowledgeCandidate({
      projectRoot: createRepo(),
      artifactPath: validFixturePath,
      atlasContractsRoot: path.join(createRepo(), 'missing-atlas-contracts')
    })).rejects.toMatchObject({ reasonCode: 'KNOWLEDGE_ATLAS_VALIDATOR_UNAVAILABLE' });
  });
});
