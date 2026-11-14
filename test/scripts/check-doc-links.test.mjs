import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTrackedIndex,
  extractLinks,
  findDeadLinks,
  formatReport,
  parseAllowlist,
  resolveLink
} from '../../scripts/check-doc-links.mjs';

const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'check-doc-links.mjs');

test('extractLinks finds inline links and images with line numbers', () => {
  const links = extractLinks('# Title\n\nSee [guide](docs/guide.md) and ![diagram](img/a.png).\nNext [two](b.md "Title").\n');

  assert.deepEqual(links, [
    { line: 3, destination: 'docs/guide.md' },
    { line: 3, destination: 'img/a.png' },
    { line: 4, destination: 'b.md' }
  ]);
});

test('extractLinks ignores fenced code (backtick and tilde) and inline code', () => {
  const markdown = [
    '```md',
    '[in fence](missing-a.md)',
    '```',
    '~~~',
    '[in tilde fence](missing-b.md)',
    '~~~',
    'Inline `[in code](missing-c.md)` and ``[double](missing-d.md)`` are skipped.',
    '[real](real.md)'
  ].join('\n');

  assert.deepEqual(extractLinks(markdown), [{ line: 8, destination: 'real.md' }]);
});

test('extractLinks keeps a longer fence open until a matching close', () => {
  const markdown = ['````', '```', '[still fenced](x.md)', '```', '````', '[after](y.md)'].join('\n');

  assert.deepEqual(extractLinks(markdown), [{ line: 6, destination: 'y.md' }]);
});

test('extractLinks handles angle-bracket destinations, balanced parentheses and nested image links', () => {
  const links = extractLinks('[a](<my file.md>) [b](dir/f(1).md) [![badge](img/b.svg)](target.md)');

  assert.deepEqual(
    links.map((link) => link.destination),
    ['my file.md', 'dir/f(1).md', 'img/b.svg', 'target.md']
  );
});

test('extractLinks tolerates CRLF input and stray "](" without an opening bracket', () => {
  assert.deepEqual(extractLinks('x](ghost.md)\r\n[ok](ok.md)\r\n'), [{ line: 2, destination: 'ok.md' }]);
});

test('resolveLink skips external, anchor-only and empty destinations', () => {
  for (const destination of ['https://example.com/x.md', 'http://a.b', 'mailto:a@b.c', '#section', '', '//cdn.example.com/x', '?q=1']) {
    assert.deepEqual(resolveLink('docs/a.md', destination), { skip: true }, destination);
  }
});

test('resolveLink resolves relative, parent, root-relative and decorated destinations', () => {
  assert.deepEqual(resolveLink('docs/a.md', 'b.md'), { skip: false, target: 'docs/b.md' });
  assert.deepEqual(resolveLink('docs/sub/a.md', '../b.md#frag'), { skip: false, target: 'docs/b.md' });
  assert.deepEqual(resolveLink('docs/a.md', '/README.md'), { skip: false, target: 'README.md' });
  assert.deepEqual(resolveLink('docs/a.md', './dir/'), { skip: false, target: 'docs/dir' });
  assert.deepEqual(resolveLink('docs/a.md', 'my%20file.md?raw=1'), { skip: false, target: 'docs/my file.md' });
  assert.deepEqual(resolveLink('docs/a.md', '../../outside.md'), { skip: false, target: null });
});

test('buildTrackedIndex derives every parent directory from tracked files', () => {
  const index = buildTrackedIndex(['README.md', 'docs/a/b.md']);

  assert.ok(index.files.has('docs/a/b.md'));
  assert.ok(index.directories.has('docs'));
  assert.ok(index.directories.has('docs/a'));
  assert.ok(index.directories.has(''));
  assert.ok(!index.directories.has('docs/missing'));
});

const files = {
  'README.md': '[ok](docs/a.md) [dir](docs/) [dead](docs/gone.md) [case](docs/A.md) [web](https://x.y) [anchor](#top)\n',
  'docs/a.md': '[up](../README.md#top) [escape](../../x.md)\n'
};

const run = (allowlist = []) =>
  findDeadLinks({
    markdownFiles: Object.keys(files),
    trackedFiles: ['README.md', 'docs/a.md'],
    readFile: (file) => files[file],
    allowlist
  });

test('findDeadLinks reports missing files, case mismatches and root escapes; accepts files and directories', () => {
  const result = run();

  assert.deepEqual(result.dead, [
    { source: 'README.md', line: 1, destination: 'docs/gone.md' },
    { source: 'README.md', line: 1, destination: 'docs/A.md' },
    { source: 'docs/a.md', line: 1, destination: '../../x.md' }
  ]);
  assert.equal(result.checked, 6);
  assert.deepEqual(result.allowed, []);
  assert.deepEqual(result.staleAllowlist, []);
});

test('allowlisted links pass and unused allowlist entries are reported as stale', () => {
  const { entries, errors } = parseAllowlist(
    [
      '# why: owned by another change',
      'README.md -> docs/gone.md   # trailing comment',
      '',
      'README.md -> docs/A.md',
      'docs/a.md -> ../../x.md',
      'README.md -> docs/never-linked.md'
    ].join('\n')
  );
  assert.deepEqual(errors, []);

  const result = run(entries);
  assert.deepEqual(result.dead, []);
  assert.equal(result.allowed.length, 3);
  assert.deepEqual(result.staleAllowlist, ['README.md -> docs/never-linked.md']);
  assert.match(formatReport(result), /Warning: 1 allowlist entry no longer matches/);
  assert.match(formatReport(result, { strictAllowlist: true }), /Error: 1 allowlist entry no longer matches/);
});

test('parseAllowlist rejects malformed lines', () => {
  const { entries, errors } = parseAllowlist('README.md docs/gone.md\nREADME.md -> \n');

  assert.deepEqual(entries, []);
  assert.equal(errors.length, 2);
});

test('formatReport lists dead links with file:line and the fix hint', () => {
  const report = formatReport(run());

  assert.match(report, /Dead relative markdown links \(3\):/);
  assert.match(report, /README\.md:1 -> docs\/gone\.md/);
  assert.match(report, /retarget the link to the real file/);
  assert.match(report, /Checked 6 relative markdown links; 3 dead, 0 allowlisted\./);
});

const git = (cwd, args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
};

test('CLI exits 1 on a dead link, 0 once it is fixed or allowlisted, and only reads tracked files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-doc-links-'));
  try {
    git(root, ['init', '-q']);
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'README.md'), '[ok](docs/a.md)\n[dead](docs/gone.md)\n');
    fs.writeFileSync(path.join(root, 'docs', 'a.md'), 'text\n');
    fs.writeFileSync(path.join(root, 'docs', 'gone.md'), 'exists on disk but is untracked\n');
    git(root, ['add', 'README.md', 'docs/a.md']);

    const failing = spawnSync(process.execPath, [scriptPath, '--root', root], { encoding: 'utf8' });
    assert.equal(failing.status, 1);
    assert.match(failing.stderr, /README\.md:2 -> docs\/gone\.md/);

    fs.writeFileSync(path.join(root, 'allow.txt'), '# test\nREADME.md -> docs/gone.md\n');
    const allowed = spawnSync(process.execPath, [scriptPath, '--root', root, '--allowlist', 'allow.txt'], { encoding: 'utf8' });
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.match(allowed.stdout, /1 allowlisted/);

    git(root, ['add', 'docs/gone.md']);
    const fixed = spawnSync(process.execPath, [scriptPath, '--root', root, '--json'], { encoding: 'utf8' });
    assert.equal(fixed.status, 0, fixed.stderr);
    assert.equal(JSON.parse(fixed.stdout).ok, true);

    fs.writeFileSync(path.join(root, 'allow.txt'), 'README.md -> docs/gone.md\n');
    const strict = spawnSync(process.execPath, [scriptPath, '--root', root, '--allowlist', 'allow.txt', '--strict-allowlist'], {
      encoding: 'utf8'
    });
    assert.equal(strict.status, 1);
    assert.match(strict.stderr, /Error: 1 allowlist entry no longer matches/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the Playbook repo itself has no dead relative markdown links', () => {
  const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
