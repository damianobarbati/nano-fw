# nano-fw

`nano-fw` (nano-sized framework) is a micro-framework powered by Hono, Zod, Knex, Vitest.  
It's pragmatic, ESM-first and TypeScript-first.

It provides:

- type-safe request and response validation
- automatic API docs generation with OpenAPI and Scalar from your Zod schemas
- typed repositories

Requires Node.js >=26.

## Usage

Install the framework and the packages used by your application:

```sh
npm install nano-fw hono zod @hono/node-server
```

Use `"type": "module"` in your application's `package.json`. Set its `name` and `version`; nano-fw uses these values in the API reference.

Create `src/index.ts`:

```ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { AppError, errorHandler, registerDocsRoute, registerErrors, registerRoute } from 'nano-fw/docs';
import { z } from 'zod';

const app = new Hono();
app.onError(errorHandler);

const errors = { NAME_RESERVED: new AppError(422, 'NAME_RESERVED', 'This name is reserved.') };

registerErrors(errors);

registerRoute(app, {
  method: 'post',
  path: '/hello',
  requestSchema: z.object({ name: z.string().min(1) }),
  responseSchema: z.object({ message: z.string() }),
  meta: { section: 'Hello', description: 'Say hello.' },
  handler: ({ name }) => {
    if (name === 'admin') throw errors.NAME_RESERVED;

    const result = { message: `Hello, ${name}!` };
    return result;
  },
});

registerDocsRoute(app, '/', './docs-assets');

serve({ fetch: app.fetch, port: 8080 });
```

Start the application:

```sh
mkdir -p docs-assets
node --watch src/index.ts
```

API docs served at http://localhost:8080/

## Routing

`registerRoute(app, options)` registers a Hono route, validates its input and output with Zod, and adds it to the OpenAPI registry. Register routes before starting the server.

| Option           | Purpose                                                                      |
| ---------------- | ---------------------------------------------------------------------------- |
| `method`         | `get`, `post`, `put`, `patch`, or `delete`.                                  |
| `path`           | Hono route path, such as `/users/:id`.                                       |
| `meta`           | Optional documentation metadata.                                             |
| `requestSchema`  | Parse and validate the parameters passed to the handler.                     |
| `responseSchema` | Parse and validate the handler result before returning JSON.                 |
| `middlewares`    | Optional Hono middleware, executed before request validation.                |
| `handler`        | Receive validated parameters and the Hono context. Return data or a promise. |

Input combines JSON body, query parameters, and path parameters, in that order. Later values replace earlier values with the same key. If middleware sets `auth_params` on the context, that object replaces the collected input.

Query and path values arrive as strings. Use Zod coercion or transformations when your handler needs another type:

```ts
registerRoute(app, {
  method: 'get',
  path: '/items/:id',
  meta: { section: 'Items', description: 'Return the requested item ID.' },
  requestSchema: z.object({
    id: z.coerce
      .number()
      .int()
      .positive()
      .meta({ param: { in: 'path' } }),
  }),
  responseSchema: z.object({ id: z.number() }).meta({ id: 'Item' }),
  handler: ({ id }) => ({ id }),
});
```

For OpenAPI, fields default to query parameters on GET routes and JSON body fields on other methods. Use `.meta({ param: { in: 'path' } })` to document path parameters. Parameter metadata also supports `query`, `header`, and `cookie`. Header and cookie metadata documents those inputs; use middleware to read their runtime values and provide them through `auth_params`.

Use `.meta({ id: 'Item' })` to name a schema in the API reference.

### Errors and response documentation

Define reusable `AppError` constants with an HTTP status, an error code, and a message. Pass them to `registerErrors` as an object whose keys are the documented error codes:

```ts
import { AppError, AppErrorSchema, registerErrors } from 'nano-fw/docs';

const ITEM_NOT_FOUND = new AppError(404, 'ITEM_NOT_FOUND', 'Item not found.');
const EMAIL_EXISTS = new AppError(409, 'EMAIL_EXISTS', 'Email already exists.');

registerErrors({ ITEM_NOT_FOUND, EMAIL_EXISTS });
```

Keep each catalog key equal to the corresponding `AppError` code. Register the catalog once, before `registerDocsRoute`. The API reference gets an `Errors` section with each code, HTTP status, and message, in registration order.

Throw a registered constant from a handler or service, such as `throw ITEM_NOT_FOUND`. With `app.onError(errorHandler)`, the response uses status `404` and a JSON body containing `code: 'ITEM_NOT_FOUND'` and `message: 'Item not found.'`. An optional fourth `AppError` argument supplies a `payload` field. Invalid request data returns `400`; invalid handler output returns `500`.

`registerErrors` controls the catalog documentation. Runtime errors do not need registration to be handled, and catalog registration does not add error responses to every operation. Document each operation's expected errors with `meta.responses`, as described below.

Route metadata controls operation documentation:

| Metadata              | Purpose                                                                               |
| --------------------- | ------------------------------------------------------------------------------------- |
| `section`             | Group operations under a tag.                                                         |
| `description`         | Describe the operation.                                                               |
| `responseDescription` | Describe the default `200` response.                                                  |
| `responses`           | Add response descriptions and schemas by HTTP status.                                 |
| `visibility`          | Add a `public` or `private` tag. This does not enforce authentication or hide routes. |

For example, add `responses: { 404: { description: 'Item not found.', schema: AppErrorSchema } }` to a route's `meta`. This documents the response; runtime status codes still come from the handler or error handler.

## API docs

Register the docs after all routes and error catalogs, before `serve`:

```ts
import { registerDocsRoute } from 'nano-fw/docs';

registerDocsRoute(app, '/', './docs-assets');
```

This serves the Scalar reference at `/` and the OpenAPI document at `/openapi.json`. Markdown files in `docs-assets` form the API introduction in filename order. Use names such as `01-intro.md` and `02-authentication.md` to control that order. Static assets are served at root paths, such as `/logo.svg`.

The specification is generated when docs are registered. Routes registered later are not included.

### Scalar options

Pass a fourth argument to configure branding, tag order, and Scalar:

```ts
registerDocsRoute(app, '/', './docs-assets', {
  logoUrl: '/logo.svg',
  faviconUrl: '/favicon.svg',
  tagOrder: ['Hello', 'Items'],
  scalarOptions: {
    theme: 'moon',
    forceDarkModeState: 'dark',
    hideDarkModeToggle: false,
    customCss: ':root { --scalar-font: Inter, sans-serif; }',
  },
});
```

Add `logo.svg` and `favicon.svg` to `docs-assets` for this example.

| Option                     | Behavior                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------ |
| `logoUrl`                  | Sidebar logo URL. Defaults to `/logo.png`.                                           |
| `faviconUrl`               | Favicon URL. Defaults to `logoUrl`, then `/logo.png`.                                |
| `tagOrder`                 | Tags to display first. Remaining tags sort alphabetically; `Errors` stays last.      |
| `scalarOptions`            | JSON-compatible Scalar configuration. Explicit settings override framework defaults. |
| `transformOpenapiDocument` | Transform the specification for each request.                                        |

`scalarOptions` follows the exported `ScalarOptions` type. Browser callbacks are not supported; functions, including nested functions, are rejected. Nested option objects replace the corresponding defaults. Explicit options such as `url`, `favicon`, and `customCss` override the generated settings.

### Customize OpenAPI

Use `transformOpenapiDocument` to change the document returned by `/openapi.json`. The callback receives the generated document and the native request, and can return a document or a promise:

```ts
registerDocsRoute(app, '/', './docs-assets', {
  transformOpenapiDocument: ({ document, request }) => {
    const url = new URL(request.url);
    const customizedDocument = {
      ...document,
      info: { ...document.info, title: 'My application API' },
      servers: [{ url: url.origin }],
    };

    return customizedDocument;
  },
});
```

You can also replace `paths`, add security schemes under `components`, or change operation metadata. Return a new document instead of mutating the shared generated document. Changing the specification does not change runtime routes or access control.

## Repository

`Repository` provides typed PostgreSQL operations through Knex. Create your tables and constraints before using it.

Install `knex` if your application imports its types or uses its migration CLI:

```sh
npm install knex
```

Configure a database and repository:

```ts
import getConfig from 'nano-fw/database/getConfig.ts';
import getDatabase from 'nano-fw/database/getDatabase.ts';
import Repository from 'nano-fw/database/Repository.ts';

type UserRow = { id: number; name: string; email: string };
type UserRowInsert = Pick<UserRow, 'name' | 'email'>;
type UserRowUpdate = Partial<UserRowInsert>;

const config = getConfig('postgres://user:password@localhost:5432/app');
const database = getDatabase(config);
const UserRepository = new Repository<UserRow, UserRow, UserRowInsert, UserRowUpdate>({ database, tableName: 'users' });

const createdUser = await UserRepository.create({ name: 'John', email: 'john@example.com' });
const foundUser = await UserRepository.get(createdUser.id);
const updatedUser = await UserRepository.update(createdUser.id, { name: 'Jane' });
```

This example expects a `users` table with a generated numeric `id`, required `name` and `email` columns, and a unique constraint on `email`. Replace the connection URL with your database configuration. Call `database.destroy()` when the application shuts down.

The type parameters are `Repository<Row, Resource, Insert, Update>`. `Resource` defaults to `Row`. Default insert fields are optional and exclude `id`, `created_at`, and `updated_at`; provide explicit insert and update types to require application fields.

Configuration accepts `viewName` as the read source and `uniqueSortColumn` for default sorting, which otherwise uses `id`. Writes target `tableName`.

### Methods

| Method                            | Result                                                              |
| --------------------------------- | ------------------------------------------------------------------- |
| `get(id)`                         | Resource by ID; throws `404` if absent.                             |
| `getBy(where)`                    | First match; throws `404` if absent.                                |
| `findBy(where)`                   | First match or `null`.                                              |
| `exists(where)`                   | Whether a matching row exists.                                      |
| `getem(params?)`                  | Resources with filters, sorting, and pagination.                    |
| `count(params?)`                  | Match count without sorting or pagination.                          |
| `create(input)`                   | Created resource, or an array when input is an array.               |
| `createRaw(input)`                | Inserted table rows without hydration or view lookup.               |
| `update(id, input)`               | Updated resource; throws `404` if absent.                           |
| `updateBy(input, where)`          | Updated resources.                                                  |
| `remove(id)` / `removeBy(where)`  | Whether rows were deleted.                                          |
| `insertIgnore(input, onConflict)` | Whether a row was inserted; ignores conflicts.                      |
| `upsert(input, options)`          | Inserted or updated raw row, or `null` when no row changes.         |
| `lockBy(where)`                   | Lock matching rows inside a transaction; return whether rows match. |
| `runInTransaction(fn)`            | Commit on success and roll back on error.                           |

`upsert` accepts `onConflict`, optional `merge`, and optional `where` filters for the update. Conflict columns must have a matching unique constraint. Empty filters match all rows, including for `updateBy` and `removeBy`.

### Filters and pagination

```ts
const matches = await UserRepository.getem({
  email$ilike: '@example.com',
  id$gt: 0,
  sort: [
    ['name', 'asc'],
    ['id', 'asc'],
  ],
  limit: 20,
  offset: 0,
});
```

Plain keys mean equality. Filters combine with `AND`.

| Operator                 | Meaning                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------- |
| `eq`, `neq`              | Equal or not equal; supports `null`.                                                           |
| `gt`, `gte`, `lt`, `lte` | Comparisons.                                                                                   |
| `in`, `nin`              | Included in or excluded from an array of values.                                               |
| `like`, `ilike`          | Contains text, with case-sensitive or case-insensitive matching.                               |
| `has`                    | PostgreSQL array column contains a value.                                                      |
| `_raw$label`             | Raw condition as SQL text or `{ sql, bindings }`. Use distinct labels for multiple conditions. |

Omit `limit` to return all matches. `limit` and `offset` must be nonnegative safe integers. Do not include filter keys whose value is `undefined`.

### Hydrate rows

Override `hydrate(rows)` to enrich database rows with related data, add computed fields, remove fields, or transform values before returning resources. The default implementation returns the rows unchanged.

The first repository type parameter describes database rows. The second describes the resources returned after hydration. `hydrate` always receives an array, including when `get` returns one resource. Return one resource for each input row, in the same order.

For example, extend each user with roles from a `user_roles` table and an email domain, and normalize the email value. Replace the earlier repository instance with this implementation:

```ts
type UserRoleRow = { user_id: number; role: string };
type User = UserRow & { roles: string[]; emailDomain: string };

class UsersRepository extends Repository<UserRow, User, UserRowInsert, UserRowUpdate> {
  async hydrate(rows: UserRow[]): Promise<User[]> {
    const userIds = rows.map(({ id }) => id);
    const roleRows = await this.db<UserRoleRow>('user_roles').select('user_id', 'role').whereIn('user_id', userIds);
    const rolesByUserId = new Map<number, string[]>();

    for (const { user_id, role } of roleRows) {
      const roles = rolesByUserId.get(user_id) ?? [];
      roles.push(role);
      rolesByUserId.set(user_id, roles);
    }

    const users = rows.map((row) => {
      const email = row.email.trim().toLowerCase();
      const user = {
        ...row,
        email,
        emailDomain: email.slice(email.lastIndexOf('@') + 1),
        roles: rolesByUserId.get(row.id) ?? [],
      };

      return user;
    });

    return users;
  }
}

const UserRepository = new UsersRepository({ database, tableName: 'users' });
```

This example expects `user_roles` columns named `user_id` and `role`. It loads roles for the complete batch in one query. Use `this.db` so these queries share the active repository transaction. Do not call `this.get` or `this.getem` inside `hydrate`: those methods invoke hydration again.

Hydration changes returned data; it does not persist the transformed values or added fields to the database. Filters, sorting, and pagination operate on database columns before hydration.

```ts
const hydratedUser = await UserRepository.get(createdUser.id);
const roles = hydratedUser.roles;
const emailDomain = hydratedUser.emailDomain;

const rawUser = await UserRepository.get(createdUser.id, true);
```

`hydratedUser` has type `User`; `rawUser` has type `UserRow` and bypasses `hydrate`. With `viewName`, the plain result still comes from the configured view.

### Transactions and custom repositories

```ts
await UserRepository.runInTransaction(async () => {
  const user = await UserRepository.create({ name: 'Alice', email: 'alice@example.com' });
  await UserRepository.update(user.id, { name: 'Alice Smith' });
});
```

Repository calls in the callback share the transaction automatically through async context, including calls to other repositories. Use `lockBy` inside this callback when row locks are required.

Extend `Repository<Row, Resource, Insert, Update>` when you need custom datasource operations or resource transformations:

| Member                                                         | Purpose                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `db`                                                           | Current transaction or configured Knex client. Use it for custom queries. |
| `tableOrView`                                                  | Configured read table or view.                                            |
| `hydrate(rows)`                                                | Transform rows into resources.                                            |
| `police(query, action)`                                        | Restrict reads, updates, and deletes.                                     |
| `getemQuery(params)`                                           | Customize the query used by `getem` and `count`.                          |
| `Repository.applyWhereWithOperators(query, where, tableName?)` | Apply repository filters to a Knex query.                                 |

`get`, `getBy`, `findBy`, `getem`, `create`, and `updateBy` accept `true` as their final argument to skip hydration. `createRaw`, `upsert`, and `insertIgnore` also bypass hydration.
