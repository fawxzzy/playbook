import type { AnalyzeResult } from './index.js';

export type AnalyzePackageJson = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
export type AnalyzeDetectedItem = AnalyzeResult['detected'][number];
type Finding = AnalyzeResult['recommendations'][number];

// Shared deterministic policy. Command IO and plugin registration belong to engine.
export const detectAnalyzeDependencies = (pkg: AnalyzePackageJson): AnalyzeDetectedItem[] => {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  return [
    deps.next ? { id: 'nextjs', label: 'Next.js', evidence: ['package.json: next'] } : undefined,
    deps['@supabase/supabase-js'] ? { id: 'supabase', label: 'Supabase', evidence: ['package.json: @supabase/supabase-js'] } : undefined,
    deps.tailwindcss ? { id: 'tailwind', label: 'Tailwind CSS', evidence: ['package.json: tailwindcss'] } : undefined
  ].filter((v): v is { id: string; label: string; evidence: string[] } => Boolean(v));

};

const architectureCategoryByDetector: Record<string, string> = {
  nextjs: 'Framework', supabase: 'Database', tailwind: 'Styling'
};

export const createAnalyzeReport = (repoRoot: string, detected: AnalyzeDetectedItem[], detectorsRun: string[]): AnalyzeResult => {
  const recommendations: Finding[] = detected.length
    ? [
        {
          id: 'analyze-run-verify',
          title: 'Run governance verification',
          severity: 'RECOMMEND',
          message: 'Use verify after analyze to enforce policy checks.',
          why: 'Analyze surfaces signals while verify enforces deterministic governance rules.',
          fix: 'Run `playbook verify` before opening a pull request.'
        },
        ...detected.map((item) => ({
          id: `analyze-detected-${item.id}`,
          title: `${item.label} detected`,
          severity: 'INFO' as const,
          message: `${item.label} signal detected from repository evidence.`,
          why: `${item.label} detection helps tailor architecture-aware guidance.`,
          fix: 'Review generated architecture suggestions and keep docs aligned with implementation.',
          files: ['package.json']
        }))
      ]
    : [
        {
          id: 'analyze-no-signals',
          title: 'No stack signals detected',
          severity: 'WARN',
          message: 'No known stack detectors matched this repository.',
          why: 'Without stack signals, generated guidance may miss architecture-specific checks.',
          fix: 'Add key framework/database dependencies to package.json, then rerun playbook analyze.',
          files: ['package.json']
        },
        {
          id: 'analyze-run-init',
          title: 'Initialize governance baseline',
          severity: 'RECOMMEND',
          message: 'Ensure governance docs are initialized for this repository.',
          why: 'A documented baseline keeps architecture and delivery expectations explicit.',
          fix: 'Run `playbook init` to scaffold governance docs if they do not exist.'
        }
      ];

  const architectureSuggestions = detected.flatMap((item) => {
    const category = architectureCategoryByDetector[item.id];
    return category ? [`- ${category}: ${item.label}`] : [];
  });

  return {
    repoPath: repoRoot,
    ok: !recommendations.some((r) => r.severity === 'WARN'),
    detectorsRun,
    detected,
    summary: detected.length ? `Detected stack:\n${detected.map((d) => `- ${d.label}`).join('\n')}` : 'Detected stack: none',
    signals: detected.length ? `${detected.length} stack signal(s): ${detected.map((d) => d.label).join(', ')}` : 'No known stack signals detected',
    recommendations,
    architectureSuggestions
  };
};


export const renderAnalyzeArchitecture = (content: string, suggestions: string[]): string => {
  const marker = '<!-- PLAYBOOK:ANALYZE_SUGGESTIONS -->';
  if (!content.includes(marker) || !suggestions.length) return content;
  const block = `${marker}\n${suggestions.join('\n')}\n`;
  const markerLineRegex = new RegExp(`${marker}\\n(?:- (?:Framework|Database|Styling): .*\\n?)*`, 'g');
  return content.replace(markerLineRegex, block);
};
