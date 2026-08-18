import fs from 'node:fs';
import { findUpSync } from 'find-up';

const getPackage = (): { pkg_name: string; pkg_version: string } => {
  const workspaceFile = findUpSync('pnpm-workspace.yaml');
  if (!workspaceFile) throw new Error('[framework] Database configuration failed because root directory was not found.');
  const pkgPath = workspaceFile.replace('pnpm-workspace.yaml', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const result = { pkg_name: pkg.name, pkg_version: pkg.version };
  return result;
};

export default getPackage;
