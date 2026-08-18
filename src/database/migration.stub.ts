import fsp from 'node:fs/promises';
import type { Knex } from 'knex';

const views = await fsp.readFile('../database/views.sql', 'utf-8');

export const up = async (database: Knex) => {
  await database.raw('...');
  await database.raw(views);
};

export const down = Function.prototype;
