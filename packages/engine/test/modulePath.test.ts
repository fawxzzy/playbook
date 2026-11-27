import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveIndexedModulePath } from '../src/indexer/modulePath.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

describe('resolveIndexedModulePath', () => {
  it('reports src/features/<name> for a feature module of a modular-monolith repo', () => {
    const repo = createRepo('playbook-module-path-feature');
    fs.mkdirSync(path.join(repo, 'src', 'features', 'day-editor'), { recursive: true });

    expect(resolveIndexedModulePath(repo, { architecture: 'modular-monolith' }, 'day-editor')).toBe('src/features/day-editor');
  });

  it('reports src/<name> for a top-level source module', () => {
    const repo = createRepo('playbook-module-path-top-level');
    fs.mkdirSync(path.join(repo, 'src', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(repo, 'src', 'features', 'users'), { recursive: true });

    expect(resolveIndexedModulePath(repo, { architecture: 'modular-monolith' }, 'lib')).toBe('src/lib');
  });

  it('prefers the feature folder when both src/features/<name> and src/<name> exist', () => {
    const repo = createRepo('playbook-module-path-collision');
    fs.mkdirSync(path.join(repo, 'src', 'users'), { recursive: true });
    fs.mkdirSync(path.join(repo, 'src', 'features', 'users'), { recursive: true });

    expect(resolveIndexedModulePath(repo, { architecture: 'modular-monolith' }, 'users')).toBe('src/features/users');
  });

  it('ignores src/features when the architecture is not modular-monolith', () => {
    const repo = createRepo('playbook-module-path-other-architecture');
    fs.mkdirSync(path.join(repo, 'src', 'features', 'users'), { recursive: true });

    expect(resolveIndexedModulePath(repo, { architecture: 'layered' }, 'users')).toBe('src/users');
  });

  it('keeps the src/<name> label for workspace modules', () => {
    const repo = createRepo('playbook-module-path-workspace');
    fs.mkdirSync(path.join(repo, 'src', 'features', 'core'), { recursive: true });

    expect(
      resolveIndexedModulePath(
        repo,
        { architecture: 'modular-monolith', workspace: [{ name: 'core', path: 'packages/core', role: 'core', dependsOn: [] }] },
        'core'
      )
    ).toBe('src/core');
  });

  it('does not report a feature folder that .playbookignore excludes', () => {
    const repo = createRepo('playbook-module-path-ignored');
    fs.mkdirSync(path.join(repo, 'src', 'features', 'generated'), { recursive: true });
    fs.writeFileSync(path.join(repo, '.playbookignore'), 'src/features/generated\n');

    expect(resolveIndexedModulePath(repo, { architecture: 'modular-monolith' }, 'generated')).toBe('src/generated');
  });

  it('does not report a feature path that is a file rather than a folder', () => {
    const repo = createRepo('playbook-module-path-file');
    fs.mkdirSync(path.join(repo, 'src', 'features'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src', 'features', 'users'), 'not a folder\n');

    expect(resolveIndexedModulePath(repo, { architecture: 'modular-monolith' }, 'users')).toBe('src/users');
  });
});
