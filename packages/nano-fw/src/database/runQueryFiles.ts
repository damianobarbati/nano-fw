import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyMigrations } from './applyMigrations.ts';
import type { createDatabase } from './getDatabase.ts';

type Database = ReturnType<typeof createDatabase>;
type Options = { database: Database; directory: string; command: 'migrate' | 'seed' };
type Handler = (database: Database) => Promise<void>;

export async function runQueryFiles({ database, directory, command }: Options) {
  const folder = join(directory, command === 'migrate' ? 'migrations' : 'seeds');
  const entries = await readdir(folder, { withFileTypes: true });

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts'))
    .map((entry) => entry.name)
    .sort();

  const load = async (file: string): Promise<Handler> => {
    const path = join(folder, file);

    try {
      const module: Record<string, unknown> = await import(pathToFileURL(path).href);
      const [handler, ...extra] = Object.values(module);
      if (typeof handler !== 'function' || extra.length) throw new Error('Expected exactly one exported function');

      const run: Handler = async (database) => {
        try {
          await handler(database);
        } catch (cause) {
          throw new Error(`Failed to run ${path}`, { cause });
        }
      };

      return run;
    } catch (cause) {
      throw new Error(`Cannot load ${path}`, { cause });
    }
  };

  if (command === 'migrate') {
    await applyMigrations({ database, files, load });
    return;
  } else {
    for (const file of files) {
      const handler = await load(file);

      await handler(database);
    }
  }
}
