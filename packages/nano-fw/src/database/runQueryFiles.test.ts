import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import knex, { type Knex } from 'knex';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { database as admin } from '../../vitest.setup.ts';
import { runMigrations } from './index.ts';
import { runQueryFiles } from './runQueryFiles.ts';

let schema: string;
let directory: string;
let database: Knex;

beforeEach(async () => {
  schema = `runner_${randomUUID().replaceAll('-', '')}`;
  directory = await mkdtemp(join(tmpdir(), 'nano-fw-'));
  await mkdir(join(directory, 'migrations'));
  await mkdir(join(directory, 'seeds'));
  await admin.raw('create schema ??', [schema]);
  database = knex({ ...admin.client.config, searchPath: [schema] });
});

afterEach(async () => {
  await database.destroy();
  await admin.raw('drop schema ?? cascade', [schema]);
  await rm(directory, { recursive: true, force: true });
});

const migrate = async () => {
  await runQueryFiles({ database, directory, command: 'migrate' });
};

const seed = async () => {
  await runQueryFiles({ database, directory, command: 'seed' });
};

describe('runQueryFiles', () => {
  describe('migrate', () => {
    it('applies each migration once across concurrent first runs', async () => {
      await writeFile(
        join(directory, 'migrations/1.ts'),
        "export const up = async db => { await db.raw('create table items (value text)') }",
      );

      await Promise.all([migrate(), migrate()]);
      await migrate();
      expect(await database('knex_migrations').select('name', 'batch')).toEqual([{ name: '1.ts', batch: 1 }]);
    });

    it('resumes Knex history and detects missing applied files', async () => {
      const first = join(directory, 'migrations/1.ts');

      await writeFile(first, 'export const up = async () => {}; export const down = async () => {}');
      await database.migrate.latest({ directory: join(directory, 'migrations'), loadExtensions: ['.ts'] });
      await writeFile(join(directory, 'migrations/2.ts'), 'export default async function createItems() {}');
      await migrate();
      expect(await database('knex_migrations').where({ name: '2.ts' }).pluck('batch')).toEqual([2]);
      await rm(first);
      await expect(migrate()).rejects.toThrow('Missing applied migration: 1.ts');
    });

    it.each([
      ['multiple exports', 'export function up() {}; export function down() {}'],
      ['no runtime exports', 'export type Row = { id: number }'],
      ['a nonfunction export', 'export const value = 1'],
    ])('rejects %s', async (_description, source) => {
      const file = join(directory, 'migrations/invalid.ts');

      await writeFile(file, source);

      await expect(migrate()).rejects.toMatchObject({
        message: `Cannot load ${file}`,
        cause: { message: 'Expected exactly one exported function' },
      });
    });

    it('creates only the migration history table', async () => {
      await migrate();

      const tables = await database('information_schema.tables').where({ table_schema: schema }).pluck('table_name');
      expect(tables).toEqual(['knex_migrations']);
    });

    it('rolls back a failed batch and permits retry', async () => {
      await writeFile(
        join(directory, 'migrations/1.ts'),
        "export const up = async db => { await db.raw('create table items (value text)') }",
      );

      const failing = join(directory, 'migrations/2.ts');

      await writeFile(failing, "export const up = async () => { throw Error('failed') }");
      await expect(migrate()).rejects.toThrow(failing);
      expect(await database('knex_migrations').select()).toEqual([]);
      await rm(failing);
      await migrate();
      expect(await database.schema.hasTable('items')).toEqual(true);
    });
  });

  describe('seed', () => {
    it('repeats files in order and stops at the first error', async () => {
      await database.raw('create table events (id integer generated always as identity, name text)');

      for (const name of ['b', 'a']) {
        await writeFile(
          join(directory, `seeds/${name}.ts`),
          `export const insertEvent = async db => { await db('events').insert({ name: '${name}' }) }`,
        );
      }

      await seed();

      const failing = join(directory, 'seeds/ab.ts');

      await writeFile(failing, 'export const seed = async () => { throw Error("failed") }');
      await expect(seed()).rejects.toThrow(failing);
      expect(await database('events').orderBy('id').pluck('name')).toEqual(['a', 'b', 'a']);
    });
  });
});

describe('runMigrations', () => {
  it('resumes file migrations and applies imported functions in filename order', async () => {
    await writeFile(join(directory, 'migrations/1.ts'), 'export const up = async () => {}');
    await migrate();

    const migrations = {
      '3.ts': async (trx: Knex.Transaction) => {
        await trx.raw('insert into items values (1)');
      },
      '2.ts': async (trx: Knex.Transaction) => {
        await trx.raw('create table items (value integer)');
      },
      '1.ts': async () => {
        throw new Error('Migration ran twice');
      },
    };

    await runMigrations({ database, migrations });
    await runMigrations({ database, migrations });

    expect(await database('knex_migrations').orderBy('id').select('name', 'batch')).toEqual([
      { name: '1.ts', batch: 1 },
      { name: '2.ts', batch: 2 },
      { name: '3.ts', batch: 2 },
    ]);
  });
});
