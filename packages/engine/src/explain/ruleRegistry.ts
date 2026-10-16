export type RuleMetadata = {
  id: string;
  purpose: string;
  fix: string[];
  ownership: {
    area: string;
    owners: string[];
    remediationType: string;
  };
};

const RULE_REGISTRY: Record<string, RuleMetadata> = {
  PB001: {
    id: 'PB001',
    purpose: 'Ensure architecture documentation exists and stays aligned with implementation intent.',
    fix: ['Update docs/ARCHITECTURE.md with the current system shape and module boundaries.'],
    ownership: {
      area: 'documentation',
      owners: ['docs'],
      remediationType: 'docs-sync'
    }
  },
  'notes.missing': {
    id: 'notes.missing',
    purpose: 'Require a PLAYBOOK_NOTES file so governance intent can be reviewed deterministically.',
    fix: ['Create PLAYBOOK_NOTES.md with a short summary of governance and architecture decisions.'],
    ownership: {
      area: 'governance',
      owners: ['governance'],
      remediationType: 'notes-maintenance'
    }
  },
  'notes.empty': {
    id: 'notes.empty',
    purpose: 'Prevent empty governance notes files that provide no actionable context.',
    fix: ['Add meaningful notes to PLAYBOOK_NOTES.md describing rationale and intended repository direction.'],
    ownership: {
      area: 'governance',
      owners: ['governance'],
      remediationType: 'notes-maintenance'
    }
  },
  requireNotesOnChanges: {
    id: 'requireNotesOnChanges',
    purpose: 'Require governance notes updates when source changes introduce architectural or policy impact.',
    fix: ['Update PLAYBOOK_NOTES.md in the same change when governance-relevant source files are modified.'],
    ownership: {
      area: 'governance',
      owners: ['governance'],
      remediationType: 'notes-maintenance'
    }
  },
  'verify.rule.tests.required': {
    id: 'verify.rule.tests.required',
    purpose: 'Require tests for new CLI commands and verify-rule changes.',
    fix: ['Add or update tests covering new command behavior and verify rule assertions.'],
    ownership: {
      area: 'quality',
      owners: ['cli', 'testing'],
      remediationType: 'test-coverage'
    }
  },
  'protected-doc.governance': {
    id: 'protected-doc.governance',
    purpose: 'Require protected singleton-doc consolidation to be reviewed, conflict-free, and drift-free before merge.',
    fix: [
      'Create or refresh `.playbook/docs-consolidation-plan.json` from the reviewed consolidation artifacts.',
      'Resolve protected-doc conflicts or drift before retrying apply or merge.'
    ],
    ownership: {
      area: 'governance',
      owners: ['docs'],
      remediationType: 'protected-doc-consolidation'
    }
  },
  'release.version-governance': {
    id: 'release.version-governance',
    purpose: 'Require evidence-backed release/version governance updates for release-relevant changes.',
    fix: [
      'Run `pnpm playbook release sync --check` to detect version/changelog mismatches and review actionable tasks.',
      'Run `pnpm playbook release sync` to materialize reviewed version/changelog updates through the canonical apply boundary.',
      'Rerun `pnpm playbook verify --json` after release sync reports aligned version/changelog state.'
    ],
    ownership: {
      area: 'release',
      owners: ['release'],
      remediationType: 'version-changelog-sync'
    }
  }
};

const normalizeRuleId = (ruleId: string): string => {
  const exact = RULE_REGISTRY[ruleId];
  if (exact) {
    return ruleId;
  }

  const lower = ruleId.toLowerCase();
  const matched = Object.keys(RULE_REGISTRY).find((id) => id.toLowerCase() === lower);
  return matched ?? ruleId;
};

export const getRuleMetadata = (ruleId: string): RuleMetadata | undefined => RULE_REGISTRY[normalizeRuleId(ruleId)];

export const listRuleMetadata = (): RuleMetadata[] =>
  Object.values(RULE_REGISTRY).sort((left, right) => left.id.localeCompare(right.id));
