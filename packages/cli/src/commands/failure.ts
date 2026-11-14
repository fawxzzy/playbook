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
  failureId?: string;
  help?: boolean;
};

type IngestArtifact = {
  total: number;
  categories: Array<{ category: string; count: number }>;
  failures: Array<{ id: string; category: string; signature: string; message: string }>;
};
type ReportFile = { path: string; report: { failure: { signature: string }; closure: { status: string; preventionTargets: string[] } } };
type ScaffoldArtifact = { total: number; entries: Array<{ failureId: string; category: string; scaffolds: Array<{ kind: string; targetId: string; proposedPath: string }> }> };
type ClosureArtifact = { ok: boolean; checked: number; closed: number; violations: Array<{ path: string; failureId: string; reason: string }> };
type SuggestArtifact = {
  suggestions: Array<{ category: string; failureIds: string[]; rule: string; test: string; docs: string; remediation: string }>;
};

const DEFAULT_ARTIFACT = '.playbook/failure-taxonomy.json' as const;

const engine = engineRuntime as unknown as {
  buildFailureIngestArtifact: (payload: unknown, inputPath: string) => IngestArtifact;
  buildFailureSuggestArtifact: (ingest: IngestArtifact, inputPath: string) => SuggestArtifact;
  validateFailureIngestArtifact: (value: unknown) => IngestArtifact;
  resolveIngestArtifact: (payload: unknown, inputPath: string) => IngestArtifact;
  buildFailureReports: (ingest: IngestArtifact, inputPath: string) => ReportFile[];
  mergeExistingClosure: (next: ReportFile['report'], existing: unknown) => ReportFile['report'];
  buildFailureScaffoldArtifact: (ingest: IngestArtifact, inputPath: string, failureId?: string) => ScaffoldArtifact;
  evaluateFailureClosure: (files: Array<{ path: string; value: unknown }>) => ClosureArtifact;
};

const SCAFFOLD_ARTIFACT = '.playbook/failure-scaffolds.json' as const;
const REPORT_DIR = '.playbook/failures' as const;

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
    usage: 'playbook failure <ingest|classify|suggest|scaffold|check> [--input <path>] [--out <path>] [--failure <id>] [--json]',
    description: 'Classify failures from any source into a stable taxonomy and map them to deterministic prevention suggestions. Read-only outside .playbook/ artifacts.',
    options: [
      'ingest --input <path>     Classify failure records (JSON) and write .playbook/failure-taxonomy.json (or --out)',
      `suggest [--input <path>]  Map a failure taxonomy artifact (default ${DEFAULT_ARTIFACT}) to prevention suggestions`,
      `classify [--input <path>]  Write one closure report per failure to ${REPORT_DIR}/*.report.json (input: taxonomy artifact or raw records)`,
      `scaffold [--input <path>] [--failure <id>]  Propose rule/test/doc scaffolds (propose-only) to ${SCAFFOLD_ARTIFACT}`,
      `check                     CI closure rule: fail while any ${REPORT_DIR} report is codification_required or closed without prevention targets`,
      '--out <path>              Write the JSON artifact to this path',
      '--json                    Print the artifact as JSON',
      '--help                    Show help'
    ],
    artifacts: [DEFAULT_ARTIFACT, SCAFFOLD_ARTIFACT, `${REPORT_DIR}/*.report.json`]
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

    if (subcommand === 'classify') {
      const inputPath = options.input ?? DEFAULT_ARTIFACT;
      const ingest = engine.resolveIngestArtifact(readJson(cwd, inputPath, 'failure input'), inputPath);
      const files = engine.buildFailureReports(ingest, inputPath).map((file) => {
        const absolute = path.resolve(cwd, file.path);
        let existing: unknown = null;
        if (fs.existsSync(absolute)) {
          try {
            existing = JSON.parse(fs.readFileSync(absolute, 'utf8'));
          } catch {
            existing = null;
          }
        }
        return { path: file.path, report: engine.mergeExistingClosure(file.report, existing) };
      });
      for (const file of files) writeArtifact(cwd, file.path, file.report);
      const summary = {
        schemaVersion: '1.0',
        command: 'failure-classify',
        inputPath: inputPath.replaceAll('\\', '/'),
        total: files.length,
        reports: files.map((file) => ({ path: file.path, status: file.report.closure.status }))
      };
      if (options.format === 'json') {
        console.log(JSON.stringify(summary, null, 2));
      } else if (!options.quiet) {
        console.log(`Failure reports: ${files.length} written under ${REPORT_DIR}`);
        for (const entry of summary.reports) console.log(`  ${entry.path} (${entry.status})`);
      }
      return ExitCode.Success;
    }

    if (subcommand === 'scaffold') {
      const inputPath = options.input ?? DEFAULT_ARTIFACT;
      const ingest = engine.resolveIngestArtifact(readJson(cwd, inputPath, 'failure taxonomy artifact (run `playbook failure ingest` first)'), inputPath);
      const artifact = engine.buildFailureScaffoldArtifact(ingest, inputPath, options.failureId);
      const target = options.outFile ?? SCAFFOLD_ARTIFACT;
      writeArtifact(cwd, target, artifact);
      if (options.format === 'json') {
        console.log(JSON.stringify(artifact, null, 2));
      } else if (!options.quiet) {
        console.log(`Failure scaffolds (propose-only): ${artifact.total} failure(s) -> ${target}`);
        for (const entry of artifact.entries) {
          for (const scaffold of entry.scaffolds) console.log(`  ${entry.failureId} ${scaffold.targetId} -> ${scaffold.proposedPath}`);
        }
      }
      return ExitCode.Success;
    }

    if (subcommand === 'check') {
      const dir = path.resolve(cwd, REPORT_DIR);
      const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.json')) : [];
      const files = names.map((name) => {
        const relative = `${REPORT_DIR}/${name}`;
        try {
          return { path: relative, value: JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as unknown };
        } catch {
          return { path: relative, value: null };
        }
      });
      const artifact = engine.evaluateFailureClosure(files);
      if (options.format === 'json') {
        console.log(JSON.stringify(artifact, null, 2));
      } else if (!options.quiet) {
        console.log(artifact.ok ? `Failure closure: ok (${artifact.checked} report(s), ${artifact.closed} closed).` : `Failure closure: ${artifact.violations.length} unresolved of ${artifact.checked} report(s).`);
        for (const violation of artifact.violations) console.log(`  ${violation.path} ${violation.failureId}: ${violation.reason}`);
      }
      return artifact.ok ? ExitCode.Success : ExitCode.Failure;
    }

    return fail(`playbook failure: unknown subcommand "${subcommand}". Use ingest, classify, suggest, scaffold or check.`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};
