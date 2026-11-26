import debug from 'debug';
import type { Knex } from 'knex';
import getPackage from '../getPackage.ts';

/** @deprecated Use createDatabase for connection string based setup. */
const getConfig = (connectionString: string, maxConnections = 20, packageName = getPackage().name): Knex.Config => {
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  const config: Knex.Config = {
    client: 'pg',
    // aws uses unverified ssl, change the export config as needed
    connection: { connectionString, ssl: isLocal ? undefined : { rejectUnauthorized: false } },
    pool: {
      min: 0, // destroy all idle connections (ref: https://github.com/knex/knex/issues/4525#issuecomment-862394537)
      max: maxConnections, // do not saturate connections among all replicas, provide "max connections / number of replicas"
      acquireTimeoutMillis: 3_000,
      idleTimeoutMillis: 1_000,
      propagateCreateError: false,
    },
    acquireConnectionTimeout: 3_000,
    debug: debug.enabled(`${packageName}:db`),
    log: {
      debug: ({ sql, bindings }) => {
        if (!sql?.includes('no-log')) console.log(`[QUERY] ${sql}`, bindings);
      },
    },
  };

  return config;
};

export default getConfig;
