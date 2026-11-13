import type { Knex } from 'knex';
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from 'vitest';
import { database } from '../../test/database.ts';
import Repository, { type RepositoryWhere, trxContext } from './Repository.ts';

type UserRow = { id: number; name: string };
type UserResource = { id: number; label: string };
type Domain = { id: number; hostname: string; user_id: number; tags: string[] | null; _raw: string | null };

const tableName = '_repository_domains';
const viewName = '_repository_domains_view';
const repository = new Repository<Domain>({ database, tableName });
const userRepository = new Repository<UserRow>({ database, tableName: '_users' });

class HydratedRepository extends Repository<UserRow, UserResource> {
  actions: string[] = [];
  hydrationCalls = 0;

  async police(_query: Knex.QueryBuilder, action: 'select' | 'update' | 'delete'): Promise<void> {
    this.actions.push(action);
  }

  async hydrate(rows: UserRow[]): Promise<UserResource[]> {
    this.hydrationCalls++;

    const resources = rows.map(({ id, name }) => ({ id, label: name.toUpperCase() }));
    return resources;
  }
}

class RestrictedRepository extends Repository<Domain> {
  actions: string[] = [];

  async police(query: Knex.QueryBuilder, action: 'select' | 'update' | 'delete'): Promise<void> {
    this.actions.push(action);
    query.where({ user_id: 1 });
  }
}

class ViewRepository extends Repository<Domain> {
  async hydrate(): Promise<Domain[]> {
    throw new Error('must not hydrate');
  }
}

class QueryRepository extends Repository<UserRow> {
  async getemQuery() {
    const query = this.db<UserRow>(this.tableOrView).select('*');
    return { type: 'query' as const, query };
  }
}

class RawRepository extends Repository<UserRow & { code: number }> {
  async getemQuery() {
    return { type: 'raw' as const, sql: 'select * from _users2 where name <> ?', bindings: ['Excluded'] };
  }
}

async function seed() {
  const rows = await repository.create(
    [
      { hostname: 'alpha.test', user_id: 1, tags: ['active'], _raw: 'ordinary column' },
      { hostname: 'beta.test', user_id: 1, tags: [] },
      { hostname: 'gamma.test', user_id: 2, tags: null },
    ],
    true,
  );

  return rows;
}

async function captureQueries(operation: () => Promise<unknown>): Promise<string[]> {
  const queries: string[] = [];
  const collect = ({ sql }: { sql: string }) => queries.push(sql);

  const client = repository.db;

  client.on('query', collect);

  try {
    await operation();
  } finally {
    client.off('query', collect);
  }

  return queries;
}

describe('Repository', () => {
  beforeAll(async () => {
    await database.raw('create table _users (id bigserial primary key, name text not null)');
    await database.raw('create view _users2 as select *, length(name) as code from _users');

    await database.schema.createTable(tableName, (table) => {
      table.bigIncrements('id');
      table.text('hostname').notNullable().unique();
      table.integer('user_id').notNullable();
      table.specificType('tags', 'text[]');
      table.text('_raw');
    });

    await database.raw('create view ?? as select *, length(hostname) as code from ??', [viewName, tableName]);
    await database.schema.createTable('_repository_ids', (table) => table.integer('id').primary());
    await database.raw('create table _repository_locks (id integer primary key, user_id integer not null)');

    await database('_repository_locks').insert([
      { id: 1, user_id: 1 },
      { id: 2, user_id: 1 },
      { id: 3, user_id: 2 },
    ]);
  });

  afterAll(async () => {
    await database.raw('drop view if exists ??', [viewName]);
    await database.raw('drop view if exists _users2');
    await database.schema.dropTableIfExists('_repository_locks');
    await database.schema.dropTableIfExists('_repository_ids');
    await database.schema.dropTableIfExists(tableName);
    await database.schema.dropTableIfExists('_users');
  });

  describe('create', () => {
    it.each([
      { mode: 'table', input: { name: 'Alice' }, expected: { id: expect.any(Number), name: 'Alice' } },
      {
        mode: 'table',
        input: [{ name: 'Alice' }, { name: 'Bob' }],
        expected: [
          { id: expect.any(Number), name: 'Alice' },
          { id: expect.any(Number), name: 'Bob' },
        ],
      },
      { mode: 'view', input: { name: 'Alice' }, expected: { id: expect.any(Number), name: 'Alice', code: 5 } },
      {
        mode: 'view',
        input: [{ name: 'Alice' }, { name: 'Bob' }],
        expected: [
          { id: expect.any(Number), name: 'Alice', code: 5 },
          { id: expect.any(Number), name: 'Bob', code: 3 },
        ],
      },
      { mode: 'table', input: [], expected: [] },
    ])('returns matching input shape from $mode for $input', async ({ mode, input, expected }) => {
      const repository = new Repository<UserRow & { code?: number }>({
        database,
        tableName: '_users',
        viewName: mode === 'view' ? '_users2' : undefined,
      });

      expect(await repository.create(input)).toEqual(expected);
    });

    it('preserves input order when the view returns a different order', async () => {
      await repository.db.raw('create view _users_reversed as select * from _users order by id desc');

      try {
        const repository = new Repository<UserRow>({ database, tableName: '_users', viewName: '_users_reversed' });
        expect(await repository.create([{ name: 'First' }, { name: 'Second' }])).toMatchObject([
          { name: 'First' },
          { name: 'Second' },
        ]);
      } finally {
        await repository.db.raw('drop view _users_reversed');
      }
    });

    it('rejects an insertion whose row is absent from the configured view', async () => {
      await repository.db.raw("create view _users_filtered as select * from _users where name <> 'Hidden'");

      try {
        const repository = new Repository<UserRow>({ database, tableName: '_users', viewName: '_users_filtered' });

        await expect(repository.create({ name: 'Hidden' })).rejects.toMatchObject({
          status: 422,
          code: 'RESOURCE_NOT_FOUND_IN_VIEW',
        });
      } finally {
        await repository.db.raw('drop view _users_filtered');
      }
    });

    it('returns view rows without hydration in plain mode', async () => {
      const hydrated = new HydratedRepository({ database, tableName: '_users', viewName: '_users2' });
      expect(await hydrated.create({ name: 'View' }, true)).toEqual({ id: expect.any(Number), name: 'View', code: 4 });
      expect(hydrated.hydrationCalls).toEqual(0);
    });
  });

  describe('createRaw', () => {
    it('returns a single base row', async () => {
      const raw = new HydratedRepository({ database, tableName: '_users', viewName: '_users2' });
      expect(await raw.createRaw({ name: 'Raw' })).toEqual({ id: expect.any(Number), name: 'Raw' });
      expect(raw.hydrationCalls).toEqual(0);
    });

    it('returns an array of base rows', async () => {
      const raw = new HydratedRepository({ database, tableName: '_users', viewName: '_users2' });
      expect(await raw.createRaw([{ name: 'First' }, { name: 'Second' }])).toEqual([
        { id: expect.any(Number), name: 'First' },
        { id: expect.any(Number), name: 'Second' },
      ]);
    });

    it('returns an empty array for empty input', async () => {
      const raw = new HydratedRepository({ database, tableName: '_users', viewName: '_users2' });
      expect(await raw.createRaw([])).toEqual([]);
    });
  });

  describe('get', () => {
    it.each(['number', 'object'])('accepts a %s ID and returns the resource', async (format) => {
      const hydrated = new HydratedRepository({ database, tableName: '_users' });
      const row = await hydrated.createRaw({ name: 'Alice' });
      const id = format === 'object' ? { id: row.id } : row.id;
      expect(await hydrated.get(id)).toEqual({ id: row.id, label: 'ALICE' });
    });

    it('passes plain mode to lookup', async () => {
      const hydrated = new HydratedRepository({ database, tableName: '_users' });
      const row = await hydrated.createRaw({ name: 'Alice' });
      expect(await hydrated.get(row.id, true)).toEqual(row);
    });
  });

  describe('getBy', () => {
    it('returns plain rows without hydration', async () => {
      const hydrated = new HydratedRepository({ database, tableName: '_users' });
      const row = await hydrated.createRaw({ name: 'Hydrated' });
      expect(await hydrated.getBy({ id: row.id }, true)).toEqual(row);
      expect(hydrated.hydrationCalls).toEqual(0);
    });

    it('throws for a missing row', async () => {
      const hydrated = new HydratedRepository({ database, tableName: '_users' });

      await expect(hydrated.getBy({ id: -1 })).rejects.toMatchObject({ status: 404, code: 'RESOURCE_NOT_FOUND' });
      expect(hydrated.hydrationCalls).toEqual(0);
    });

    it('applies operators and multiple raw conditions', async () => {
      const [alpha] = await seed();
      expect(
        await repository.getBy({
          user_id$eq: 1,
          id$in: [alpha.id],
          _raw$hostname: { sql: 'hostname = ?', bindings: ['alpha.test'] },
          _raw$: 'user_id < 2',
        }),
      ).toMatchObject({ id: alpha.id });
    });
  });

  describe('findBy', () => {
    it('hydrates the result once', async () => {
      const hydrated = new HydratedRepository({ database, tableName: '_users' });
      const row = await hydrated.createRaw({ name: 'Hydrated' });
      expect(await hydrated.findBy({ id: row.id })).toEqual({ id: row.id, label: 'HYDRATED' });
      expect(hydrated.hydrationCalls).toEqual(1);
    });

    it('returns plain rows without hydration', async () => {
      const hydrated = new HydratedRepository({ database, tableName: '_users' });
      const row = await hydrated.createRaw({ name: 'Hydrated' });
      expect(await hydrated.findBy({ id: row.id }, true)).toEqual(row);
      expect(hydrated.hydrationCalls).toEqual(0);
    });

    it('applies select policing once', async () => {
      const hydrated = new HydratedRepository({ database, tableName: '_users' });
      const row = await hydrated.createRaw({ name: 'Hydrated' });

      await hydrated.findBy({ id: row.id });
      expect(hydrated.actions).toEqual(['select']);
    });

    it('returns null for a missing row', async () => {
      const hydrated = new HydratedRepository({ database, tableName: '_users' });
      expect(await hydrated.findBy({ id: -1 })).toBeNull();
      expect(hydrated.hydrationCalls).toEqual(0);
    });

    it('excludes an existing row denied by policing', async () => {
      const rows = await seed();
      const row = rows[2];
      const restricted = new RestrictedRepository({ database, tableName });
      expect(await restricted.findBy({ id: row.id })).toBeNull();
    });

    it('applies operators and multiple raw conditions', async () => {
      const [alpha] = await seed();
      expect(
        await repository.findBy({
          user_id$eq: 1,
          id$in: [alpha.id],
          _raw$hostname: { sql: 'hostname = ?', bindings: ['alpha.test'] },
          _raw$: 'user_id < 2',
        }),
      ).toMatchObject({ id: alpha.id });
    });

    it('reads from the configured view', async () => {
      const row = await userRepository.create({ name: 'Alice' });
      const view = new Repository<UserRow & { code: number }>({ database, tableName: '_users', viewName: '_users2' });
      expect(await view.findBy({ id: row.id })).toEqual({ ...row, code: 5 });
    });
  });

  describe('exists', () => {
    it('applies operators and multiple raw conditions', async () => {
      const [alpha] = await seed();
      expect(
        await repository.exists({
          user_id$eq: 1,
          id$in: [alpha.id],
          _raw$hostname: { sql: 'hostname = ?', bindings: ['alpha.test'] },
          _raw$: 'user_id < 2',
        }),
      ).toEqual(true);
    });

    it('returns false when no rows match', async () => {
      expect(await repository.exists({ id: -1 })).toEqual(false);
    });

    it('executes a single SELECT', async () => {
      const [alpha] = await seed();

      const queries = await captureQueries(async () => {
        await repository.exists({ id: alpha.id });
      });

      expect(queries).toHaveLength(1);
      expect(queries[0]).toMatch(/^select /);
    });
  });

  describe('update', () => {
    it('returns the updated resource', async () => {
      const row = await userRepository.create({ name: 'Alice' });
      expect(await userRepository.update(row.id, { name: 'Jane' })).toEqual({ ...row, name: 'Jane' });
    });

    it('throws for a missing row', async () => {
      await expect(userRepository.update(-1, { name: 'Jane' })).rejects.toMatchObject({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
      });
    });

    it('does not update an existing row denied by policing', async () => {
      const rows = await seed();
      const row = rows[2];
      const restricted = new RestrictedRepository({ database, tableName });

      await expect(restricted.update(row.id, { hostname: 'changed.test' })).rejects.toMatchObject({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
      });

      expect(await repository.get(row.id)).toEqual(row);
    });
  });

  describe('updateBy', () => {
    it('returns matching updated rows', async () => {
      const row = await userRepository.create({ name: 'Alice' });

      expect(await userRepository.updateBy({ name: 'Jane' }, { name: 'Alice' })).toEqual([{ ...row, name: 'Jane' }]);
    });

    it('returns an empty array when no rows match', async () => {
      expect(await userRepository.updateBy({ name: 'Jane' }, { name: 'Absent' })).toEqual([]);
    });

    it('does not update existing rows denied by policing', async () => {
      const rows = await seed();
      const restricted = new RestrictedRepository({ database, tableName });
      expect(await restricted.updateBy({ hostname: 'changed.test' }, { user_id: 2 })).toEqual([]);
      expect(await repository.get(rows[2].id)).toEqual(rows[2]);
    });

    it('applies operators and multiple raw conditions in plain mode', async () => {
      const [alpha] = await seed();
      expect(
        await repository.updateBy(
          { hostname: 'updated.test' },
          {
            user_id$eq: 1,
            id$in: [alpha.id],
            _raw$hostname: { sql: 'hostname = ?', bindings: ['alpha.test'] },
            _raw$: 'user_id < 2',
          },
          true,
        ),
      ).toEqual([{ ...alpha, hostname: 'updated.test' }]);
    });
  });

  describe('remove', () => {
    it('deletes matching rows', async () => {
      const [alpha] = await seed();
      expect(await repository.remove(alpha.id)).toEqual(true);
      expect(await repository.exists({ id: alpha.id })).toEqual(false);
    });
  });

  describe('removeBy', () => {
    it('returns false when no rows match', async () => {
      expect(await repository.removeBy({ id: -1 })).toEqual(false);
    });

    it('does not delete existing rows denied by policing', async () => {
      const rows = await seed();
      const restricted = new RestrictedRepository({ database, tableName });
      expect(await restricted.removeBy({ user_id: 2 })).toEqual(false);
      expect(await repository.get(rows[2].id)).toEqual(rows[2]);
    });

    it('executes a single DELETE without RETURNING', async () => {
      await seed();

      const queries = await captureQueries(async () => {
        await repository.removeBy({ user_id: 1 });
      });

      expect(queries).toHaveLength(1);
      expect(queries[0]).toMatch(/^delete /);
      expect(queries[0]).not.toContain('returning');
    });

    it('deletes every matching row and preserves other rows', async () => {
      const rows = await seed();

      expect(await repository.removeBy({ user_id: 1 })).toEqual(true);
      expect(await repository.getem()).toEqual([rows[2]]);
    });

    it('deletes all rows for an empty filter', async () => {
      await seed();
      expect(await repository.removeBy({})).toEqual(true);
      expect(await repository.count()).toEqual(0);
    });

    it('applies delete policing to an empty filter', async () => {
      await seed();

      const restricted = new RestrictedRepository({ database, tableName });

      await restricted.removeBy({});
      expect(restricted.actions).toEqual(['delete']);
      expect(await repository.getem()).toMatchObject([{ user_id: 2 }]);
    });

    it.each([
      { id$unknown: 1 },
      { id$eq$extra: 1 },
      { id$constructor: 1 },
      { id: undefined },
      { id$in: 1 },
      { _raw$: '' },
      { _raw$: { sql: 'true' } },
      { _raw$: null },
    ])('rejects invalid filters before deleting: %j', async (where) => {
      await seed();
      await expect(repository.removeBy(where as RepositoryWhere<Domain>)).rejects.toMatchObject({ status: 400 });
      expect(await repository.count()).toEqual(3);
    });

    it('uses the base table without hydration when a view is configured', async () => {
      const view = new ViewRepository({ database, tableName, viewName });

      await seed();
      expect(await view.removeBy({ user_id: 2 })).toEqual(true);
    });
  });

  describe('applyWhereWithOperators', () => {
    it.each([
      { name: 'plain equality', where: { user_id: 1 }, matches: [0, 1] },
      { name: 'eq', where: { user_id$eq: 1 }, matches: [0, 1] },
      { name: 'null equality', where: { tags$eq: null }, matches: [2] },
      { name: 'null inequality', where: { tags$neq: null }, matches: [0, 1] },
      { name: 'neq', where: { user_id$neq: 1 }, matches: [2] },
      { name: 'gte', where: { user_id$gte: 2 }, matches: [2] },
      { name: 'lte', where: { user_id$lte: 1 }, matches: [0, 1] },
      { name: 'gt', where: { user_id$gt: 1 }, matches: [2] },
      { name: 'lt', where: { user_id$lt: 2 }, matches: [0, 1] },
      { name: 'in', where: { user_id$in: [1] }, matches: [0, 1] },
      { name: 'nin', where: { user_id$nin: [1] }, matches: [2] },
      { name: 'like', where: { hostname$like: 'alpha' }, matches: [0] },
      { name: 'ilike', where: { hostname$ilike: 'ALPHA' }, matches: [0] },
      { name: 'has', where: { tags$has: 'active' }, matches: [0] },
      { name: 'empty in', where: { id$in: [] }, matches: [] },
      { name: 'empty nin', where: { id$nin: [] }, matches: [0, 1, 2] },
    ])('applies $name', async ({ where, matches }) => {
      const rows = await seed();
      const query = repository.db<Domain>(tableName).orderBy('id');
      const expected = matches.map((index) => rows[index]);

      Repository.applyWhereWithOperators(query, where);
      expect(await query).toEqual(expected);
    });

    it('groups raw OR expressions with other conditions', async () => {
      await seed();

      const query = repository.db<Domain>(tableName);

      Repository.applyWhereWithOperators(query, { user_id: 1, _raw$or: 'user_id = 1 OR user_id = 2' });
      expect(await query).toHaveLength(2);
    });

    it('treats _raw without a dollar sign as an ordinary column', async () => {
      await seed();

      const query = repository.db<Domain>(tableName);

      Repository.applyWhereWithOperators(query, { _raw: 'ordinary column' });
      expect(await query).toMatchObject([{ hostname: 'alpha.test' }]);
    });

    it('binds raw values instead of interpolating them', async () => {
      await seed();

      const query = repository.db<Domain>(tableName);

      Repository.applyWhereWithOperators(query, { _raw$: { sql: 'hostname = ?', bindings: ["' OR true --"] } });
      expect(await query).toEqual([]);
    });

    it('accepts typed operators and reserved raw keys', () => {
      expectTypeOf({ id$in: [1], tags$has: 'active', _raw$test: 'true' }).toExtend<RepositoryWhere<Domain>>();
    });

    it('rejects membership values with the wrong column type', () => {
      // @ts-expect-error Membership values must be arrays of the column type.
      expectTypeOf({ id$in: ['one'] } satisfies RepositoryWhere<Domain>);
    });

    it('rejects array membership values with the wrong element type', () => {
      // @ts-expect-error Array membership uses the element type.
      expectTypeOf({ tags$has: 1 } satisfies RepositoryWhere<Domain>);
    });

    it('rejects unknown filter operators at the type level', () => {
      // @ts-expect-error Unknown operators are not valid filters.
      expectTypeOf({ id$unknown: 1 } satisfies RepositoryWhere<Domain>);
    });
  });

  describe('getem', () => {
    it('applies operators and multiple raw conditions', async () => {
      const [alpha] = await seed();
      expect(
        await repository.getem({
          user_id$eq: 1,
          id$in: [alpha.id],
          _raw$hostname: { sql: 'hostname = ?', bindings: ['alpha.test'] },
          _raw$: 'user_id < 2',
        }),
      ).toHaveLength(1);
    });

    it('supports default queries', async () => {
      const row = await userRepository.create({ name: 'Alice' });
      const custom = new Repository<UserRow>({ database, tableName: '_users' });
      expect(await custom.getem()).toMatchObject([{ ...row }]);
    });

    it('supports custom Knex queries', async () => {
      const row = await userRepository.create({ name: 'Alice' });
      const custom = new QueryRepository({ database, tableName: '_users' });
      expect(await custom.getem()).toMatchObject([{ ...row }]);
    });

    it('supports custom raw queries', async () => {
      const row = await userRepository.create({ name: 'Alice' });
      const custom = new RawRepository({ database, tableName: '_users' });
      expect(await custom.getem()).toMatchObject([{ ...row, code: 5 }]);
    });

    it('reads from the configured view', async () => {
      const row = await userRepository.create({ name: 'Alice' });
      const view = new Repository<UserRow & { code: number }>({ database, tableName: '_users', viewName: '_users2' });
      expect(await view.getem()).toEqual([{ ...row, code: 5 }]);
    });

    it('returns no rows for zero limit', async () => {
      await seed();
      expect(await repository.getem({ limit: 0 })).toEqual([]);
    });

    it('accepts zero offset', async () => {
      await seed();
      expect(await repository.getem({ limit: 1, offset: 0 })).toMatchObject([{ hostname: 'alpha.test' }]);
    });

    it('skips rows using offset', async () => {
      await seed();
      expect(await repository.getem({ limit: 1, offset: 1 })).toMatchObject([{ hostname: 'beta.test' }]);
    });

    describe.each(['limit', 'offset'])('%s', (parameter) => {
      it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid value: %s', async (value) => {
        const input = parameter === 'limit' ? { limit: value } : { offset: value };

        await expect(repository.getem(input)).rejects.toMatchObject({ code: 'INVALID_PAGINATION' });
      });
    });
  });

  describe('count', () => {
    it('applies operators and multiple raw conditions', async () => {
      const [alpha] = await seed();
      expect(
        await repository.count({
          user_id$eq: 1,
          id$in: [alpha.id],
          _raw$hostname: { sql: 'hostname = ?', bindings: ['alpha.test'] },
          _raw$: 'user_id < 2',
        }),
      ).toEqual(1);
    });

    it('supports default queries', async () => {
      await userRepository.create({ name: 'Alice' });

      const custom = new Repository<UserRow>({ database, tableName: '_users' });
      expect(await custom.count()).toEqual(1);
    });

    it('supports custom Knex queries', async () => {
      await userRepository.create({ name: 'Alice' });

      const custom = new QueryRepository({ database, tableName: '_users' });
      expect(await custom.count()).toEqual(1);
    });

    it('supports custom raw queries', async () => {
      await userRepository.create({ name: 'Alice' });

      const custom = new RawRepository({ database, tableName: '_users' });
      expect(await custom.count()).toEqual(1);
    });
  });

  describe('runInTransaction', () => {
    it('should commit changes when transaction succeeds', async () => {
      const name = 'Committed user';

      await userRepository.runInTransaction(async () => {
        await userRepository.create({ name });
      });

      const result = await userRepository.getBy({ name });
      expect(result).toMatchObject({ name });
    });

    it('should rollback changes when transaction fails', async () => {
      const name = 'Rolled back user';

      await expect(
        userRepository.runInTransaction(async () => {
          await userRepository.create({ name });
          throw new Error('ops!');
        }),
      ).rejects.toThrow('ops!');

      const result = await userRepository.findBy({ name });
      expect(result).toEqual(null);
    });

    it('rolls back all new write operations', async () => {
      const [alpha] = await seed();

      await expect(
        repository.runInTransaction(async () => {
          await repository.lockBy({ id: alpha.id });
          await repository.removeBy({ hostname: 'beta.test' });
          await repository.insertIgnore({ hostname: 'new.test', user_id: 1 }, ['hostname']);
          await repository.upsert({ hostname: 'alpha.test', user_id: 9 }, { onConflict: ['hostname'] });
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');

      expect(await repository.count()).toEqual(3);
      expect(await repository.getBy({ id: alpha.id })).toMatchObject({ user_id: 1 });
      expect(await repository.exists({ hostname: 'beta.test' })).toEqual(true);
      expect(await repository.exists({ hostname: 'new.test' })).toEqual(false);
    });
  });

  describe('insertIgnore', () => {
    it('inserts a new row', async () => {
      expect(await repository.insertIgnore({ hostname: 'alpha.test', user_id: 1 }, ['hostname'])).toEqual(true);
    });

    it('ignores duplicates without updating the existing row', async () => {
      await seed();
      expect(await repository.insertIgnore({ hostname: 'alpha.test', user_id: 2 }, ['hostname'])).toEqual(false);
      expect(await repository.getBy({ hostname: 'alpha.test' })).toMatchObject({ user_id: 1 });
    });

    it('rejects empty conflict columns at runtime', async () => {
      // @ts-expect-error Conflict columns must be nonempty.
      await expect(repository.insertIgnore({ hostname: 'alpha.test', user_id: 1 }, [])).rejects.toMatchObject({
        code: 'INVALID_CONFLICT_COLUMNS',
      });

      expect(await repository.count()).toEqual(0);
    });

    it('uses the base table without hydration when a view is configured', async () => {
      const view = new ViewRepository({ database, tableName, viewName });
      expect(await view.insertIgnore({ hostname: 'alpha.test', user_id: 1 }, ['hostname'])).toEqual(true);
    });
  });

  describe('upsert', () => {
    it('rejects empty conflict columns at runtime', async () => {
      // @ts-expect-error Conflict columns must be nonempty.
      await expect(repository.upsert({ hostname: 'alpha.test', user_id: 1 }, { onConflict: [] })).rejects.toMatchObject(
        { code: 'INVALID_CONFLICT_COLUMNS' },
      );

      expect(await repository.count()).toEqual(0);
    });

    it('inserts even if the conflict update condition would not match', async () => {
      const row = await repository.upsert(
        { hostname: 'alpha.test', user_id: 1 },
        { onConflict: ['hostname'], merge: { user_id: 1 }, where: { user_id: 99 } },
      );

      expect(row).toMatchObject({ hostname: 'alpha.test', user_id: 1 });
    });

    it('merges input fields by default while excluding conflict columns', async () => {
      await seed();

      expect(
        await repository.upsert({ hostname: 'alpha.test', user_id: 3 }, { onConflict: ['hostname'] }),
      ).toMatchObject({ hostname: 'alpha.test', user_id: 3, tags: ['active'] });
    });

    it('does not update a conflict when its condition fails', async () => {
      await seed();

      expect(
        await repository.upsert(
          { hostname: 'alpha.test', user_id: 2 },
          { onConflict: ['hostname'], merge: { user_id: 2 }, where: { user_id$eq: 2, _raw$check: 'true' } },
        ),
      ).toBeNull();

      expect(await repository.getBy({ hostname: 'alpha.test' })).toMatchObject({ user_id: 1 });
    });

    it('performs a conditional update in a single INSERT', async () => {
      await seed();

      const queries = await captureQueries(async () => {
        const row = await repository.upsert(
          { hostname: 'alpha.test', user_id: 1 },
          { onConflict: ['hostname'], merge: { tags: ['claimed'] }, where: { user_id: 1 } },
        );

        expect(row).toMatchObject({ user_id: 1, tags: ['claimed'] });
      });

      expect(queries).toHaveLength(1);
      expect(queries[0]).toMatch(/^insert /);
    });

    it('does nothing on conflict when merge is empty', async () => {
      await seed();

      expect(
        await repository.upsert({ hostname: 'alpha.test', user_id: 3 }, { onConflict: ['hostname'], merge: {} }),
      ).toBeNull();

      expect(await repository.getBy({ hostname: 'alpha.test' })).toMatchObject({ user_id: 1 });
    });

    it('validates filters even when merge is empty', async () => {
      await seed();

      await expect(
        repository.upsert(
          { hostname: 'alpha.test', user_id: 3 },
          { onConflict: ['hostname'], merge: {}, where: { user_id: undefined } },
        ),
      ).rejects.toMatchObject({ code: 'INVALID_WHERE' });
    });

    it('inserts when input contains only conflict columns', async () => {
      const ids = new Repository<{ id: number }>({ database, tableName: '_repository_ids' });
      expect(await ids.upsert({ id: 1 }, { onConflict: ['id'] })).toEqual({ id: 1 });
    });

    it('ignores a conflict when input contains only conflict columns', async () => {
      const ids = new Repository<{ id: number }>({ database, tableName: '_repository_ids' });

      await ids.db('_repository_ids').insert({ id: 1 });
      expect(await ids.upsert({ id: 1 }, { onConflict: ['id'] })).toBeNull();
    });

    it('uses the base table without hydration when a view is configured', async () => {
      const view = new ViewRepository({ database, tableName, viewName });

      await seed();

      const row = await view.upsert({ hostname: 'alpha.test', user_id: 2 }, { onConflict: ['hostname'] });
      expect(row).toMatchObject({ user_id: 2 });
      expect(row).not.toHaveProperty('code');
    });
  });

  describe('lockBy', () => {
    it('throws outside a transaction without querying', async () => {
      const queries = await trxContext.exit(async () => {
        const captured = await captureQueries(async () => {
          await expect(repository.lockBy({})).rejects.toMatchObject({ status: 500, code: 'TRANSACTION_REQUIRED' });
        });

        return captured;
      });

      expect(queries).toEqual([]);
    });

    it.each(['commit', 'rollback'] as const)('locks every matching row until %s', async (completion) => {
      const locks = new Repository<{ id: number; user_id: number }>({ database, tableName: '_repository_locks' });
      const transaction = await database.transaction();

      try {
        await trxContext.run(transaction, async () => {
          expect(await locks.lockBy({ user_id: 1 })).toEqual(true);
        });

        for (const id of [1, 2]) {
          await expect(
            database.transaction(async (trx) => {
              await trx('_repository_locks').where({ id }).forUpdate().noWait();
            }),
          ).rejects.toMatchObject({ code: '55P03' });
        }

        await database.transaction(async (trx) => {
          expect(await trx('_repository_locks').where({ user_id: 2 }).forUpdate().noWait()).toHaveLength(1);
        });

        await transaction[completion]();

        await database.transaction(async (trx) => {
          expect(await trx('_repository_locks').where({ user_id: 1 }).forUpdate().noWait()).toHaveLength(2);
        });
      } finally {
        if (!transaction.isCompleted()) await transaction.rollback();
      }
    });

    it('returns false when no rows match', async () => {
      await repository.runInTransaction(async () => {
        expect(await repository.lockBy({ id: -1 })).toEqual(false);
      });
    });

    it('excludes existing rows denied by policing', async () => {
      await seed();

      const restricted = new RestrictedRepository({ database, tableName });

      await restricted.runInTransaction(async () => {
        expect(await restricted.lockBy({ user_id: 2 })).toEqual(false);
      });
    });

    it('applies select policing once', async () => {
      await seed();

      const restricted = new RestrictedRepository({ database, tableName });

      await restricted.runInTransaction(async () => {
        expect(await restricted.lockBy({ hostname$like: 'alpha', _raw$: 'true' })).toEqual(true);
      });

      expect(restricted.actions).toEqual(['select']);
    });

    it('uses the base table without hydration when a view is configured', async () => {
      const view = new ViewRepository({ database, tableName, viewName });

      await seed();

      await view.runInTransaction(async () => {
        expect(await view.lockBy({ user_id: 2 })).toEqual(true);
      });
    });
  });
});
