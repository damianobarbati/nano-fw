import fsp from 'node:fs/promises';
import type { Knex } from 'knex';

export const up = async (database: Knex) => {
  const schema = await fsp.readFile(new URL('../schema.sql', import.meta.url), 'utf-8');
  await database.raw(schema);
};

export const down = async (_database: Knex) => {};
