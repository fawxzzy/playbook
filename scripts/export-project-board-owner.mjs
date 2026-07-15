#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROADMAP_PATH = 'docs/roadmap/ROADMAP.json';
const ATLAS_ROADMAP_PATH = 'repos/playbook/docs/roadmap/ROADMAP.json';
const DEFAULT_OUTPUT_PATH = 'exports/playbook.project-board.owner-export.v1.json';
const BOARD_ID = 'discordos:project-feedback:playbook';

const COMPLETED_STATUSES = new Set([
  'implemented',
  'implemented-hardening',
  'complete',
  'completed',
  'done',
  'shipped'
]);

const STATUS_MAPPING = new Map([
  ['in-progress', { recordStatus: 'active', lifecycle: 'in-progress' }],
  ['planned', { recordStatus: 'active', lifecycle: 'planning' }],
  ['planned-later', { recordStatus: 'candidate', lifecycle: 'intake' }],
  ['dependency-blocked', { recordStatus: 'active', lifecycle: 'blocked' }],
  ['directional', { recordStatus: 'candidate', lifecycle: 'intake' }],
  ['architecture-defined', { recordStatus: 'active', lifecycle: 'planning' }]
]);

const uniqueSorted = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right));

const normalizeTimestamp = (value) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('roadmap.updatedAt must be a non-empty date or date-time string');
  }

  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`roadmap.updatedAt is not a valid date or date-time: ${JSON.stringify(value)}`);
  }
  return parsed.toISOString();
};

const atlasPath = (value) => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  if (value.startsWith('schema://')) return value;
  return `repos/playbook/${value.replaceAll('\\', '/')}`;
};

const requireStringArray = (feature, field) => {
  if (!Array.isArray(feature[field]) || feature[field].some((value) => typeof value !== 'string' || value.trim() === '')) {
    throw new Error(`${feature.feature_id ?? '<unknown>'}.${field} must be an array of non-empty strings`);
  }
  return feature[field];
};

const buildBlockers = (feature) => {
  if (feature.status !== 'dependency-blocked') return [];
  if (feature.dependencies.length === 0) {
    return ['Roadmap status is dependency-blocked without a recorded dependency.'];
  }
  return feature.dependencies.map((dependency) => `Blocked by roadmap dependency ${dependency}.`);
};

const mapFeature = (feature, generatedAt) => {
  const mapping = STATUS_MAPPING.get(feature.status);
  if (!mapping) {
    throw new Error(`unsupported non-complete roadmap status for ${feature.feature_id}: ${JSON.stringify(feature.status)}`);
  }

  for (const field of ['commands', 'contracts', 'tests', 'docs', 'dependencies', 'package_ownership', 'verification_commands']) {
    requireStringArray(feature, field);
  }
  if (typeof feature.feature_id !== 'string' || feature.feature_id.trim() === '') {
    throw new Error('roadmap feature_id must be a non-empty string');
  }
  if (typeof feature.title !== 'string' || feature.title.trim() === '') {
    throw new Error(`${feature.feature_id}.title must be a non-empty string`);
  }
  if (typeof feature.goal !== 'string' || feature.goal.trim() === '') {
    throw new Error(`${feature.feature_id}.goal must be a non-empty string`);
  }
  if (feature.verification_commands.length === 0) {
    throw new Error(`${feature.feature_id}.verification_commands must not be empty for board admission`);
  }

  const sourceRef = `${ATLAS_ROADMAP_PATH}#${feature.feature_id}`;
  const normalizedId = feature.feature_id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const evidence = uniqueSorted(
    [...feature.contracts, ...feature.tests, ...feature.docs]
      .map(atlasPath)
      .filter(Boolean)
  );

  return {
    idempotency_key: `pbk_playbook_${normalizedId}_v1`,
    record_kind: 'project-work',
    record_status: mapping.recordStatus,
    record: {
      contract_version: 'atlas.card-record.v2',
      card_id: feature.feature_id,
      project_id: 'playbook',
      board_id: BOARD_ID,
      title: feature.title,
      description: feature.goal,
      card_type: 'feature',
      lifecycle: mapping.lifecycle,
      priority: null,
      owner: 'playbook',
      dependencies: uniqueSorted(feature.dependencies),
      board_version: 1,
      updated_at: generatedAt,
      source_ref: sourceRef,
      extensions: {
        roadmap_status: feature.status,
        roadmap_version: feature.version
      }
    },
    source: {
      source_id: 'playbook-roadmap',
      source_ref: sourceRef,
      source_status: 'current',
      source_updated_at: generatedAt
    },
    content: {
      summary: feature.goal,
      objective: feature.goal,
      acceptance_criteria: feature.verification_commands.map((command) => `Run: ${command}`),
      discoveries: [],
      next_actions: [...feature.verification_commands],
      blockers: buildBlockers(feature),
      evidence
    },
    relationships: {
      parent_card_id: null,
      duplicate_of: null,
      superseded_by: null
    },
    extensions: {
      commands: uniqueSorted(feature.commands),
      package_ownership: uniqueSorted(feature.package_ownership)
    }
  };
};

export function buildProjectBoardOwnerExport(roadmap, roadmapBytes) {
  if (!roadmap || typeof roadmap !== 'object' || Array.isArray(roadmap)) {
    throw new Error('roadmap must be an object');
  }
  if (!Array.isArray(roadmap.features) || roadmap.features.length === 0) {
    throw new Error('roadmap.features must be a non-empty array');
  }

  const generatedAt = normalizeTimestamp(roadmap.updatedAt);
  // Git may materialize JSON with CRLF on Windows and LF in CI. Hash the
  // canonical UTF-8/LF representation so one source revision is portable.
  const canonicalRoadmapBytes = Buffer.from(roadmapBytes)
    .toString('utf8')
    .replace(/\r\n?/g, '\n');
  const digest = crypto.createHash('sha256').update(canonicalRoadmapBytes, 'utf8').digest('hex');
  const sourceRevision = `sha256:${digest}`;
  const cards = roadmap.features
    .filter((feature) => !COMPLETED_STATUSES.has(feature.status))
    .map((feature) => mapFeature(feature, generatedAt))
    .sort((left, right) => left.record.card_id.localeCompare(right.record.card_id));

  return {
    contract_version: 'atlas.project-board.owner-export.v1',
    export_id: `pbe_playbook_roadmap_${digest.slice(0, 12)}`,
    project_id: 'playbook',
    board_id: BOARD_ID,
    owner: 'playbook',
    adapter_id: 'playbook-roadmap-v1',
    source_revision: sourceRevision,
    generated_at: generatedAt,
    sources: [
      {
        source_id: 'playbook-roadmap',
        kind: 'json',
        repository: 'playbook',
        path: ATLAS_ROADMAP_PATH,
        revision: sourceRevision,
        observed_at: generatedAt
      }
    ],
    cards,
    extensions: {
      source_digest: sourceRevision,
      source_feature_count: roadmap.features.length,
      exported_card_count: cards.length,
      excluded_completed_statuses: [...COMPLETED_STATUSES].sort()
    }
  };
}

export function renderProjectBoardOwnerExport(repoRoot) {
  const roadmapPath = path.join(repoRoot, ROADMAP_PATH);
  const roadmapBytes = fs.readFileSync(roadmapPath);
  const roadmap = JSON.parse(roadmapBytes.toString('utf8'));
  return `${JSON.stringify(buildProjectBoardOwnerExport(roadmap, roadmapBytes), null, 2)}\n`;
}

function parseArguments(argv) {
  const options = { check: false, stdout: false, output: DEFAULT_OUTPUT_PATH };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--check') options.check = true;
    else if (argument === '--stdout') options.stdout = true;
    else if (argument === '--out') {
      const output = argv[index + 1];
      if (!output) throw new Error('--out requires a path');
      options.output = output;
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

export function runProjectBoardOwnerExport(argv, repoRoot = process.cwd()) {
  const options = parseArguments(argv);
  const rendered = renderProjectBoardOwnerExport(repoRoot);
  const outputPath = path.resolve(repoRoot, options.output);

  if (options.stdout) process.stdout.write(rendered);
  if (options.check) {
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== rendered) {
      throw new Error(`${path.relative(repoRoot, outputPath)} is stale; run pnpm board:export`);
    }
    process.stdout.write(`project-board-owner-export: ok (${JSON.parse(rendered).cards.length} cards)\n`);
    return;
  }
  if (!options.stdout) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, rendered, 'utf8');
    process.stdout.write(`project-board-owner-export: wrote ${path.relative(repoRoot, outputPath)}\n`);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    runProjectBoardOwnerExport(process.argv.slice(2));
  } catch (error) {
    console.error(`project-board-owner-export: ${error.message}`);
    process.exitCode = 1;
  }
}
