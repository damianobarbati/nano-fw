# Repository

Typed PostgreSQL operations through Knex. Table must exist and have an `id` column.

```ts
import getConfig from 'nano-fw/database/getConfig';
import getDatabase from 'nano-fw/database/getDatabase';
import Repository from 'nano-fw/database/Repository';

type User = { id: string; name: string; email: string };

const config = getConfig(process.env.DATABASE_URL!);
const database = getDatabase(config);
const users = new Repository<User>({ database, tableName: 'users' });

const user = await users.create({ name: 'John', email: 'john@example.com' });
const found = await users.get(user.id);
const updated = await users.update(user.id, { name: 'Jane' });
const removed = await users.remove(user.id);
```

Set `DATABASE_URL` to the PostgreSQL connection URL. Optional configuration: `viewName` for reads, `uniqueSortColumn` for default sorting (default: `id`).

## Methods

| Method                            | Result                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `get(id)`                         | Resource by ID; throws `404` if absent.                                          |
| `getBy(where)`                    | First match; throws `404` if absent.                                             |
| `findBy(where)`                   | First match or `null`.                                                           |
| `exists(where)`                   | Whether a match exists.                                                          |
| `getem(params?)`                  | Resources with filters, sorting and pagination.                                  |
| `count(params?)`                  | Match count, without pagination.                                                 |
| `create(input)`                   | Created resource; also accepts arrays.                                           |
| `createRaw(input)`                | Inserted rows without hydration or view lookup.                                  |
| `update(id, input)`               | Updated resource; throws `404` if absent.                                        |
| `updateBy(input, where)`          | Updated resources.                                                               |
| `remove(id)` / `removeBy(where)`  | Whether rows were deleted.                                                       |
| `insertIgnore(input, onConflict)` | Whether inserted; ignores conflicts.                                             |
| `upsert(input, options)`          | Inserted or updated raw row, or `null`. Options: `onConflict`, `merge`, `where`. |
| `lockBy(where)`                   | Lock matches inside a transaction; return whether rows match.                    |
| `runInTransaction(fn)`            | Commit on success, roll back on error.                                           |

Empty filters match all rows, including for updates and deletes. Conflict columns require a unique constraint.

## Filters

```ts
const matches = await users.getem({ email$ilike: '@example.com', sort: [['name', 'asc']], limit: 20, offset: 0 });
```

Plain keys mean equality. Operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`, `like`, `ilike`, `has`. Filters combine with `AND`. Omit `limit` to return all matches.

## Transactions

```ts
await users.runInTransaction(async () => {
  const user = await users.create({ name: 'John', email: 'john@example.com' });
  await users.update(user.id, { name: 'Jane' });
});
```

Repository calls inside the callback share the transaction automatically.

## Custom repositories

Extend `Repository<Row, Resource, Insert, Update>` for custom queries or resource transformations.

| Member                                                         | Purpose                                                                             |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `db`                                                           | Current transaction or configured Knex client. Use for custom queries.              |
| `tableOrView`                                                  | Configured read table or view.                                                      |
| `hydrate(rows)`                                                | Transform rows into resources. Supported methods accept `plain: true` to skip this. |
| `police(query, action)`                                        | Restrict reads, updates and deletes.                                                |
| `getemQuery(params)`                                           | Customize query used by `getem` and `count`.                                        |
| `Repository.applyWhereWithOperators(query, where, tableName?)` | Apply repository filters to a Knex query.                                           |
