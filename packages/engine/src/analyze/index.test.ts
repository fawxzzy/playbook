import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyze as legacyAnalyze } from '@zachariahredfield/playbook-core';
import type { ProjectContext } from '@zachariahredfield/playbook-core';
import { analyze, analyzeRepo } from './index.js';

const fixtureContext = (files: Record<string, string>) => {
  const contents = new Map(Object.entries(files));
  const writes: Array<[string, string]> = [];
  const forbidden = (): never => { throw new Error('Analyze must not access SCM or enumerate files'); };
  const ctx: ProjectContext = {
    repoRoot: '/virtual/project',
    readTextFile: (relative) => contents.get(relative),
    writeTextFile: (relative, text) => { writes.push([relative, text]); contents.set(relative, text); },
    exists: (relative) => contents.has(relative),
    listFiles: forbidden,
    resolveDiffBase: forbidden,
    getChangedFiles: forbidden
  };
  return { ctx, writes, contents };
};

const marker = '<!-- PLAYBOOK:ANALYZE_SUGGESTIONS -->';

describe('engine analyze context compatibility', () => {
  it.each([
    {},
    { 'package.json': '{}' },
    { 'package.json': '{"dependencies":{"next":"15"}}' },
    { 'package.json': '{"devDependencies":{"@supabase/supabase-js":"2"}}' },
    { 'package.json': '{"dependencies":{"tailwindcss":"4"}}' },
    { 'package.json': '{"dependencies":{"next":"15","tailwindcss":"4"},"devDependencies":{"@supabase/supabase-js":"2"}}', 'docs/ARCHITECTURE.md': `# Architecture\n${marker}\n- Framework: stale\n\n## Keep\n` },
    { 'package.json': '{"dependencies":{"next":"15"}}', 'docs/ARCHITECTURE.md': `# Architecture\r\n${marker}\r\n- Framework: stale\r\n` }
  ] as Record<string, string>[])('preserves legacy report and exact writes for %j', (files) => {
    const legacy = fixtureContext(files);
    const engine = fixtureContext(files);
    expect(analyze(engine.ctx)).toEqual(legacyAnalyze(legacy.ctx));
    expect(engine.writes).toEqual(legacy.writes);
    expect(engine.contents).toEqual(legacy.contents);
  });

  it('updates only the existing architecture block and does not rewrite unchanged content', () => {
    const { ctx, writes, contents } = fixtureContext({
      'package.json': '{"dependencies":{"next":"15"}}',
      'docs/ARCHITECTURE.md': `# Architecture\n${marker}\n- Framework: stale\n\n## Keep\n`
    });
    const first = analyze(ctx);
    expect(first.architectureSuggestions).toEqual(['- Framework: Next.js']);
    expect(contents.get('docs/ARCHITECTURE.md')).toBe(`# Architecture\n${marker}\n- Framework: Next.js\n\n## Keep\n`);
    expect(writes).toHaveLength(1);
    expect(analyze(ctx)).toEqual(first);
    expect(writes).toHaveLength(1);
  });

  it('does not create a missing architecture document or write a no-signal block', () => {
    for (const files of [
      { 'package.json': '{"dependencies":{"next":"15"}}' },
      { 'package.json': '{}', 'docs/ARCHITECTURE.md': `${marker}\n- Framework: keep\n` }
    ] as Record<string, string>[]) {
      const { ctx, writes } = fixtureContext(files);
      analyze(ctx);
      expect(writes).toEqual([]);
    }
  });

  it('keeps the no-signal warning and the dependency-only CLI contract', () => {
    const { ctx } = fixtureContext({ 'package.json': '{}', 'next.config.js': 'export default {};' });
    const report = analyze(ctx);
    expect(report.ok).toBe(false);
    expect(report.detected).toEqual([]);
    expect(report.recommendations.map((item) => item.id)).toEqual(['analyze-no-signals', 'analyze-run-init']);
    expect(report.detectorsRun).toEqual(['nextjs', 'supabase', 'tailwind']);
  });

  it('preserves malformed package failure before any write', () => {
    const { ctx, writes } = fixtureContext({ 'package.json': '{ invalid', 'docs/ARCHITECTURE.md': marker });
    expect(() => analyze(ctx)).toThrow(SyntaxError);
    expect(writes).toEqual([]);
  });

  it('preserves plugin detector reports and resets them between repositories', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-analyze-plugin-'));
    fs.writeFileSync(path.join(repo, 'package.json'), '{}');
    fs.writeFileSync(path.join(repo, 'playbook.config.json'), JSON.stringify({ plugins: ['./detector.cjs'] }));
    fs.writeFileSync(path.join(repo, 'detector.cjs'), `module.exports = {
      name: 'fixture', detectors: [{ id: 'fixture', label: 'Fixture',
        detect: () => ({ confidence: 1, evidence: ['fixture:evidence'] }) }]
    };`);
    const report = analyzeRepo(repo);
    expect(report).toEqual({
      repoPath: repo,
      ok: true,
      detectorsRun: ['nextjs', 'supabase', 'tailwind', 'fixture'],
      detected: [{ id: 'fixture', label: 'Fixture', evidence: ['fixture:evidence'] }],
      summary: 'Detected stack:\n- Fixture',
      signals: '1 stack signal(s): Fixture',
      recommendations: [
        { id: 'analyze-run-verify', title: 'Run governance verification', severity: 'RECOMMEND',
          message: 'Use verify after analyze to enforce policy checks.',
          why: 'Analyze surfaces signals while verify enforces deterministic governance rules.',
          fix: 'Run `playbook verify` before opening a pull request.' },
        { id: 'analyze-detected-fixture', title: 'Fixture detected', severity: 'INFO',
          message: 'Fixture signal detected from repository evidence.',
          why: 'Fixture detection helps tailor architecture-aware guidance.',
          fix: 'Review generated architecture suggestions and keep docs aligned with implementation.',
          files: ['package.json'] }
      ]
    });
    const emptyRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-analyze-empty-'));
    expect(analyzeRepo(emptyRepo).detectorsRun).toEqual(['nextjs', 'supabase', 'tailwind']);
    expect(fs.existsSync(path.join(repo, 'docs', 'ARCHITECTURE.md'))).toBe(false);
  });
});
