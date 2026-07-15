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

  it('forwards exact artifact and Atlas validator roots without widening promotion authority', async () => {
    admitAtlasKnowledgeCandidate.mockResolvedValue({ status: 'admitted' });

    await runAtlasKnowledgeCandidateAdmission('/repo', [
      'atlas-admit',
      '--artifact',
      '/atlas/knowledge-candidate.json',
      '--atlas-contracts-root',
      '/atlas/packages/atlas-contracts'
    ]);

    expect(admitAtlasKnowledgeCandidate).toHaveBeenCalledWith({
      projectRoot: '/repo',
      artifactPath: '/atlas/knowledge-candidate.json',
      atlasContractsRoot: '/atlas/packages/atlas-contracts',
      attemptPromotion: false
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
