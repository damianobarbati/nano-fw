import knex, { type Knex } from 'knex';
import pg from 'pg';

pg.types.setTypeParser(pg.types.builtins.TEXT, String);
pg.types.setTypeParser(pg.types.builtins.NUMERIC, Number);
pg.types.setTypeParser(pg.types.builtins.INT2, Number);
pg.types.setTypeParser(pg.types.builtins.INT4, Number);
pg.types.setTypeParser(pg.types.builtins.INT8, Number);
pg.types.setTypeParser(pg.types.builtins.FLOAT4, Number);
pg.types.setTypeParser(pg.types.builtins.FLOAT8, Number);

const parsePostgresDate = (value: string | null): string | null => {
  if (value === null) return null;
  let v = value.replace(' ', 'T'); // replace space with T to make it ISO 8601–like
  v = v.replace(/\.000(?=[+-]\d{2}(?::?\d{2})?$)/, ''); // remove milliseconds only if they are exactly .000 before a valid offset
  v = v.replace(/([+-]00:00|[+-]00)$/, 'Z'); // replace zero offset (+00, +00:00, -00, -00:00) with Z
  return v;
};

pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, parsePostgresDate);
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, parsePostgresDate);

const SLOW_QUERY_THRESHOLD = 2_000; // 2s
const SLOW_QUERY_IGNORE_PATTERNS = [/no-log/, /^select count/];
const queries_times = new Map<string, number>();

const getDatabase = (config: Knex.Config) => {
  const database = knex(config);

  database.on('query', (query) => queries_times.set(query.__knexQueryUid, Date.now()));

  database.on('query-response', (_response, query) => {
    const start = queries_times.get(query.__knexQueryUid);
    queries_times.delete(query.__knexQueryUid);
    if (!start) return;
    const ignore = SLOW_QUERY_IGNORE_PATTERNS.some((pattern) => pattern.test(query.sql));
    if (ignore) return;
    const duration = Date.now() - start;
    if (duration > SLOW_QUERY_THRESHOLD) console.log(`[SLOW QUERY ${duration}ms] ${interpolateQuery(query.sql, query.bindings).slice(0, 1_000)}`);
  });

  return database;
};

const interpolateQuery = (sql: string, bindings: any[] = []): string => {
  try {
    return sql.replace(/\$(\d+)/g, (_, index) => {
      const i = Number.parseInt(index, 10) - 1;
      const val = bindings[i];
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number' || typeof val === 'boolean') return val.toString();
      if (val instanceof Date) return `'${val.toISOString()}'`;
      return `'${String(val).replace(/'/g, "''")}'`;
    });
  } catch {
    return sql;
  }
};

export default getDatabase;
