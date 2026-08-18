import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import debug from 'debug';
import type { Knex } from 'knex';
import getPackage from '#framework/getPackage.ts';

const { pkg_name } = getPackage();
const __dirname = fileURLToPath(new URL('.', import.meta.url));

const isDebugEnabled = debug.enabled(`${pkg_name}:db`);

const getConfig = (connectionString: string, maxConnections = 20): Knex.Config => {
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  const config: Knex.Config = {
    client: 'pg',
    connection: { connectionString, ssl: isLocal ? undefined : { rejectUnauthorized: false } },
    pool: {
      min: 0, // destroy all idle connections (ref: https://github.com/knex/knex/issues/4525#issuecomment-862394537)
      max: maxConnections, // do not saturate connections among all replicas, provide "max connections / number of replicas"
      acquireTimeoutMillis: 3_000,
      idleTimeoutMillis: 1_000,
      propagateCreateError: false,
    },
    acquireConnectionTimeout: 3_000,
    debug: isDebugEnabled,
    log: {
      debug: ({ sql, bindings }) => {
        if (!sql?.includes('no-log')) console.log(`[QUERY] ${sql}`, bindings);
      },
    },
    migrations: {
      stub: path.resolve(__dirname, './migration.stub.ts'),
      tableName: 'knex_migrations',
      directory: './migrations',
      loadExtensions: ['.ts'],
    },
    seeds: {
      directory: './seeds',
      loadExtensions: ['.ts'],
    },
  };

  return config;
};

export default getConfig;
