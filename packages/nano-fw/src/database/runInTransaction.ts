import { AsyncLocalStorage } from 'node:async_hooks';
import type { Knex } from 'knex';

export const trxContext = new AsyncLocalStorage<Knex.Transaction>();

type RunInTransactionOptions<T> = { database: Knex; fn: (trx: Knex.Transaction) => Promise<T> };

export const runInTransaction = async <T>({ database, fn }: RunInTransactionOptions<T>): Promise<T> => {
  const db = trxContext.getStore() ?? database;

  const result = await db.transaction(async (trx) => {
    const value = await trxContext.run(trx, fn, trx);
    return value;
  });

  return result;
};
