import fs from 'node:fs';
import { findUpSync } from 'find-up';

const getPackage = (): { pkg_name: string; pkg_version: string } => {
  let pkg: Record<string, any>;

  const workspaceFilePath = findUpSync('pnpm-workspace.yaml');
  if (workspaceFilePath) {
    const pkgPath = workspaceFilePath.replace('pnpm-workspace.yaml', 'package.json');
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } else {
    const pkgFilePath = findUpSync('package.json');
    if (!pkgFilePath) throw new Error('[framework] Root directory was not found.');
    pkg = JSON.parse(fs.readFileSync(pkgFilePath, 'utf-8'));
  }

  const result = { pkg_name: pkg.name, pkg_version: pkg.version };
  return result;
};

export default getPackage;
