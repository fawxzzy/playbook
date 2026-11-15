import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { runDocsAudit } from '../src/docs/audit.js';

const tmpRoots: string[] = [];

const write = (root: string, relativePath: string, content = ''): void => {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
};

const createRepo = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-audit-'));
  tmpRoots.push(root);

  const minimalActiveDocs: Record<string, string> = {
    'README.md': '# README\nai-context ai-contract context verify plan apply',
    'AGENTS.md': '# AGENTS',
    'docs/index.md': '# Index\nai-context ai-contract context verify plan apply',
    'docs/ARCHITECTURE.md': '# Architecture',
    'docs/commands/README.md': '# Commands\nLifecycle Role Discoverability',
    'docs/commands/docs.md': '# docs audit',
    'docs/PLAYBOOK_PRODUCT_ROADMAP.md':
      '# Product roadmap\n## Fact\nObserved roadmap evidence.\n## Interpretation\nCurrent roadmap implications.\n## Narrative\nRoadmap entries describe implementation intent and may include planned command families that are not yet discoverable in current CLI help. Treat `playbook --help` and implemented command contracts as the source of truth for live command availability.',
    'docs/PLAYBOOK_DEV_WORKFLOW.md': '# Development workflow\n## Fact\nValidated checks.\n## Interpretation\nWhy checks matter.\n## Narrative\nHow to communicate updates.',
    'docs/PLAYBOOK_BUSINESS_STRATEGY.md': '# Business strategy',
    'docs/CONSUMER_INTEGRATION_CONTRACT.md': '# Consumer contract',
    'docs/AI_AGENT_CONTEXT.md': '# AI context\nai-context ai-contract context verify plan apply',
    'docs/ONBOARDING_DEMO.md':
      '# Onboarding\nai-context ai-contract context verify plan apply\nSupported question classes\nUnsupported question classes\nDeterministic fallback',
    'docs/REFERENCE/cli.md': '# CLI reference',
    'docs/FAQ.md': '# FAQ\nai-context ai-contract context verify plan apply',
    'docs/GITHUB_SETUP.md': '# GitHub setup',
    'docs/roadmap/README.md': '# Roadmap readme',
    'docs/roadmap/ROADMAP.json': '{}',
    'docs/contracts/command-truth.json': JSON.stringify(
      {
        bootstrapLadder: ['ai-context', 'ai-contract', 'context'],
        remediationLoop: ['verify', 'plan', 'apply', 'verify'],
        canonicalCommands: ['ai-context'],
        compatibilityCommands: ['analyze'],
        utilityCommands: ['demo']
      },
      null,
      2
    ),
    'docs/roadmap/IMPROVEMENTS_BACKLOG.md': '# Backlog',
    'docs/RELEASING.md': '# Releasing',
    'docs/archive/README.md': '# Archive',
    'packages/cli/README.md': '# CLI\nai-context ai-contract context verify plan apply',
    'docs/PLAYBOOK_IMPROVEMENTS.md':
      '# Compatibility stub\nSuperseded and archived. See docs/archive/PLAYBOOK_IMPROVEMENTS_2026.md and docs/roadmap/IMPROVEMENTS_BACKLOG.md.',
    'docs/REPORT_DOCS_MERGE.md':
      '# Compatibility redirect\nSuperseded and archived in docs/archive/REPORT_DOCS_MERGE_2026.md. Canonical docs are in docs/index.md.'
  };

  Object.entries(minimalActiveDocs).forEach(([relativePath, content]) => write(root, relativePath, content));
  return root;
};

afterEach(() => {
  while (tmpRoots.length > 0) {
    const root = tmpRoots.pop();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('docs audit', () => {
  it('passes when a subapp repo truth pack includes the required files and context fields', () => {
    const root = createRepo();
    write(
      root,
      'subapps/proving-ground-app/playbook/context.json',
      JSON.stringify(
        {
          repo_id: 'proving-ground-app',
          repo_name: 'Proving Ground App',
          mission: 'Validate lightweight repository truth pack contracts.',
          current_phase: 'validation',
          current_focus: 'Document and enforce truth pack structure.',
          invariants: ['Truth pack is committed and human-readable.'],
          dependencies: ['@fawxzzy/playbook'],
          integration_surfaces: ['webhook:playbook-ingest'],
          next_milestones: ['Integrate truth-pack ingestion adapter.'],
          open_questions: ['Should cadence include weekly touchpoints?'],
          last_verified_timestamp: '2026-03-27T00:00:00Z'
        },
        null,
        2
      )
    );
    write(root, 'subapps/proving-ground-app/docs/architecture.md', '# Architecture');
    write(root, 'subapps/proving-ground-app/docs/roadmap.md', '# Roadmap');
    write(root, 'subapps/proving-ground-app/docs/adr/README.md', '# ADR');
    write(
      root,
      'subapps/proving-ground-app/playbook/app-integration.json',
      JSON.stringify({ integration_id: 'playbook-proving-ground', status: 'integrated' }, null, 2)
    );
    write(
      root,
      'subapps/proving-ground-app/playbook/runtime-manifest.json',
      JSON.stringify(
        {
          app_identity: { app_id: 'proving-ground-app' },
          runtime_role: 'integration-proving-ground',
          runtime_status: 'integrated',
          signal_groups: ['repo-truth-pack-signals'],
          state_snapshot_types: ['subapp-truth-pack-context-v1'],
          bounded_action_families: ['repo-truth-pack-ingest'],
          receipt_families: ['repo-truth-pack-ingest-receipts'],
          integration_seams: ['repo-truth-pack-ingest-v1']
        },
        null,
        2
      )
    );

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.ruleId.startsWith('docs.repo-truth-pack.'))).toBeUndefined();
  });

  it('fails when a subapp repo truth pack context is missing required fields', () => {
    const root = createRepo();
    write(
      root,
      'subapps/proving-ground-app/playbook/context.json',
      JSON.stringify(
        {
          repo_id: 'proving-ground-app',
          repo_name: 'Proving Ground App',
          mission: 'Validate lightweight repository truth pack contracts.'
        },
        null,
        2
      )
    );
    write(root, 'subapps/proving-ground-app/docs/architecture.md', '# Architecture');
    write(root, 'subapps/proving-ground-app/docs/roadmap.md', '# Roadmap');
    write(root, 'subapps/proving-ground-app/docs/adr/README.md', '# ADR');

    const result = runDocsAudit(root);
    expect(
      result.findings.find(
        (finding) => finding.ruleId === 'docs.repo-truth-pack.context-missing-fields' && finding.path === 'subapps/proving-ground-app/playbook/context.json'
      )
    ).toBeDefined();
  });

  it('fails when a subapp repo truth pack is missing required files', () => {
    const root = createRepo();
    write(
      root,
      'subapps/proving-ground-app/playbook/context.json',
      JSON.stringify(
        {
          repo_id: 'proving-ground-app',
          repo_name: 'Proving Ground App',
          mission: 'Validate lightweight repository truth pack contracts.',
          current_phase: 'validation',
          current_focus: 'Document and enforce truth pack structure.',
          invariants: ['Truth pack is committed and human-readable.'],
          dependencies: ['@fawxzzy/playbook'],
          integration_surfaces: ['webhook:playbook-ingest'],
          next_milestones: ['Integrate truth-pack ingestion adapter.'],
          open_questions: ['Should cadence include weekly touchpoints?'],
          last_verified_timestamp: '2026-03-27T00:00:00Z'
        },
        null,
        2
      )
    );

    const result = runDocsAudit(root);
    expect(
      result.findings.find(
        (finding) => finding.ruleId === 'docs.repo-truth-pack.required-file-missing' && finding.path === 'subapps/proving-ground-app/docs/architecture.md'
      )
    ).toBeDefined();
    expect(
      result.findings.find(
        (finding) => finding.ruleId === 'docs.repo-truth-pack.required-file-missing' && finding.path === 'subapps/proving-ground-app/docs/adr'
      )
    ).toBeDefined();
  });


  it('fails when an integrated subapp is missing runtime-manifest.json', () => {
    const root = createRepo();
    write(
      root,
      'subapps/proving-ground-app/playbook/context.json',
      JSON.stringify(
        {
          repo_id: 'proving-ground-app',
          repo_name: 'Proving Ground App',
          mission: 'Validate lightweight repository truth pack contracts.',
          current_phase: 'validation',
          current_focus: 'Document and enforce truth pack structure.',
          invariants: ['Truth pack is committed and human-readable.'],
          dependencies: ['@fawxzzy/playbook'],
          integration_surfaces: ['webhook:playbook-ingest'],
          next_milestones: ['Integrate truth-pack ingestion adapter.'],
          open_questions: ['Should cadence include weekly touchpoints?'],
          last_verified_timestamp: '2026-03-27T00:00:00Z'
        },
        null,
        2
      )
    );
    write(root, 'subapps/proving-ground-app/docs/architecture.md', '# Architecture');
    write(root, 'subapps/proving-ground-app/docs/roadmap.md', '# Roadmap');
    write(root, 'subapps/proving-ground-app/docs/adr/README.md', '# ADR');
    write(
      root,
      'subapps/proving-ground-app/playbook/app-integration.json',
      JSON.stringify({ integration_id: 'playbook-proving-ground', status: 'integrated' }, null, 2)
    );

    const result = runDocsAudit(root);
    expect(
      result.findings.find(
        (finding) =>
          finding.ruleId === 'docs.repo-truth-pack.runtime-manifest-missing' &&
          finding.path === 'subapps/proving-ground-app/playbook/runtime-manifest.json'
      )
    ).toBeDefined();
  });

  it('passes for an integrated subapp with a valid runtime manifest', () => {
    const root = createRepo();
    write(
      root,
      'subapps/proving-ground-app/playbook/context.json',
      JSON.stringify(
        {
          repo_id: 'proving-ground-app',
          repo_name: 'Proving Ground App',
          mission: 'Validate lightweight repository truth pack contracts.',
          current_phase: 'validation',
          current_focus: 'Document and enforce truth pack structure.',
          invariants: ['Truth pack is committed and human-readable.'],
          dependencies: ['@fawxzzy/playbook'],
          integration_surfaces: ['webhook:playbook-ingest'],
          next_milestones: ['Integrate truth-pack ingestion adapter.'],
          open_questions: ['Should cadence include weekly touchpoints?'],
          last_verified_timestamp: '2026-03-27T00:00:00Z'
        },
        null,
        2
      )
    );
    write(root, 'subapps/proving-ground-app/docs/architecture.md', '# Architecture');
    write(root, 'subapps/proving-ground-app/docs/roadmap.md', '# Roadmap');
    write(root, 'subapps/proving-ground-app/docs/adr/README.md', '# ADR');
    write(
      root,
      'subapps/proving-ground-app/playbook/app-integration.json',
      JSON.stringify(
        { integration_id: 'playbook-proving-ground', status: 'integrated', external_truth: { source: 'fitness-contract' } },
        null,
        2
      )
    );
    write(
      root,
      'subapps/proving-ground-app/playbook/runtime-manifest.json',
      JSON.stringify(
        {
          app_identity: { app_id: 'proving-ground-app' },
          runtime_role: 'integration-proving-ground',
          runtime_status: 'integrated',
          signal_groups: ['repo-truth-pack-signals'],
          state_snapshot_types: ['subapp-truth-pack-context-v1'],
          bounded_action_families: ['repo-truth-pack-ingest'],
          receipt_families: ['repo-truth-pack-ingest-receipts'],
          integration_seams: ['repo-truth-pack-ingest-v1'],
          external_truth_contract_ref: 'contracts/fitness-contract.json'
        },
        null,
        2
      )
    );

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.ruleId.startsWith('docs.repo-truth-pack.runtime-manifest'))).toBeUndefined();
  });

  it('does not require runtime-manifest.json for non-integrated subapps', () => {
    const root = createRepo();
    write(
      root,
      'subapps/proving-ground-app/playbook/context.json',
      JSON.stringify(
        {
          repo_id: 'proving-ground-app',
          repo_name: 'Proving Ground App',
          mission: 'Validate lightweight repository truth pack contracts.',
          current_phase: 'validation',
          current_focus: 'Document and enforce truth pack structure.',
          invariants: ['Truth pack is committed and human-readable.'],
          dependencies: ['@fawxzzy/playbook'],
          integration_surfaces: ['webhook:playbook-ingest'],
          next_milestones: ['Integrate truth-pack ingestion adapter.'],
          open_questions: ['Should cadence include weekly touchpoints?'],
          last_verified_timestamp: '2026-03-27T00:00:00Z'
        },
        null,
        2
      )
    );
    write(root, 'subapps/proving-ground-app/docs/architecture.md', '# Architecture');
    write(root, 'subapps/proving-ground-app/docs/roadmap.md', '# Roadmap');
    write(root, 'subapps/proving-ground-app/docs/adr/README.md', '# ADR');
    write(
      root,
      'subapps/proving-ground-app/playbook/app-integration.json',
      JSON.stringify({ integration_id: 'playbook-proving-ground', status: 'draft' }, null, 2)
    );

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.ruleId === 'docs.repo-truth-pack.runtime-manifest-missing')).toBeUndefined();
  });

  it('accepts generalized archive naming and archive README', () => {
    const root = createRepo();
    write(root, 'docs/archive/PLAYBOOK_IMPROVEMENTS_2026.md', '# archived');
    write(root, 'docs/archive/OVERVIEW_2026.md', '# archived');

    const result = runDocsAudit(root);
    const archiveFindings = result.findings.filter((finding) => finding.ruleId === 'docs.backlog-hygiene.archive-name');
    expect(archiveFindings).toHaveLength(0);
  });

  it('does not flag intentional compatibility stubs as cleanup candidates', () => {
    const root = createRepo();

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.ruleId === 'docs.cleanup-dedupe.candidate' && finding.path === 'docs/REPORT_DOCS_MERGE.md')).toBeUndefined();
  });

  it('flags active docs using legacy package scope and unscoped npx', () => {
    const root = createRepo();
    write(root, 'docs/FAQ.md', '# FAQ\nnpx playbook verify\nnpx @zachariahredfield/playbook verify');

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.ruleId === 'docs.active-surface.unscoped-npx' && finding.path === 'docs/FAQ.md')).toBeDefined();
    expect(result.findings.find((finding) => finding.ruleId === 'docs.active-surface.package-scope' && finding.path === 'docs/FAQ.md')).toBeDefined();
  });

  it('flags active docs referencing superseded doc paths', () => {
    const root = createRepo();
    write(root, 'docs/index.md', '# Index\nSee docs/OVERVIEW.md\nai-context ai-contract context verify plan apply');

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.ruleId === 'docs.active-surface.legacy-link' && finding.path === 'docs/index.md')).toBeDefined();
  });

  it('flags front-door docs that are analyze-first without compatibility framing', () => {
    const root = createRepo();
    write(root, 'packages/cli/README.md', '# CLI\n## 30-second demo\nUse analyze first.');

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.ruleId === 'docs.front-door.ladder-drift' && finding.path === 'packages/cli/README.md')).toBeDefined();
  });

  it('fails when command truth contract is missing', () => {
    const root = createRepo();
    fs.rmSync(path.join(root, 'docs/contracts/command-truth.json'));

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.ruleId === 'docs.command-truth.missing')).toBeDefined();
  });

  it('fails when command truth metadata contains duplicate command entries', () => {
    const root = createRepo();
    write(
      root,
      'docs/contracts/command-truth.json',
      JSON.stringify(
        {
          bootstrapLadder: ['ai-context', 'ai-contract', 'context'],
          remediationLoop: ['verify', 'plan', 'apply', 'verify'],
          canonicalCommands: ['ai-context'],
          compatibilityCommands: ['analyze'],
          utilityCommands: ['demo'],
          commandTruth: [
            { name: 'verify', productFacing: true },
            { name: 'verify', productFacing: true }
          ]
        },
        null,
        2
      )
    );

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.ruleId === 'docs.command-truth.duplicate-command')).toBeDefined();
  });

  it('fails when docs command status managed table drifts from command truth', () => {
    const root = createRepo();
    write(
      root,
      'docs/contracts/command-truth.json',
      JSON.stringify(
        {
          bootstrapLadder: ['ai-context', 'ai-contract', 'context'],
          remediationLoop: ['verify', 'plan', 'apply', 'verify'],
          canonicalCommands: ['verify'],
          compatibilityCommands: [],
          utilityCommands: [],
          commandTruth: [{ name: 'verify', productFacing: true }]
        },
        null,
        2
      )
    );
    write(
      root,
      'docs/commands/README.md',
      '# Commands\n<!-- PLAYBOOK:DOCS_COMMAND_STATUS_START -->\n| Command / Artifact | Purpose |\n| --- | --- |\n| `plan` | Generate |\n<!-- PLAYBOOK:DOCS_COMMAND_STATUS_END -->'
    );

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.ruleId === 'docs.command-truth.status-table-drift')).toBeDefined();
  });


  it('passes postmortems with all required reconsolidation sections', () => {
    const root = createRepo();
    write(
      root,
      'docs/postmortems/incident-001.md',
      [
        '# Incident 001',
        '',
        '## Facts',
        'Observed evidence.',
        '',
        '## Interpretation',
        'What the facts suggest.',
        '',
        '## Fact',
        'Fact layer marker.',
        '',
        '## Narrative',
        'Narrative layer marker.',
        '',
        '## Model Changes',
        'Updated understanding.',
        '',
        '## Promotion Candidates',
        'Candidate follow-up.',
        '',
        '## Non-Promotion Notes',
        'Context that should stay local.',
        ''
      ].join('\n')
    );

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.ruleId === 'docs.postmortem.required-sections')).toBeUndefined();
  });

  it('fails postmortems missing required reconsolidation sections with a stable rule id', () => {
    const root = createRepo();
    write(
      root,
      'docs/postmortems/incident-002.md',
      [
        '# Incident 002',
        '',
        '## Facts',
        'Observed evidence.',
        '',
        '## Interpretation',
        'What the facts suggest.',
        '',
        '## Fact',
        'Fact layer marker.',
        '',
        '## Promotion Candidates',
        'Candidate follow-up.',
        '',
        '## Non-Promotion Notes',
        'Context that should stay local.',
        ''
      ].join('\n')
    );

    const result = runDocsAudit(root);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'docs.postmortem.required-sections',
          path: 'docs/postmortems/incident-002.md',
          level: 'error'
        })
      ])
    );
  });

  it('does not apply postmortem heading validation to non-postmortem docs', () => {
    const root = createRepo();
    write(root, 'docs/notes.md', '# Notes\n\n## Facts\nLoose note only.');

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.path === 'docs/notes.md' && finding.ruleId === 'docs.postmortem.required-sections')).toBeUndefined();
  });

  it('passes architecture decision docs with required rubric sections', () => {
    const root = createRepo();
    write(
      root,
      'docs/architecture/decisions/adr-001.md',
      [
        '# ADR-001',
        '',
        '## Constraints',
        'Constraint details.',
        '',
        '## Cost Surfaces',
        'Cost details.',
        '',
        '## Chosen Shape',
        'Chosen approach.',
        '',
        '## Why This Fits',
        'Fit details.',
        '',
        '## Tradeoffs / Failure Modes',
        'Tradeoffs.',
        '',
        '## Review Triggers',
        'Trigger details.',
        ''
      ].join('\n')
    );

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.ruleId === 'docs.architecture-rubric.required-sections')).toBeUndefined();
  });

  it('fails architecture decision docs missing required rubric sections with a stable rule id', () => {
    const root = createRepo();
    write(
      root,
      'docs/architecture/decisions/adr-002.md',
      ['# ADR-002', '', '## Constraints', 'Constraint details.', '', '## Cost Surfaces', 'Cost details.', ''].join('\n')
    );

    const result = runDocsAudit(root);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'docs.architecture-rubric.required-sections',
          path: 'docs/architecture/decisions/adr-002.md',
          level: 'error'
        })
      ])
    );
  });

  it('does not apply architecture rubric heading validation to non-architecture docs', () => {
    const root = createRepo();
    write(root, 'docs/notes.md', '# Notes\n\n## Constraints\nOptional note.');

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.path === 'docs/notes.md' && finding.ruleId === 'docs.architecture-rubric.required-sections')).toBeUndefined();
  });

  it('fails governed docs missing revision-layer sections with a stable rule id', () => {
    const root = createRepo();
    write(root, 'docs/PLAYBOOK_DEV_WORKFLOW.md', '# Development workflow\n## Fact\nEvidence only.\n## Interpretation\nMeaning only.\n');

    const result = runDocsAudit(root);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: 'docs.revision-layer.required-sections',
          path: 'docs/PLAYBOOK_DEV_WORKFLOW.md',
          level: 'error'
        })
      ])
    );
  });

  it('does not apply governed revision-layer checks to unrelated docs', () => {
    const root = createRepo();
    write(root, 'docs/notes.md', '# Notes\n## Fact\nOptional note.\n');

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.path === 'docs/notes.md' && finding.ruleId === 'docs.revision-layer.required-sections')).toBeUndefined();
  });

  it('fails when global reusable pattern memory points at repo-local storage', () => {
    const root = createRepo();
    write(
      root,
      'docs/commands/patterns.md',
      '# patterns\nGlobal reusable pattern memory lives in `.playbook/memory/knowledge/patterns.json`.\n'
    );

    const result = runDocsAudit(root);
    expect(result.findings.find((finding) => finding.ruleId === 'docs.pattern-storage.scope-path-drift' && finding.path === 'docs/commands/patterns.md')).toBeDefined();
  });

  describe('command truth packaging rules', () => {
    const COMMAND_TRUTH_RULE_IDS = [
      'docs.command-truth.bootstrap-ladder',
      'docs.command-truth.classification-missing',
      'docs.command-truth.roadmap-live-boundary',
      'docs.ask-boundary.contract-missing'
    ] as const;

    const findingsFor = (result: ReturnType<typeof runDocsAudit>, ruleId: string) =>
      result.findings.filter((finding) => finding.ruleId === ruleId);

    it('passes all four command-truth packaging rules on a compliant repo', () => {
      const root = createRepo();

      const result = runDocsAudit(root);
      for (const ruleId of COMMAND_TRUTH_RULE_IDS) {
        expect(findingsFor(result, ruleId)).toEqual([]);
      }
      expect(result.ok).toBe(true);
      expect(result.status).toBe('pass');
    });

    it('warns when README.md or ONBOARDING_DEMO omit a bootstrap ladder command from command truth', () => {
      const root = createRepo();
      write(root, 'README.md', '# README\nai-context context verify plan apply');
      write(
        root,
        'docs/ONBOARDING_DEMO.md',
        '# Onboarding\nai-context context verify plan apply\nSupported question classes\nUnsupported question classes\nDeterministic fallback'
      );

      const result = runDocsAudit(root);
      const findings = findingsFor(result, 'docs.command-truth.bootstrap-ladder');
      expect(findings.map((finding) => finding.path).sort()).toEqual(['README.md', 'docs/ONBOARDING_DEMO.md']);
      for (const finding of findings) {
        expect(finding.level).toBe('warning');
        expect(finding.suggestedDestination).toBe('docs/contracts/command-truth.json');
      }
      expect(result.ok).toBe(true);
      expect(result.status).toBe('warn');
    });

    it('follows the bootstrap ladder declared in command truth metadata rather than a hard-coded list', () => {
      const root = createRepo();
      write(
        root,
        'docs/contracts/command-truth.json',
        JSON.stringify({
          bootstrapLadder: ['ai-context', 'ai-contract', 'context', 'index'],
          remediationLoop: ['verify', 'plan', 'apply', 'verify'],
          canonicalCommands: ['ai-context'],
          compatibilityCommands: [],
          utilityCommands: []
        })
      );

      const result = runDocsAudit(root);
      expect(findingsFor(result, 'docs.command-truth.bootstrap-ladder').map((finding) => finding.path).sort()).toEqual([
        'README.md',
        'docs/ONBOARDING_DEMO.md'
      ]);
    });

    it('warns when docs/commands/README.md does not expose lifecycle, role, or discoverability', () => {
      const root = createRepo();
      write(root, 'docs/commands/README.md', '# Commands\nA list of commands without classification metadata.');

      const result = runDocsAudit(root);
      const findings = findingsFor(result, 'docs.command-truth.classification-missing');
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        level: 'warning',
        path: 'docs/commands/README.md',
        suggestedDestination: 'docs/contracts/command-truth.json'
      });
    });

    it('accepts any one of lifecycle, role, or discoverability in docs/commands/README.md', () => {
      for (const marker of ['lifecycle', 'ROLE', 'Discoverability']) {
        const root = createRepo();
        write(root, 'docs/commands/README.md', `# Commands\nEach command declares its ${marker}.`);

        const result = runDocsAudit(root);
        expect(findingsFor(result, 'docs.command-truth.classification-missing')).toEqual([]);
      }
    });

    it('warns when ONBOARDING_DEMO omits the ask --repo-context question-class boundary', () => {
      const root = createRepo();
      write(root, 'docs/ONBOARDING_DEMO.md', '# Onboarding\nai-context ai-contract context verify plan apply');

      const result = runDocsAudit(root);
      const findings = findingsFor(result, 'docs.ask-boundary.contract-missing');
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        level: 'warning',
        path: 'docs/ONBOARDING_DEMO.md',
        suggestedDestination: 'docs/commands/README.md'
      });
      expect(findingsFor(result, 'docs.command-truth.bootstrap-ladder')).toEqual([]);
    });

    it('accepts either supported, unsupported, or deterministic-fallback wording for the ask boundary', () => {
      for (const phrase of ['Supported question classes', 'unsupported question classes', 'Deterministic fallback']) {
        const root = createRepo();
        write(root, 'docs/ONBOARDING_DEMO.md', `# Onboarding\nai-context ai-contract context verify plan apply\n${phrase}`);

        const result = runDocsAudit(root);
        expect(findingsFor(result, 'docs.ask-boundary.contract-missing')).toEqual([]);
      }
    });

    it('warns when the product roadmap does not separate planned intent from live command availability', () => {
      const root = createRepo();
      write(
        root,
        'docs/PLAYBOOK_PRODUCT_ROADMAP.md',
        '# Product roadmap\n## Fact\nObserved.\n## Interpretation\nImplications.\n## Narrative\nEverything listed here is available today.'
      );

      const result = runDocsAudit(root);
      const findings = findingsFor(result, 'docs.command-truth.roadmap-live-boundary');
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({
        level: 'warning',
        path: 'docs/PLAYBOOK_PRODUCT_ROADMAP.md',
        suggestedDestination: 'docs/commands/README.md'
      });
    });

    it('skips all four packaging rules when command truth metadata is missing and reports the missing contract instead', () => {
      const root = createRepo();
      fs.rmSync(path.join(root, 'docs/contracts/command-truth.json'));
      write(root, 'README.md', '# README');
      write(root, 'docs/commands/README.md', '# Commands');
      write(root, 'docs/ONBOARDING_DEMO.md', '# Onboarding');
      write(root, 'docs/PLAYBOOK_PRODUCT_ROADMAP.md', '# Product roadmap\n## Fact\nx\n## Interpretation\nx\n## Narrative\nx');

      const result = runDocsAudit(root);
      for (const ruleId of COMMAND_TRUTH_RULE_IDS) {
        expect(findingsFor(result, ruleId)).toEqual([]);
      }
      expect(findingsFor(result, 'docs.command-truth.missing')).toHaveLength(1);
      expect(result.ok).toBe(false);
      expect(result.status).toBe('fail');
    });

    it('does not let a bare `context` ladder step be satisfied by `ai-context`', () => {
      const root = createRepo();
      write(root, 'README.md', '# README\nai-context ai-contract verify plan apply');
      write(
        root,
        'docs/ONBOARDING_DEMO.md',
        '# Onboarding\nRun pnpm playbook ai-context --json then ai-contract.\nSupported question classes\nUnsupported question classes\nDeterministic fallback'
      );

      const result = runDocsAudit(root);
      const findings = findingsFor(result, 'docs.command-truth.bootstrap-ladder');
      expect(findings.map((finding) => finding.path).sort()).toEqual(['README.md', 'docs/ONBOARDING_DEMO.md']);
      for (const finding of findings) {
        expect(finding.level).toBe('warning');
        expect(finding.message).toContain('missing: context');
      }
    });

    it('accepts ladder commands that appear as standalone tokens in prose, code spans, and punctuation', () => {
      const root = createRepo();
      write(root, 'README.md', '# README\n`ai-context`, ai-contract; (context) -> verify plan apply');

      const result = runDocsAudit(root);
      expect(findingsFor(result, 'docs.command-truth.bootstrap-ladder').filter((finding) => finding.path === 'README.md')).toEqual([]);
    });

    describe('per-command classification values', () => {
      const writeTruthAndTable = (root: string, rows: string[], header = '| Command / Artifact | Purpose | Lifecycle | Role | Discoverability |') => {
        write(
          root,
          'docs/contracts/command-truth.json',
          JSON.stringify({
            bootstrapLadder: ['ai-context', 'ai-contract', 'context'],
            remediationLoop: ['verify', 'plan', 'apply', 'verify'],
            canonicalCommands: ['verify', 'analyze'],
            compatibilityCommands: ['analyze'],
            utilityCommands: [],
            commandTruth: [
              { name: 'verify', lifecycle: 'canonical', role: 'governance', discoverability: 'primary', productFacing: true },
              { name: 'analyze', lifecycle: 'compatibility', role: 'compatibility', discoverability: 'hidden-compatibility', productFacing: true }
            ]
          })
        );
        write(
          root,
          'docs/commands/README.md',
          ['# Commands', '<!-- PLAYBOOK:DOCS_COMMAND_STATUS_START -->', header, '| --- | --- | --- | --- | --- |', ...rows, '<!-- PLAYBOOK:DOCS_COMMAND_STATUS_END -->'].join('\n')
        );
      };

      it('passes when every documented classification matches command truth', () => {
        const root = createRepo();
        writeTruthAndTable(root, [
          '| `verify` | Verify | canonical | governance | primary |',
          '| `analyze` | Analyze | compatibility | compatibility | hidden-compatibility |'
        ]);

        const result = runDocsAudit(root);
        expect(findingsFor(result, 'docs.command-truth.classification-missing')).toEqual([]);
        expect(findingsFor(result, 'docs.command-truth.status-table-drift')).toEqual([]);
      });

      it('warns per command when a documented lifecycle, role, or discoverability differs from command truth', () => {
        const root = createRepo();
        writeTruthAndTable(root, [
          '| `verify` | Verify | utility | governance | secondary |',
          '| `analyze` | Analyze | compatibility | compatibility | hidden-compatibility |'
        ]);

        const result = runDocsAudit(root);
        const findings = findingsFor(result, 'docs.command-truth.classification-missing');
        expect(findings).toHaveLength(1);
        expect(findings[0]).toMatchObject({
          level: 'warning',
          path: 'docs/commands/README.md',
          suggestedDestination: 'pnpm docs:update'
        });
        expect(findings[0].message).toContain('"verify"');
        expect(findings[0].message).toContain('lifecycle is "utility" but command truth says "canonical"');
        expect(findings[0].message).toContain('discoverability is "secondary" but command truth says "primary"');
        expect(findings[0].message).not.toContain('role is');
        expect(result.ok).toBe(true);
        expect(result.status).toBe('warn');
      });

      it('reports each drifting command separately', () => {
        const root = createRepo();
        writeTruthAndTable(root, [
          '| `verify` | Verify | utility | governance | primary |',
          '| `analyze` | Analyze | canonical | compatibility | hidden-compatibility |'
        ]);

        const result = runDocsAudit(root);
        const findings = findingsFor(result, 'docs.command-truth.classification-missing');
        expect(findings).toHaveLength(2);
        expect(findings.map((finding) => finding.message.match(/for "([^"]+)"/u)?.[1]).sort()).toEqual(['analyze', 'verify']);
      });

      it('skips per-command validation when the status table does not expose classification columns', () => {
        const root = createRepo();
        writeTruthAndTable(
          root,
          ['| `verify` | Verify | utility | governance | secondary |', '| `analyze` | Analyze | utility | utility | secondary |'],
          '| Command / Artifact | Purpose | Kind | Owner | Visibility |'
        );

        const result = runDocsAudit(root);
        // Only the generic keyword warning may fire; no per-command drift finding is produced.
        expect(findingsFor(result, 'docs.command-truth.classification-missing').filter((finding) => finding.message.includes('drifts from command truth'))).toEqual([]);
      });

      it('ignores documented rows for commands that command truth does not know', () => {
        const root = createRepo();
        writeTruthAndTable(root, [
          '| `verify` | Verify | canonical | governance | primary |',
          '| `analyze` | Analyze | compatibility | compatibility | hidden-compatibility |',
          '| `ghost` | Ghost | utility | utility | secondary |'
        ]);

        const result = runDocsAudit(root);
        expect(findingsFor(result, 'docs.command-truth.classification-missing')).toEqual([]);
      });
    });
  });
});

describe('docs audit repo profile scoping', () => {
  const PRODUCT_ONLY_RULE_IDS = [
    'docs.command-truth.missing',
    'docs.repo-roadmap.contract-missing-sections',
    'docs.repo-roadmap.stories-dir-missing',
    'docs.single-roadmap.duplicate'
  ];
  const PRODUCT_ONLY_ANCHORS = [
    'docs/index.md',
    'docs/commands/README.md',
    'docs/archive/README.md',
    'docs/CONSUMER_INTEGRATION_CONTRACT.md',
    'docs/PLAYBOOK_BUSINESS_STRATEGY.md',
    'docs/PLAYBOOK_PRODUCT_ROADMAP.md',
    'docs/roadmap/README.md',
    'docs/roadmap/IMPROVEMENTS_BACKLOG.md',
    'docs/roadmap/ROADMAP.json',
    'packages/cli/README.md'
  ];

  // Resembles a Playbook consumer (Fitness/Web/Mazer/ATLAS): adopts Playbook, has none of the product docs layout.
  const createConsumerRepo = (extra: Record<string, string> = {}): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-audit-consumer-'));
    tmpRoots.push(root);
    const files: Record<string, string> = {
      'package.json': JSON.stringify({ name: 'consumer-app' }),
      'README.md': '# Consumer app',
      'AGENTS.md': '# Agents',
      'docs/ARCHITECTURE.md': '# Architecture',
      'docs/PLAYBOOK_NOTES.md': '# Notes',
      'docs/ROADMAP.md': '# Roadmap\nfree-form roadmap without Playbook pillars',
      'docs/PRODUCT_ROADMAP.md': '# Product roadmap of the consumer app',
      ...extra
    };
    Object.entries(files).forEach(([relativePath, content]) => write(root, relativePath, content));
    return root;
  };

  const ruleIds = (root: string): string[] => runDocsAudit(root).findings.map((finding) => finding.ruleId);
  const anchorPaths = (root: string): string[] =>
    runDocsAudit(root)
      .findings.filter((finding) => finding.ruleId === 'docs.required-anchor.missing')
      .map((finding) => finding.path);

  it('reports no product-only findings for a consumer repo', () => {
    const root = createConsumerRepo();
    const result = runDocsAudit(root);

    expect(result.findings).toEqual([]);
    expect(result.status).toBe('pass');
  });

  it('still applies the generic command-truth ladder check to a consumer that keeps its own command-truth.json', () => {
    const root = createConsumerRepo({
      'docs/contracts/command-truth.json': JSON.stringify({ scope: 'consumer', bootstrapLadder: ['ai-context'], remediationLoop: ['verify'] })
    });

    expect(ruleIds(root)).toContain('docs.command-truth.bootstrap-ladder');
    expect(ruleIds(root)).not.toContain('docs.command-truth.missing');
  });

  it('keeps the repo-agnostic anchors required for a consumer repo', () => {
    const root = createConsumerRepo();
    fs.rmSync(path.join(root, 'AGENTS.md'));
    fs.rmSync(path.join(root, 'docs/ARCHITECTURE.md'));

    expect(anchorPaths(root).sort()).toEqual(['AGENTS.md', 'docs/ARCHITECTURE.md']);
  });

  it('applies every product-only check to an explicit product repoType, even with consumer-shaped docs', () => {
    const root = createConsumerRepo({ 'playbook.config.json': JSON.stringify({ version: 1, repoType: 'product' }) });
    const ids = ruleIds(root);

    for (const ruleId of PRODUCT_ONLY_RULE_IDS) {
      expect(ids).toContain(ruleId);
    }
    expect(anchorPaths(root)).toEqual(expect.arrayContaining(PRODUCT_ONLY_ANCHORS));
  });

  it('an explicit consumer repoType scopes down a repo that has the product layout', () => {
    const root = createRepo();
    write(root, 'playbook.config.json', JSON.stringify({ version: 1, repoType: 'consumer' }));
    fs.rmSync(path.join(root, 'docs/index.md'));
    fs.rmSync(path.join(root, 'docs/contracts/command-truth.json'));

    const ids = ruleIds(root);
    expect(ids).not.toContain('docs.command-truth.missing');
    expect(anchorPaths(root)).toEqual([]);
  });

  it('fails closed to product checks when the repo is ambiguous', () => {
    const ambiguous = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-audit-ambiguous-'));
    tmpRoots.push(ambiguous);
    write(ambiguous, 'README.md', '# Unknown repo');

    const ids = ruleIds(ambiguous);
    expect(ids).toContain('docs.command-truth.missing');
    expect(anchorPaths(ambiguous)).toEqual(expect.arrayContaining(PRODUCT_ONLY_ANCHORS));
    expect(anchorPaths(ambiguous)).toEqual(expect.arrayContaining(['AGENTS.md', 'docs/ARCHITECTURE.md']));

    const unknownType = createConsumerRepo({ 'playbook.config.json': JSON.stringify({ version: 1, repoType: 'library' }) });
    expect(ruleIds(unknownType)).toContain('docs.command-truth.missing');

    const brokenConfig = createConsumerRepo({ 'playbook.config.json': '{ nope' });
    expect(ruleIds(brokenConfig)).toContain('docs.command-truth.missing');
  });

  it('product repo layout still reports everything it reported before scoping', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-audit-product-'));
    tmpRoots.push(root);
    write(root, 'package.json', JSON.stringify({ name: 'playbook-monorepo' }));
    write(root, 'docs/ROADMAP.md', '# Roadmap');

    const ids = ruleIds(root);
    for (const ruleId of PRODUCT_ONLY_RULE_IDS.filter((ruleId) => ruleId !== 'docs.single-roadmap.duplicate')) {
      expect(ids).toContain(ruleId);
    }
    expect(anchorPaths(root)).toHaveLength(13);
  });
});
