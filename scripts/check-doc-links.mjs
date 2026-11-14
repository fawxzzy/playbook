#!/usr/bin/env node
// Guard: every relative markdown link `[text](relative/path)` in a tracked *.md file must point at a
// tracked file or directory.
//
// Scope (deliberately narrow, deterministic, no network):
//   - checked:  inline links and images `[text](dest)` / `![alt](dest)` outside fenced code and inline code
//   - ignored:  http(s)/mailto/any `scheme:` destinations, protocol-relative `//host`, anchor-only `#frag`,
//               reference-style links, bare backticked paths, `#fragment` and `?query` suffixes (anchors
//               inside the target file are NOT validated)
//   - existence is judged against `git ls-files` (case-sensitive, like GitHub), never the working tree, so
//     the result is identical on Windows, Linux and CI and ignores untracked/generated leftovers.
//
// Allowlist: `scripts/check-doc-links.allowlist.txt` lists known-dead links as `<source.md> -> <destination>`
// lines (`#` starts a comment). Allowlisted links do not fail the gate. An entry that no longer matches a
// dead link is reported as stale (warning; error with --strict-allowlist) so the list can only shrink.
//
// Usage: node scripts/check-doc-links.mjs [--root <dir>] [--allowlist <file>] [--strict-allowlist] [--json]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_ALLOWLIST = 'scripts/check-doc-links.allowlist.txt';

const normalizeEol = (value) => value.replace(/\r\n/g, '\n');
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Blank out inline code spans (`code`, ``co`de``) so links inside them are ignored. Length is preserved. */
const maskInlineCode = (line) =>
  line.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (match) => ' '.repeat(match.length));

/** Parse the destination that starts right after a `](`. Returns { destination, end } or null. */
const parseDestination = (line, start) => {
  let index = start;
  while (index < line.length && (line[index] === ' ' || line[index] === '\t')) index += 1;
  if (index >= line.length) return null;

  if (line[index] === '<') {
    const close = line.indexOf('>', index + 1);
    if (close === -1) return null;
    return { destination: line.slice(index + 1, close), end: close + 1 };
  }

  let depth = 0;
  let cursor = index;
  while (cursor < line.length) {
    const char = line[cursor];
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === '(') depth += 1;
    else if (char === ')') {
      if (depth === 0) break;
      depth -= 1;
    } else if (char === ' ' || char === '\t') break;
    cursor += 1;
  }
  if (cursor > line.length) cursor = line.length;
  return { destination: line.slice(index, cursor), end: cursor };
};

/**
 * @param {string} markdown
 * @returns {{ line: number, destination: string }[]} inline link destinations outside fenced/inline code
 */
export const extractLinks = (markdown) => {
  const links = [];
  const lines = normalizeEol(markdown).split('\n');
  let fence = null;

  lines.forEach((rawLine, lineIndex) => {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(rawLine);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence.char && fenceMatch[1].length >= fence.length && /^\s*(`+|~+)\s*$/.test(rawLine)) {
        fence = null;
      }
      return;
    }
    if (fenceMatch) {
      fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
      return;
    }

    const line = maskInlineCode(rawLine);
    let cursor = 0;
    for (;;) {
      const marker = line.indexOf('](', cursor);
      if (marker === -1) break;
      cursor = marker + 2;
      if (line.lastIndexOf('[', marker) === -1) continue;
      const parsed = parseDestination(rawLine, marker + 2);
      if (!parsed) continue;
      links.push({ line: lineIndex + 1, destination: parsed.destination });
      cursor = Math.max(cursor, parsed.end);
    }
  });

  return links;
};

/**
 * Resolve a link destination against its source file.
 * @returns {{ skip: true } | { skip: false, target: string | null }} target is a repo-relative posix path,
 * or null when the link escapes the repository root.
 */
export const resolveLink = (sourceFile, destination) => {
  const trimmed = destination.trim();
  if (trimmed === '' || trimmed.startsWith('#') || SCHEME.test(trimmed) || trimmed.startsWith('//')) {
    return { skip: true };
  }

  const withoutSuffix = trimmed.split('#')[0].split('?')[0];
  if (withoutSuffix === '') return { skip: true };

  let decoded = withoutSuffix;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    decoded = withoutSuffix;
  }

  const joined = decoded.startsWith('/')
    ? path.posix.normalize(decoded.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(sourceFile), decoded));
  if (joined === '..' || joined.startsWith('../')) return { skip: false, target: null };
  return { skip: false, target: joined === '.' ? '' : joined.replace(/\/$/, '') };
};

/** @param {string[]} trackedFiles repo-relative posix paths from `git ls-files` */
export const buildTrackedIndex = (trackedFiles) => {
  const files = new Set(trackedFiles);
  const directories = new Set(['']);
  for (const file of trackedFiles) {
    let dir = path.posix.dirname(file);
    while (dir !== '.' && !directories.has(dir)) {
      directories.add(dir);
      dir = path.posix.dirname(dir);
    }
  }
  return { files, directories };
};

/**
 * @param {string} text allowlist file content: `<source.md> -> <destination>` per line, `#` comments
 * @returns {{ entries: { source: string, destination: string, key: string }[], errors: string[] }}
 */
export const parseAllowlist = (text) => {
  const entries = [];
  const errors = [];
  normalizeEol(text)
    .split('\n')
    .forEach((rawLine, index) => {
      const line = rawLine.replace(/(^|\s)#.*$/, '').trim();
      if (line === '') return;
      const separator = line.indexOf(' -> ');
      if (separator === -1) {
        errors.push(`allowlist line ${index + 1}: expected "<source.md> -> <destination>", got "${rawLine.trim()}"`);
        return;
      }
      const source = line.slice(0, separator).trim();
      const destination = line.slice(separator + 4).trim();
      if (!source || !destination) {
        errors.push(`allowlist line ${index + 1}: empty source or destination`);
        return;
      }
      entries.push({ source, destination, key: `${source} -> ${destination}` });
    });
  return { entries, errors };
};

/**
 * @param {{ markdownFiles: string[], trackedFiles: string[], readFile: (file: string) => string, allowlist?: { key: string }[] }} input
 * @returns {{ dead: { source: string, line: number, destination: string }[], allowed: { source: string, line: number, destination: string }[], staleAllowlist: string[], checked: number }}
 */
export const findDeadLinks = ({ markdownFiles, trackedFiles, readFile, allowlist = [] }) => {
  const index = buildTrackedIndex(trackedFiles);
  const allowKeys = new Set(allowlist.map((entry) => entry.key));
  const usedKeys = new Set();
  const dead = [];
  const allowed = [];
  let checked = 0;

  for (const source of [...markdownFiles].sort()) {
    for (const link of extractLinks(readFile(source))) {
      const resolved = resolveLink(source, link.destination);
      if (resolved.skip) continue;
      checked += 1;
      const exists = resolved.target !== null && (index.files.has(resolved.target) || index.directories.has(resolved.target));
      if (exists) continue;
      const record = { source, line: link.line, destination: link.destination };
      const key = `${source} -> ${link.destination}`;
      if (allowKeys.has(key)) {
        usedKeys.add(key);
        allowed.push(record);
      } else {
        dead.push(record);
      }
    }
  }

  const staleAllowlist = [...allowKeys].filter((key) => !usedKeys.has(key)).sort();
  return { dead, allowed, staleAllowlist, checked };
};

export const formatReport = ({ dead, allowed, staleAllowlist, checked }, { strictAllowlist = false } = {}) => {
  const lines = [];
  if (dead.length > 0) {
    lines.push(`Dead relative markdown links (${dead.length}):`);
    for (const item of dead) lines.push(`  - ${item.source}:${item.line} -> ${item.destination}`);
    lines.push(
      '',
      'Fix: retarget the link to the real file, or remove the link if the target never existed.',
      `Known-dead links that cannot be fixed yet go in ${DEFAULT_ALLOWLIST} (with a comment saying why and when to remove them).`
    );
  }
  if (staleAllowlist.length > 0) {
    lines.push(
      '',
      `${strictAllowlist ? 'Error' : 'Warning'}: ${staleAllowlist.length} allowlist entr${staleAllowlist.length === 1 ? 'y no longer matches' : 'ies no longer match'} a dead link (remove ${staleAllowlist.length === 1 ? 'it' : 'them'} from ${DEFAULT_ALLOWLIST}):`,
      ...staleAllowlist.map((key) => `  - ${key}`)
    );
  }
  lines.push('', `Checked ${checked} relative markdown links; ${dead.length} dead, ${allowed.length} allowlisted.`);
  return lines.join('\n');
};

const git = (repoRoot, args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const parseArgs = (argv) => {
  const options = { root: null, allowlist: DEFAULT_ALLOWLIST, strictAllowlist: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      options.root = argv[index + 1];
      index += 1;
    } else if (arg === '--allowlist') {
      options.allowlist = argv[index + 1];
      index += 1;
    } else if (arg === '--strict-allowlist') options.strictAllowlist = true;
    else if (arg === '--json') options.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
};

const main = () => {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = options.root ? path.resolve(options.root) : path.resolve(scriptDir, '..');

  const trackedFiles = git(repoRoot, ['ls-files', '-z']).split('\0').filter(Boolean);
  const markdownFiles = trackedFiles.filter((file) => file.toLowerCase().endsWith('.md'));

  const allowlistPath = path.resolve(repoRoot, options.allowlist);
  const parsedAllowlist = fs.existsSync(allowlistPath)
    ? parseAllowlist(fs.readFileSync(allowlistPath, 'utf8'))
    : { entries: [], errors: [] };
  if (parsedAllowlist.errors.length > 0) {
    console.error(parsedAllowlist.errors.join('\n'));
    return 2;
  }

  const result = findDeadLinks({
    markdownFiles,
    trackedFiles,
    readFile: (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8'),
    allowlist: parsedAllowlist.entries
  });

  const failed = result.dead.length > 0 || (options.strictAllowlist && result.staleAllowlist.length > 0);
  if (options.json) {
    console.log(JSON.stringify({ ok: !failed, ...result }, null, 2));
  } else if (failed || result.staleAllowlist.length > 0) {
    (failed ? console.error : console.warn)(formatReport(result, { strictAllowlist: options.strictAllowlist }));
  } else {
    console.log(formatReport(result));
  }
  return failed ? 1 : 0;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
