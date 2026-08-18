import { faker } from '@faker-js/faker';
import Repository from '#framework/database/Repository.ts';
import type { Knex } from 'knex';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import getConfig from '#framework/database/getConfig.ts';
import getDatabase from '#framework/database/getDatabase.ts';

const DB_URI = process.env.DB_URI;
if (!DB_URI) throw new Error('DB_URI environment variable is not set');

const database = getDatabase(getConfig(DB_URI));

describe('Repository', () => {
  beforeAll(async () => {
    await database.raw(`drop table if exists _users cascade`);
    await database.raw(`drop view if exists _users2 cascade`);
    await database.raw(`create table _users (id bigserial not null primary key, name text not null)`);
    await database.raw(`create view _users2 as (select *, length(name) as code from _users)`);
  });

  afterAll(async () => {
    await database.raw(`drop table if exists _users cascade`);
    await database.raw(`drop view if exists _users2 cascade`);
  });

  describe('get', () => {
    beforeEach(async () => {
      await database.raw(`truncate table _users cascade`);
    });

    it('works with view', async () => {
      type UserRow = { id: string; name: string; code: number };
      type User = UserRow;
      class UserRepository extends Repository<User, UserRow, Partial<UserRow>, Partial<UserRow>> {}
      const repository = new UserRepository({ database, tableName: '_users', viewName: '_users2', uniqueSortColumn: 'id' });

      const row_created = await repository.create({ name: faker.person.firstName() });
      const row_selected = await repository.get(row_created.id);
      const rows_selected = await repository.getem({});
      const assertion = { id: expect.any(Number), name: expect.any(String), code: expect.any(Number) };
      expect(row_created).toEqual(assertion);
      expect(row_selected).toEqual(assertion);
      expect(rows_selected).toEqual(expect.arrayContaining([assertion]));
    });
  });

  describe('getem', () => {
    it('works without custom getem method', async () => {
      type UserRow = { id: string; name: string; code: string };
      type User = UserRow;
      class UserRepository extends Repository<User, UserRow, Partial<UserRow>, Partial<UserRow>> {}
      const repository = new UserRepository({ database, tableName: '_users', uniqueSortColumn: 'id' });
      const row = await repository.create({ name: faker.person.firstName() });
      const result = await repository.getem({});
      const count = await repository.count({});
      expect(result).toEqual(expect.arrayContaining([expect.objectContaining(row)]));
      expect(result.length).toEqual(count);
    });

    it('works with custom getem returning knex query', async () => {
      type UserRow = { id: string; name: string };
      type User = UserRow;
      class UserRepository extends Repository<User, UserRow, Partial<UserRow>, Partial<UserRow>> {
        async getemQuery(_params = {}) {
          const query = this.db<UserRow>(this.tableOrView).select().returning('*');
          return { type: 'query' as const, query };
        }
      }
      const repository = new UserRepository({ database, tableName: '_users', uniqueSortColumn: 'id' });
      const row = await repository.create({ name: faker.person.firstName() });
      const result = await repository.getem({});
      const count = await repository.count({});
      expect(result).toEqual(expect.arrayContaining([expect.objectContaining(row)]));
      expect(result.length).toEqual(count);
    });

    it('works with custom getem returning knex raw query', async () => {
      type UserRow = { id: string; name: string };
      type User = UserRow;
      class UserRepository extends Repository<User, UserRow, Partial<UserRow>, Partial<UserRow>> {
        async getemQuery(_params = {}) {
          const sql = 'select * from _users2';
          const bindings = {};
          return { type: 'raw' as const, sql, bindings };
        }
      }
      const repository = new UserRepository({ database, tableName: '_users', uniqueSortColumn: 'id' });
      const row = await repository.create({ name: faker.person.firstName() });
      const result = await repository.getem({});
      const count = await repository.count({});
      expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ ...row, code: expect.any(Number) })]));
      expect(result.length).toEqual(count);
    });
  });

  describe('runInTransaction', () => {
    type TestRow = { id: string; name: string };
    class TestRepository extends Repository<TestRow, TestRow, Partial<TestRow>, Partial<TestRow>> {}
    const testRepository = new TestRepository({ database, tableName: '_users' });

    it('should commit changes when transaction succeeds', async () => {
      const name = faker.person.fullName();
      await testRepository.runInTransaction(async () => {
        await testRepository.create({ name });
      });
      const result = await testRepository.getBy({ name });
      expect(result).toMatchObject({ name });
    });

    it('should rollback changes when transaction fails', async () => {
      const name = faker.person.fullName();

      await expect(
        testRepository.runInTransaction(async () => {
          await testRepository.create({ name });
          throw new Error('ops!');
        }),
      ).rejects.toThrow('ops!');

      const result = await testRepository.findBy({ name });
      expect(result).toEqual(null);
    });
  });

  describe('misc', () => {
    describe('without policing', () => {
      type UserRow = { id: string; name: string; code: string };
      type User = UserRow;
      class UserRepository extends Repository<User, UserRow, Partial<UserRow>, Partial<UserRow>> {}
      const repository = new UserRepository({ database, tableName: '_users', uniqueSortColumn: 'id' });

      beforeEach(async () => {
        await repository.create({ name: 'John Doe' });
      });

      afterEach(async () => {
        await repository.db.raw('truncate _users restart identity cascade');
      });

      it('getBy returns', async () => {
        const result = await repository.getBy({ name: 'John Doe' });
        expect(result).toMatchObject({ name: 'John Doe' });
      });

      it('getBy throws', async () => {
        await expect(repository.getBy({ name: 'Jane Dane' })).rejects.toThrow(expect.objectContaining({ status: 404, code: 'RESOURCE_NOT_FOUND' }));
      });

      it('findBy returns', async () => {
        const result = await repository.findBy({ name: 'John Doe' });
        expect(result).toMatchObject({ name: 'John Doe' });
      });

      it('findBy returns null', async () => {
        const result = await repository.findBy({ name: 'Jane Dane' });
        expect(result).toEqual(null);
      });

      it('update returns', async () => {
        const result = await repository.update(1, { name: 'Jane Dane' });
        expect(result).toMatchObject({ id: 1, name: 'Jane Dane' });
      });

      it('update throws', async () => {
        await expect(repository.update(2, { name: 'Jane Dane' })).rejects.toThrow(expect.objectContaining({ status: 404, code: 'RESOURCE_NOT_FOUND' }));
      });

      it('updateBy returns', async () => {
        const result = await repository.updateBy({ name: 'Jane Dane' }, { name: 'John Doe' });
        expect(result).toEqual(expect.arrayContaining([{ id: 1, name: 'Jane Dane' }]));
      });

      it('updateBy throws', async () => {
        const result = await repository.updateBy({ name: 'John Doe' }, { name: 'Jane Dane' });
        expect(result).toHaveLength(0);
      });

      it('remove returns', async () => {
        const result = await repository.remove(1);
        expect(result).toBe(true);
      });

      it('remove throws', async () => {
        const result = await repository.remove(2);
        expect(result).toBe(false);
      });
    });
  });

  describe('with policing', () => {
    type UserRow = { id: string; name: string; code: string };
    type User = UserRow;
    class UserRepository extends Repository<User, UserRow, Partial<UserRow>, Partial<UserRow>> {
      async police(query: Knex.QueryBuilder, _action: 'select' | 'update' | 'delete'): Promise<Knex.QueryBuilder> {
        return query.whereRaw('(1 = 1)');
      }
    }
    const repository = new UserRepository({ database, tableName: '_users', uniqueSortColumn: 'id' });

    beforeEach(async () => {
      await repository.create({ name: 'John Doe' });
    });

    afterEach(async () => {
      await repository.db.raw('truncate _users restart identity cascade');
    });

    it('getBy returns', async () => {
      const result = await repository.getBy({ name: 'John Doe' });
      expect(result).toMatchObject({ name: 'John Doe' });
    });

    it('getBy throws', async () => {
      await expect(repository.getBy({ name: 'Jane Dane' })).rejects.toThrow(expect.objectContaining({ status: 404, code: 'RESOURCE_NOT_FOUND' }));
    });

    it('findBy returns', async () => {
      const result = await repository.findBy({ name: 'John Doe' });
      expect(result).toMatchObject({ name: 'John Doe' });
    });

    it('findBy returns null', async () => {
      const result = await repository.findBy({ name: 'Jane Dane' });
      expect(result).toEqual(null);
    });

    it('update returns', async () => {
      const result = await repository.update(1, { name: 'Jane Dane' });
      expect(result).toMatchObject({ id: 1, name: 'Jane Dane' });
    });

    it('update throws', async () => {
      await expect(repository.update(2, { name: 'Jane Dane' })).rejects.toThrow(expect.objectContaining({ status: 404, code: 'RESOURCE_NOT_FOUND' }));
    });

    it('updateBy returns', async () => {
      const result = await repository.updateBy({ name: 'Jane Dane' }, { name: 'John Doe' });
      expect(result).toEqual(expect.arrayContaining([{ id: 1, name: 'Jane Dane' }]));
    });

    it('updateBy throws', async () => {
      const result = await repository.updateBy({ name: 'John Doe' }, { name: 'Jane Dane' });
      expect(result).toHaveLength(0);
    });

    it('remove returns', async () => {
      const result = await repository.remove(1);
      expect(result).toBe(true);
    });

    it('remove throws', async () => {
      const result = await repository.remove(2);
      expect(result).toBe(false);
    });

    describe('with broken policing', () => {
      type UserRow = { id: string; name: string; code: string };
      type User = UserRow;
      class UserRepository extends Repository<User, UserRow, Partial<UserRow>, Partial<UserRow>> {
        async police(query: Knex.QueryBuilder, _action: 'select' | 'update' | 'delete'): Promise<Knex.QueryBuilder> {
          return query.whereRaw('(1 = 0)');
        }
      }
      const repository = new UserRepository({ database, tableName: '_users', uniqueSortColumn: 'id' });

      beforeEach(async () => {
        await repository.create({ name: 'John Doe' });
      });

      afterEach(async () => {
        await repository.db.raw('truncate _users restart identity cascade');
      });

      it('getBy throws', async () => {
        await expect(repository.getBy({ name: 'Jane Dane' })).rejects.toThrow(expect.objectContaining({ status: 404, code: 'RESOURCE_NOT_FOUND' }));
      });

      it('findBy returns null', async () => {
        const result = await repository.findBy({ name: 'Jane Dane' });
        expect(result).toEqual(null);
      });

      it('update throws', async () => {
        await expect(repository.update(1, { name: 'Jane Dane' })).rejects.toThrow(expect.objectContaining({ status: 404, code: 'RESOURCE_NOT_FOUND' }));
      });

      it('updateBy returns', async () => {
        const result = await repository.updateBy({ name: 'Jane Dane' }, { name: 'John Doe' });
        expect(result).toHaveLength(0);
      });

      it('updateBy returns none', async () => {
        const result = await repository.updateBy({ name: 'John Doe' }, { name: 'Jane Dane' });
        expect(result).toHaveLength(0);
      });

      it('remove throws', async () => {
        const result = await repository.remove(1);
        expect(result).toBe(false);
      });
    });
  });
});
