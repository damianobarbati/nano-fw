import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runQueryFiles } from './runQueryFiles.ts';

try {
  const [command, file, ...extra] = process.argv.slice(2);

  if ((command !== 'migrate' && command !== 'seed') || !file || extra.length) {
    throw new Error('Usage: nano-fw <migrate|seed> <db.ts>');
  }

  const path = resolve(file);
  const { database } = await import(pathToFileURL(path).href);

  if (
    typeof database !== 'function' ||
    typeof database.transaction !== 'function' ||
    typeof database.destroy !== 'function'
  ) {
    throw new Error(`Expected a named Knex export "database" in ${path}`);
  }

  try {
    await runQueryFiles({ database, directory: dirname(path), command });
  } finally {
    await database.destroy();
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
