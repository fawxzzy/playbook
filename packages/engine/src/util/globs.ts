import path from 'node:path';

export const matchesAny = (file: string, patterns: string[]): boolean =>
  patterns.some((pattern) => path.matchesGlob(file, pattern));

export const matchesFileOrDirectoryGlob = (value: string, pattern: string): boolean =>
  path.matchesGlob(value, pattern) || path.matchesGlob(`${value}/`, pattern);
