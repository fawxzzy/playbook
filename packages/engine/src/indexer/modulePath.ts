import fs from 'node:fs';
import path from 'node:path';
import type { RepositoryIndex } from './repoIndexer.js';
import { isPlaybookIgnored, parsePlaybookIgnore } from './playbookIgnore.js';

/**
 * Repo-relative folder an indexed module lives in. Modular-monolith feature modules live in
 * `src/features/<name>` (a feature also wins over a same-named top-level `src/<name>`, matching
 * the indexer); every other module keeps the `src/<name>` label, including workspace packages.
 */
export const resolveIndexedModulePath = (
  projectRoot: string,
  index: Pick<RepositoryIndex, 'architecture'> & Partial<Pick<RepositoryIndex, 'workspace'>>,
  moduleName: string
): string => {
  const isWorkspaceModule = (index.workspace ?? []).some((entry) => entry.name === moduleName);
  if (index.architecture === 'modular-monolith' && !isWorkspaceModule) {
    const featureRelativePath = `src/features/${moduleName}`;
    const featureAbsolutePath = path.join(projectRoot, 'src', 'features', moduleName);
    if (
      fs.existsSync(featureAbsolutePath) &&
      fs.statSync(featureAbsolutePath).isDirectory() &&
      !isPlaybookIgnored(featureRelativePath, parsePlaybookIgnore(projectRoot))
    ) {
      return featureRelativePath;
    }
  }

  return `src/${moduleName}`;
};
