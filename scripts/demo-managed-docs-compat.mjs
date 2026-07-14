import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeCommandTruthContract } from './managed-docs-lib.mjs';

const REVISION_LAYER_SECTIONS = ['fact', 'interpretation', 'narrative'];
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLAYBOOK_REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const DEFAULT_REVISION_LAYER_CONTENT = {
  fact: [
    '- Structured roadmap contract data lives in `docs/roadmap/ROADMAP.json`.',
    '- Delivery-plan detail lives in `docs/architecture/V1_ARCHITECTURE_AUDIT_AND_DELIVERY_PLAN.md`.',
    '- Command contract detail lives in `docs/contracts/COMMAND_CONTRACTS_V1.md`.'
  ],
  interpretation: [
    '- This governed roadmap document summarizes where the canonical roadmap and execution-detail artifacts live.',
    '- Demo refresh flows must keep this surface aligned with the current Playbook documentation contract.'
  ],
  narrative: [
    '- Keep the demo roadmap as a revision-layer wrapper over the structured roadmap and delivery-plan sources.',
    '- Preserve these sections so `playbook doctor` can validate the governed documentation surface deterministically.'
  ]
};

const hasMarkdownSection = (content, section) => {
  const pattern = new RegExp(`^##\\s+${section}\\b`, 'im');
  return pattern.test(content);
};

export const ensureRoadmapRevisionLayers = async (rootDir, relativePath = 'docs/PLAYBOOK_PRODUCT_ROADMAP.md') => {
  const absolutePath = path.join(rootDir, relativePath);
  let current;

  try {
    current = await fs.readFile(absolutePath, 'utf8');
  } catch {
    return [];
  }

  const missingSections = REVISION_LAYER_SECTIONS.filter((section) => !hasMarkdownSection(current, section));
  if (missingSections.length === 0) {
    return [];
  }

  let next = current.trimEnd();
  for (const section of missingSections) {
    const lines = DEFAULT_REVISION_LAYER_CONTENT[section];
    next += `\n\n## ${section[0].toUpperCase()}${section.slice(1)}\n${lines.join('\n')}\n`;
  }

  await fs.writeFile(absolutePath, `${next.trimEnd()}\n`, 'utf8');
  return missingSections;
};

export const applyPlaybookDemoManagedDocsCompatibility = async (rootDir) => {
  const touchedPaths = [];

  await writeCommandTruthContract(rootDir);
  touchedPaths.push('docs/contracts/command-truth.json');

  const commandsReadmePath = 'docs/commands/README.md';
  const sourceCommandsReadme = await fs.readFile(path.join(PLAYBOOK_REPO_ROOT, commandsReadmePath), 'utf8');
  const targetCommandsReadmePath = path.join(rootDir, commandsReadmePath);
  await fs.mkdir(path.dirname(targetCommandsReadmePath), { recursive: true });
  await fs.writeFile(targetCommandsReadmePath, sourceCommandsReadme, 'utf8');
  touchedPaths.push(commandsReadmePath);

  const updatedRoadmapSections = await ensureRoadmapRevisionLayers(rootDir);
  if (updatedRoadmapSections.length > 0) {
    touchedPaths.push('docs/PLAYBOOK_PRODUCT_ROADMAP.md');
  }

  return touchedPaths;
};
