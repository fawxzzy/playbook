import fs from 'node:fs';
import path from 'node:path';
import * as engineRuntime from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
import { emitJsonOutput } from '../lib/jsonArtifact.js';
import { printCommandHelp } from '../lib/commandSurface.js';

type FailureOptions = {
  format: 'text' | 'json';
  quiet: boolean;
  input?: string;
  outFile?: string;
  help?: boolean;
};

type IngestArtifact = {
  total: number;
  categories: Array<{ category: string; count: number }>;
  failures: Array<{ id: string; category: string; signature: string; message: string }>;
};
type SuggestArtifact = {
  suggestions: Array<{ category: string; failureIds: string[]; rule: string; test: string; docs: string; remediation: string }>;
};

const DEFAULT_ARTIFACT = '.playbook/failure-taxonomy.json' as const;

const engine = engineRuntime as unknown as {
  buildFailureIngestArtifact: (payload: unknown, inputPath: string) => IngestArtifact;
  buildFailureSuggestArtifact: (ingest: IngestArtifact, inputPath: string) => SuggestArtifact;
  validateFailureIngestArtifact: (value: unknown) => IngestArtifact;
};

const readJson = (cwd: string, relativePath: string, label: string): unknown => {
  const absolute = path.resolve(cwd, relativePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`playbook failure: ${label} not found at ${relativePath}.`);
  }
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    throw new Error(`playbook failure: ${label} at ${relativePath} is not valid JSON. ${error instanceof Error ? error.message : String(error)}`);
  }
};

const writeArtifact = (cwd: string, relativePath: string, payload: unknown): void => {
  const absolute = path.resolve(cwd, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const printHelp = (): void => {
  printCommandHelp({
    usage: 'playbook failure <ingest|suggest> [--input <path>] [--out <path>] [--json]',
    description: 'Classify failures from any source into a stable taxonomy and map them to deterministic prevention suggestions. Read-only outside .playbook/ artifacts.',
    options: [
      'ingest --input <path>     Classify failure records (JSON) and write .playbook/failure-taxonomy.json (or --out)',
      `suggest [--input <path>]  Map a failure taxonomy artifact (default ${DEFAULT_ARTIFACT}) to prevention suggestions`,
      '--out <path>              Write the JSON artifact to this path',
      '--json                    Print the artifact as JSON',
      '--help                    Show help'
    ],
    artifacts: [DEFAULT_ARTIFACT]
  });
};

export const runFailure = async (cwd: string, args: string[], options: FailureOptions): Promise<number> => {
  const subcommand = args.find((arg) => !arg.startsWith('-'));
  if (options.help || !subcommand) {
    printHelp();
    return options.help ? ExitCode.Success : ExitCode.Failure;
  }

  const fail = (message: string): number => {
    if (options.format === 'json') {
      console.log(JSON.stringify({ schemaVersion: '1.0', command: `failure-${subcommand}`, error: message }, null, 2));
    } else {
      console.error(message);
    }
    return ExitCode.Failure;
  };

  try {
    if (subcommand === 'ingest') {
      if (!options.input) {
        return fail('playbook failure ingest: --input <path> is required.');
      }
      const artifact = engine.buildFailureIngestArtifact(readJson(cwd, options.input, 'input'), options.input);
      const target = options.outFile ?? DEFAULT_ARTIFACT;
      writeArtifact(cwd, target, artifact);
      if (options.format === 'json') {
        console.log(JSON.stringify(artifact, null, 2));
      } else if (!options.quiet) {
        console.log(`Failure taxonomy: ${artifact.total} failure(s) classified -> ${target}`);
        for (const entry of artifact.categories) console.log(`  ${entry.category}: ${entry.count}`);
      }
      return ExitCode.Success;
    }

    if (subcommand === 'suggest') {
      const inputPath = options.input ?? DEFAULT_ARTIFACT;
      const ingest = engine.validateFailureIngestArtifact(readJson(cwd, inputPath, 'failure taxonomy artifact (run `playbook failure ingest` first)'));
      const artifact = engine.buildFailureSuggestArtifact(ingest, inputPath);
      if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'failure-suggest', payload: artifact, outFile: options.outFile });
      } else {
        if (options.outFile) writeArtifact(cwd, options.outFile, artifact);
        if (!options.quiet) {
          for (const suggestion of artifact.suggestions) {
            console.log(`${suggestion.category} (${suggestion.failureIds.join(', ')})`);
            console.log(`  rule: ${suggestion.rule}`);
            console.log(`  test: ${suggestion.test}`);
            console.log(`  docs: ${suggestion.docs}`);
            console.log(`  remediation: ${suggestion.remediation}`);
          }
        }
      }
      return ExitCode.Success;
    }

    return fail(`playbook failure: unknown subcommand "${subcommand}". Use ingest or suggest.`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};
