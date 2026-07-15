import { beforeEach, describe, expect, it, vi } from 'vitest';

const { admitAtlasKnowledgeCandidate } = vi.hoisted(() => ({
  admitAtlasKnowledgeCandidate: vi.fn()
}));

vi.mock('@zachariahredfield/playbook-engine', () => ({
  admitAtlasKnowledgeCandidate
}));

import { runAtlasKnowledgeCandidateAdmission } from './atlasCandidate.js';

describe('runAtlasKnowledgeCandidateAdmission', () => {
  beforeEach(() => {
    admitAtlasKnowledgeCandidate.mockReset();
  });

  it('forwards explicit promotion intent to the fail-closed engine boundary', async () => {
    const rejection = Object.assign(new Error('automatic promotion forbidden'), {
      reasonCode: 'KNOWLEDGE_AUTO_PROMOTION_FORBIDDEN'
    });
    admitAtlasKnowledgeCandidate.mockRejectedValue(rejection);

    await expect(runAtlasKnowledgeCandidateAdmission('/repo', [
      'atlas-admit',
      '--artifact',
      '/atlas/knowledge-candidate.json',
      '--atlas-contracts-root',
      '/atlas/packages/atlas-contracts',
      '--promote'
    ])).rejects.toBe(rejection);

    expect(admitAtlasKnowledgeCandidate).toHaveBeenCalledWith({
      projectRoot: '/repo',
      artifactPath: '/atlas/knowledge-candidate.json',
      atlasContractsRoot: '/atlas/packages/atlas-contracts',
      attemptPromotion: true
    });
  });

  it('requires both explicit integration paths', () => {
    expect(() => runAtlasKnowledgeCandidateAdmission('/repo', ['atlas-admit']))
      .toThrow('playbook knowledge atlas-admit: --artifact is required');
    expect(() => runAtlasKnowledgeCandidateAdmission('/repo', [
      'atlas-admit',
      '--artifact',
      '/atlas/knowledge-candidate.json'
    ])).toThrow('playbook knowledge atlas-admit: --atlas-contracts-root is required');
    expect(admitAtlasKnowledgeCandidate).not.toHaveBeenCalled();
  });
});
