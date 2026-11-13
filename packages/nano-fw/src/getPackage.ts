import fs from 'node:fs';
import { findUpSync } from 'find-up';

const getPackage = (): { pkg_name: string; pkg_version: string } => {
  const pkgFilePath = findUpSync('package.json');
  if (!pkgFilePath) throw new Error('[framework] Root directory was not found.');

  const pkg: unknown = JSON.parse(fs.readFileSync(pkgFilePath, 'utf-8'));

  if (
    !pkg ||
    typeof pkg !== 'object' ||
    !('name' in pkg) ||
    typeof pkg.name !== 'string' ||
    !('version' in pkg) ||
    typeof pkg.version !== 'string'
  ) {
    throw new Error('[framework] Package name and version must be strings.');
  }

  const result = { pkg_name: pkg.name, pkg_version: pkg.version };
  return result;
};

export default getPackage;
