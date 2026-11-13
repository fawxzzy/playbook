import fs from 'node:fs';
import path from 'node:path';
import { loadDetectorRegistry } from '../plugins/unifiedPluginRegistry.js';
import type { RepoContext, StackDetector } from '../plugins/pluginTypes.js';
import { nextjsDetector } from './detectors/nextjs.js';
import { supabaseDetector } from './detectors/supabase.js';
import { tailwindDetector } from './detectors/tailwind.js';

import { createAnalyzeReport, detectAnalyzeDependencies, renderAnalyzeArchitecture } from '@zachariahredfield/playbook-core';
import type { AnalyzeResult as ContextAnalyzeResult, AnalyzePackageJson, ProjectContext, Finding, Severity } from '@zachariahredfield/playbook-core';

export type AnalyzeSeverity = Severity;
export type AnalyzeRecommendation = Finding;
export type AnalyzeResult = Omit<ContextAnalyzeResult, 'architectureSuggestions'>;
type PackageJson = AnalyzePackageJson;

// The CLI keeps its dependency-only core detector contract; plugin detectors
// (docs/contracts/PLUGIN_CONTRACT_V1.md) are added on top through the unified
// registry, so repositories without plugins produce the same report as before.
export const analyze = (ctx: ProjectContext): ContextAnalyzeResult => {
  const pkgRaw = ctx.readTextFile('package.json');
  const pkg = (pkgRaw ? JSON.parse(pkgRaw) : {}) as PackageJson;
  const repoContext: RepoContext = {
    repoRoot: ctx.repoRoot,
    packageJsonPath: path.join(ctx.repoRoot, 'package.json'),
    dependencies: pkg.dependencies ?? {},
    devDependencies: pkg.devDependencies ?? {}
  };
  const pluginDetectors = loadDetectorRegistry(ctx.repoRoot, []);
  const pluginDetected = pluginDetectors.flatMap((detector) => {
    const detection = detector.detect(repoContext);
    return detection ? [{ id: detector.id, label: detector.label, evidence: detection.evidence }] : [];
  });
  const result = createAnalyzeReport(
    ctx.repoRoot,
    [...detectAnalyzeDependencies(pkg), ...pluginDetected],
    ['nextjs', 'supabase', 'tailwind', ...pluginDetectors.map((detector) => detector.id)]
  );
  const architecture = ctx.readTextFile('docs/ARCHITECTURE.md');
  if (architecture !== undefined) {
    const updated = renderAnalyzeArchitecture(architecture, result.architectureSuggestions);
    if (updated !== architecture) ctx.writeTextFile('docs/ARCHITECTURE.md', updated);
  }
  return result;
};

const readPackageJson = (repoRoot: string): PackageJson => {
  const pkgPath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return {};
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as PackageJson;
};

const coreDetectors: StackDetector[] = [
  nextjsDetector,
  supabaseDetector,
  tailwindDetector
];

export const analyzeRepo = (repoRoot: string): AnalyzeResult => {
  const pkg = readPackageJson(repoRoot);
  const repoContext: RepoContext = {
    repoRoot,
    packageJsonPath: path.join(repoRoot, 'package.json'),
    dependencies: pkg.dependencies ?? {},
    devDependencies: pkg.devDependencies ?? {}
  };

  const detectors = loadDetectorRegistry(repoRoot, coreDetectors);

  const detectorResults = detectors.flatMap((detector) => {
    const result = detector.detect(repoContext);
    if (!result) return [];
    return [{ id: detector.id, label: detector.label, ...result }];
  });

  const result = createAnalyzeReport(
    repoRoot,
    detectorResults.map(({ id, label, evidence }) => ({ id, label, evidence })),
    detectors.map((detector) => detector.id)
  );
  const architecturePath = path.join(repoRoot, 'docs', 'ARCHITECTURE.md');
  if (fs.existsSync(architecturePath)) {
    const architecture = fs.readFileSync(architecturePath, 'utf8');
    const updated = renderAnalyzeArchitecture(architecture, result.architectureSuggestions);
    if (updated !== architecture) fs.writeFileSync(architecturePath, updated);
  }

  // Keep the established analyzeRepo report shape, without adding a CLI field.
  return {
    repoPath: result.repoPath,
    ok: result.ok,
    detectorsRun: result.detectorsRun,
    detected: result.detected,
    summary: result.summary,
    signals: result.signals,
    recommendations: result.recommendations
  };
};
