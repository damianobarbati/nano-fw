import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Repository from '../src/database/Repository.ts';
import { database } from './database.ts';

type TestRow = { id: number; name: string };

const repository = new Repository<TestRow, TestRow, TestRow>({ database, tableName: '_test_transactions' });

describe('test transactions', () => {
  beforeAll(async () => {
    await database.raw('create table _test_transactions (id integer primary key, name text not null)');
  });

  afterAll(async () => {
    try {
      expect(await database('_test_transactions')).toEqual([]);
      expect(await database.schema.hasTable('_test_transaction_view')).toEqual(false);
    } finally {
      await database.schema.dropTableIfExists('_test_transactions');
    }
  });

  describe('aroundEach', () => {
    it.each(['first', 'second'])('isolates writes and views in the %s case', async (name) => {
      expect(repository.db.isTransaction).toEqual(true);
      expect(await repository.count()).toEqual(0);
      expect(await repository.db.schema.hasTable('_test_transaction_view')).toEqual(false);

      await repository.create({ id: 1, name });
      await repository.db.raw('create view _test_transaction_view as select * from _test_transactions');

      expect(await database('_test_transactions')).toEqual([]);
      expect(await database.schema.hasTable('_test_transaction_view')).toEqual(false);

      await repository.update(1, { name: 'updated' });
      expect(await repository.get(1)).toMatchObject({ name: 'updated' });
      await repository.remove(1);
      expect(await repository.count()).toEqual(0);
      await repository.create({ id: 1, name });
    });

    it.fails('rolls back writes and views after an assertion fails', async () => {
      await repository.create({ id: 1, name: 'failed assertion' });
      await repository.db.raw('create view _test_transaction_view as select * from _test_transactions');

      expect(await repository.count()).toEqual(0);
    });

    it('starts empty after an assertion fails', async () => {
      expect(await repository.count()).toEqual(0);
      expect(await repository.db.schema.hasTable('_test_transaction_view')).toEqual(false);
    });
  });
});
