import { admitAtlasKnowledgeCandidate } from '@zachariahredfield/playbook-engine';
import { readOptionValue } from './shared.js';

const requireOption = (args: string[], optionName: string): string => {
  const value = readOptionValue(args, optionName);
  if (!value) {
    throw new Error(`playbook knowledge atlas-admit: ${optionName} is required`);
  }
  return value;
};

export const runAtlasKnowledgeCandidateAdmission = (cwd: string, args: string[]) =>
  admitAtlasKnowledgeCandidate({
    projectRoot: cwd,
    artifactPath: requireOption(args, '--artifact'),
    atlasContractsRoot: requireOption(args, '--atlas-contracts-root'),
    attemptPromotion: args.includes('--promote')
  });
