import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('policy evaluation contract', () => {
  it('defines governed policy evaluation schema fields', () => {
    const schemaPath = path.resolve(__dirname, '..', '..', '..', 'contracts', 'src', 'policy-evaluation.schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as {
      required: string[];
      properties: Record<string, unknown>;
      $defs: {
        PolicyEvaluationEntry: {
          required: string[];
          properties: Record<string, unknown>;
        };
      };
    };

    expect(schema.required).toEqual(expect.arrayContaining(['schemaVersion', 'kind', 'summary', 'evaluations']));
    expect(schema.properties.kind).toEqual({ const: 'policy-evaluation' });
    expect(schema.$defs.PolicyEvaluationEntry.required).toEqual(expect.arrayContaining(['proposal_id', 'decision', 'reason']));
    expect((schema.$defs.PolicyEvaluationEntry.properties.decision as { enum: string[] }).enum).toEqual([
      'safe',
      'requires_review',
      'blocked'
    ]);
  });
});
