import type { FixHandler, Rule } from '../execution/types.js';

/** Plugin Contract version implemented by this engine. See docs/contracts/PLUGIN_CONTRACT_V1.md. */
export const PLUGIN_CONTRACT_VERSION = 1;

export type PluginRuleFailureRef = {
  id: string;
  message: string;
  evidence?: string;
  fix?: string;
};

/** Optional explainability, policy and remediation metadata a rule can carry. */
export type PluginRuleGuidance = {
  policy?: { id: string; description?: string };
  explanation?: string;
  remediation?: string[];
  fix?: FixHandler;
  /** Decides whether a reported failure is explained by this rule. Defaults to `failure.id === rule.id`. */
  matchesFailure?: (failure: PluginRuleFailureRef) => boolean;
};

export type PlaybookRule = Rule & PluginRuleGuidance;

export interface StackDetector {
  id: string;
  label: string;
  detect(repo: RepoContext): DetectionResult | null;
}

export interface RepoContext {
  repoRoot: string;
  packageJsonPath: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface DetectionResult {
  confidence: number;
  evidence: string[];
}

export interface PlaybookPlugin {
  name: string;
  /** Plugin Contract version. Absent means 1. Any other value is skipped with a notice. */
  contractVersion?: number;
  rules?: PlaybookRule[];
  detectors?: StackDetector[];
}
