import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const require = createRequire(import.meta.url);
const PNPM_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const cliDir = path.join(repoRoot, 'packages', 'cli');
const cliDistDir = path.join(cliDir, 'dist');
const wrapperRuntimeDir = path.join(repoRoot, 'packages', 'cli-wrapper', 'runtime');
const workspacePackages = [
  path.join(repoRoot, 'packages', 'core'),
  path.join(repoRoot, 'packages', 'engine'),
  path.join(repoRoot, 'packages', 'node')
];

const copiedExternalPackages = new Set();

const ensureExists = (target, message) => {
  if (!fs.existsSync(target)) {
    throw new Error(message);
  }
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const requiredBuildOutputs = [
  {
    target: cliDistDir,
    message: `Missing CLI dist at ${cliDistDir}. Run "pnpm -r build" before packing the cli-wrapper.`
  },
  ...workspacePackages.map((packageDir) => ({
    target: path.join(packageDir, 'dist'),
    message: `Missing dependency dist at ${path.join(packageDir, 'dist')}. Run "pnpm -r build" before packing the cli-wrapper.`
  }))
];

const missingBuildOutputs = requiredBuildOutputs
  .filter(({ target }) => !fs.existsSync(target))
  .map(({ message }) => message);

if (missingBuildOutputs.length > 0) {
  throw new Error(missingBuildOutputs.join('\n'));
}

const resolvePackageJsonPath = (packageName, fromDir) => {
  const spec = `${packageName}/package.json`;

  try {
    return require.resolve(spec, { paths: [fromDir] });
  } catch (primaryError) {
    const resolverScript = [
      "const { createRequire } = require('node:module');",
      "const path = require('node:path');",
      `const req = createRequire(path.join(${JSON.stringify(fromDir)}, 'package.json'));`,
      `process.stdout.write(req.resolve(${JSON.stringify(spec)}));`
    ].join(' ');
    const fallback = spawnSync(PNPM_BIN, ['exec', 'node', '-e', resolverScript], {
      cwd: repoRoot,
      encoding: 'utf8'
    });

    if (fallback.status === 0) {
      const resolved = fallback.stdout.trim();
      if (resolved) return resolved;
    }

    const stderr = fallback.stderr?.trim();
    throw new Error(
      `Unable to resolve ${spec} from ${fromDir}.\n${
        stderr || (primaryError instanceof Error ? primaryError.message : String(primaryError))
      }`
    );
  }
};

const copyExternalPackage = (packageName, fromDir) => {
  if (copiedExternalPackages.has(packageName)) return;

  const resolvedPackageJsonPath = resolvePackageJsonPath(packageName, fromDir);
  const sourceDir = path.dirname(resolvedPackageJsonPath);
  const targetDir = path.join(wrapperRuntimeDir, 'node_modules', ...packageName.split('/'));

  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  copiedExternalPackages.add(packageName);

  const packageJson = readJson(resolvedPackageJsonPath);
  const dependencies = packageJson.dependencies ?? {};
  for (const dependencyName of Object.keys(dependencies)) {
    copyExternalPackage(dependencyName, sourceDir);
  }
};

fs.rmSync(wrapperRuntimeDir, { recursive: true, force: true });
fs.mkdirSync(wrapperRuntimeDir, { recursive: true });
fs.cpSync(cliDistDir, wrapperRuntimeDir, { recursive: true });

for (const packageDir of workspacePackages) {
  const packageJsonPath = path.join(packageDir, 'package.json');
  const distDir = path.join(packageDir, 'dist');

  ensureExists(packageJsonPath, `Missing package.json at ${packageJsonPath}.`);

  const packageJson = readJson(packageJsonPath);
  const vendorDir = path.join(wrapperRuntimeDir, 'node_modules', ...packageJson.name.split('/'));
  fs.mkdirSync(vendorDir, { recursive: true });
  fs.cpSync(distDir, path.join(vendorDir, 'dist'), { recursive: true });

  fs.writeFileSync(
    path.join(vendorDir, 'package.json'),
    JSON.stringify(
      {
        name: packageJson.name,
        version: packageJson.version,
        type: packageJson.type,
        main: packageJson.main,
        exports: packageJson.exports,
        types: packageJson.types
      },
      null,
      2
    ) + '\n'
  );

  const dependencies = packageJson.dependencies ?? {};
  for (const [dependencyName, dependencyVersion] of Object.entries(dependencies)) {
    if (!String(dependencyVersion).startsWith('workspace:')) {
      copyExternalPackage(dependencyName, packageDir);
    }
  }
}

console.log('Prepared cli-wrapper runtime');
