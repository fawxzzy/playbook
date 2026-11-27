import type { Rule } from '../execution/types.js';
import type { PlaybookConfig } from '../config/schema.js';
import { requireNotesFileWhenGovernanceExists } from '../verify/rules/requireNotesFileWhenGovernanceExists.js';
import { requireNotesOnChanges } from '../verify/rules/requireNotesOnChanges.js';
import { migrationsAppendOnly } from '../verify/rules/migrationsAppendOnly.js';
import { generatedFilesInSync } from '../verify/rules/generatedFilesInSync.js';
import { requireTestRegistration } from '../verify/rules/requireTestRegistration.js';
import { getChangedFileStatuses } from '../git/diff.js';
import { requireTestsForNewCommands } from '../verify/rules/requireTestsForNewCommands.js';
import { verifyProtectedDocGovernance } from '../verify/rules/protectedDocGovernance.js';
import { verifyReleaseVersionGovernance } from '../verify/rules/releaseVersionGovernance.js';

export const getCoreRules = (config: PlaybookConfig): Rule[] => [
  {
    id: 'requireNotesFileWhenGovernanceExists',
    description: 'Require notes file whenever governance document exists.',
    check: ({ repoRoot }) => ({ failures: requireNotesFileWhenGovernanceExists(repoRoot) })
  },
  {
    id: 'requireNotesOnChanges',
    description: 'Require PLAYBOOK_NOTES updates when source changes occur.',
    check: ({ changedFiles }) => ({
      failures: requireNotesOnChanges(changedFiles, config.verify.rules.requireNotesOnChanges)
    })
  },
  {
    id: 'migrationsAppendOnly',
    description: 'Fail when configured migration files are modified, renamed or deleted instead of appended.',
    check: ({ repoRoot, baseSha }) => {
      const rules = config.verify.rules.migrationsAppendOnly ?? [];
      // Opt-in: no configured globs or no diff base means nothing to enforce (and no git call).
      if (!rules.length || !baseSha) return { failures: [] };
      return { failures: migrationsAppendOnly(getChangedFileStatuses(repoRoot, baseSha), rules) };
    }
  },
  {
    id: 'generatedFilesInSync',
    description: 'Fail when a configured generator input changes but none of its generated outputs change.',
    check: ({ repoRoot, baseSha }) => {
      const rules = config.verify.rules.generatedFilesInSync ?? [];
      // Opt-in: no configured entries or no diff base means nothing to enforce (and no git call).
      if (!rules.length || !baseSha) return { failures: [] };
      return { failures: generatedFilesInSync(getChangedFileStatuses(repoRoot, baseSha), rules) };
    }
  },
  {
    id: 'requireTestRegistration',
    description: 'Fail when a newly added test file is not listed in any configured CI test list.',
    check: ({ repoRoot, baseSha }) => {
      const rules = config.verify.rules.requireTestRegistration ?? [];
      // Opt-in: no configured entries or no diff base means nothing to enforce (and no git call).
      if (!rules.length || !baseSha) return { failures: [] };
      return { failures: requireTestRegistration(repoRoot, getChangedFileStatuses(repoRoot, baseSha), rules) };
    }
  },
  {
    id: 'verify.rule.tests.required',
    description: 'Require tests for newly added CLI commands.',
    check: ({ repoRoot, changedFiles }) => ({ failures: requireTestsForNewCommands(repoRoot, changedFiles) })
  },
  {
    id: 'protected-doc.governance',
    description: 'Fail closed when protected-doc consolidation is unresolved or drift-conflicted.',
    check: ({ repoRoot }) => ({ failures: verifyProtectedDocGovernance(repoRoot) })
  },
  {
    id: 'release.version-governance',
    description: 'Fail closed when release-relevant changes ship without coordinated version governance updates.',
    check: ({ repoRoot, baseRef, baseSha }) => ({ failures: verifyReleaseVersionGovernance(repoRoot, { baseRef, baseSha }) })
  }
];
