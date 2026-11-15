import { execFileSync } from 'node:child_process';
import { toPosixPath } from '../util/paths.js';

const runGitLines = (repoRoot: string, args: string[]): string[] => {
  const output = execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(toPosixPath);
};

const uniqueSorted = (values: string[]): string[] => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

export const getChangedFiles = (repoRoot: string, baseSha: string, headRef = 'HEAD'): string[] => {
  return runGitLines(repoRoot, ['diff', '--name-only', `${baseSha}..${headRef}`]);
};

export type ChangedFileStatus = {
  status: 'A' | 'M' | 'D' | 'R';
  path: string;
  oldPath?: string;
};

/**
 * Same `base..head` range as `getChangedFiles`, but keeps the git status so callers can tell
 * added files from modified, deleted and renamed ones. Uses `-z` so paths are never quoted.
 * Copies are reported as additions; type changes and unmerged entries as modifications.
 */
export const getChangedFileStatuses = (repoRoot: string, baseSha: string, headRef = 'HEAD'): ChangedFileStatus[] => {
  const output = execFileSync('git', ['diff', '--name-status', '-z', '-M', `${baseSha}..${headRef}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const tokens = output.split('\0');
  const changes: ChangedFileStatus[] = [];
  for (let index = 0; index < tokens.length; ) {
    const code = tokens[index++];
    if (!code) continue;
    const letter = code.charAt(0);
    if (letter === 'R' || letter === 'C') {
      const oldPath = toPosixPath(tokens[index++] ?? '');
      const newPath = toPosixPath(tokens[index++] ?? '');
      changes.push(letter === 'R' ? { status: 'R', path: newPath, oldPath } : { status: 'A', path: newPath });
      continue;
    }
    const filePath = toPosixPath(tokens[index++] ?? '');
    if (!filePath) continue;
    changes.push({ status: letter === 'A' ? 'A' : letter === 'D' ? 'D' : 'M', path: filePath });
  }

  return changes.sort((a, b) => a.path.localeCompare(b.path));
};

export const getWorkingTreeChangedFiles =(repoRoot: string, baseSha: string): string[] => {
  const committedFromBase = getChangedFiles(repoRoot, baseSha, 'HEAD');
  const staged = runGitLines(repoRoot, ['diff', '--name-only', '--cached']);
  const unstaged = runGitLines(repoRoot, ['diff', '--name-only']);
  const untracked = runGitLines(repoRoot, ['ls-files', '--others', '--exclude-standard']);

  return uniqueSorted([...committedFromBase, ...staged, ...unstaged, ...untracked]);
};
