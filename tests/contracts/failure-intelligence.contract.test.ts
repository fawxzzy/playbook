import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAILURE_CATEGORIES, FAILURE_SOURCES, buildFailureIngestArtifact } from '../../packages/engine/src/failure/failureTaxonomy.js';

const repoRoot = path.resolve(__dirname, '..', '..');
const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/contracts/FAILURE_TAXONOMY_SCHEMA.json'), 'utf8'));

describe('failure intelligence contract', () => {
  it('schema category and source enums mirror the engine taxonomy', () => {
    expect(schema.$defs.category.enum).toEqual([...FAILURE_CATEGORIES]);
    expect(schema.properties.failures.items.properties.source.enum).toEqual([...FAILURE_SOURCES]);
  });

  it('ingest artifact keys match the schema required keys', () => {
    const artifact = buildFailureIngestArtifact([{ message: 'AssertionError: expected 1 to be 2' }], 'in.json');
    expect(Object.keys(artifact).sort()).toEqual([...schema.required].sort());
    expect(Object.keys(artifact.failures[0]).sort()).toEqual([...schema.properties.failures.items.required].sort());
    expect(artifact.failures[0].signature).toMatch(new RegExp(schema.properties.failures.items.properties.signature.pattern));
    expect(artifact.schemaVersion).toBe(schema.properties.schemaVersion.const);
    expect(artifact.kind).toBe(schema.properties.kind.const);
  });

  it('contract doc lists every category', () => {
    const doc = fs.readFileSync(path.join(repoRoot, 'docs/contracts/FAILURE_INTELLIGENCE_CONTRACT.md'), 'utf8');
    for (const category of FAILURE_CATEGORIES) expect(doc).toContain(category);
  });
});
