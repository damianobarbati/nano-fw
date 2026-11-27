# nano-fw

Validate Hono routes with Zod, generate API documentation, and query PostgreSQL.

## Routing

In a new Node.js 26 or later project, run:

```sh
pnpm init --init-type module
pnpm add nano-fw hono zod @hono/node-server
```

Save this as `server.ts` and run `node server.ts`.

```ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { route, routeDocs } from 'nano-fw';
import { z } from 'zod';

const app = new Hono();

route(app, {
  method: 'get',
  path: '/hello',
  requestSchema: z.object({ name: z.string().min(1) }),
  responseSchema: z.object({ message: z.string() }),
  handler: ({ name }) => ({ message: `Hello, ${name}!` }),
});

routeDocs(app, '/docs');
serve({ fetch: app.fetch, port: 8080 });
```

Open `http://localhost:8080/hello?name=Ada` to see `{"message":"Hello, Ada!"}`. Open `/docs` for the generated API documentation.

## Error handling

In the same file, import `ApplicationError` and `errorHandler` from `nano-fw`. Add `app.onError(errorHandler)` after creating the app. Replace the route's handler with:

```ts
handler: ({ name }) => {
  if (name === 'admin') throw new ApplicationError(409, 'NAME_RESERVED', 'This name is reserved.');
  return { message: `Hello, ${name}!` };
},
```

Restart the server. Request `/hello?name=` for HTTP 400 with code `VALIDATION_ERROR` and the invalid field in `payload.issues`. Request `/hello?name=admin` for HTTP 409 with `{"code":"NAME_RESERVED","message":"This name is reserved."}`.

## Database

Use a PostgreSQL database with a `users` table, a numeric `id`, an `email` column, and a user with ID 1. Replace the connection string with yours.

```ts
import { createDatabase, Repository } from 'nano-fw/data';

type UserRow = { id: number; email: string };
const database = createDatabase({ connectionString: 'postgres://user:password@localhost:5432/nano-fw' });
const UserRepository = new Repository<UserRow>({ database, tableName: 'users' });

const user = await UserRepository.get(1);
console.log(user.email);
await database.destroy();
```

## Public imports

| Path           | Values                                                                                                        | Types                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `nano-fw`      | route, errorHandler, ApplicationError                                                                         | HTTPMethod, RouteOptions, RouteMeta, ValidationErrorPayload                          |
| `nano-fw`      | routeDocs, registerSchema, ApplicationErrorSchema, ValidationErrorSchema                                      | RouteDocsOptions, ScalarOptions, ErrorCatalog                                        |
| `nano-fw/data` | createDatabase, runMigrations, runInTransaction, Repository, getConfig (deprecated), getDatabase (deprecated) | CreateDatabaseOptions, ID, RawCondition, RepositoryWhere, GetemParams, UpsertOptions |

Pass `errorSchema` alongside `errors` to document a custom error payload.

## Route reference

`route(app, options)` registers a Hono route, validates its input and output with Zod, and adds it to the OpenAPI registry. Register routes before starting the server.

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

```ts
import { route } from 'nano-fw';
import { z } from 'zod';

const ItemParams = z.object({ id: z.coerce.number().int().positive() });

route(app, {
  method: 'patch',
  path: '/items/:id',
  requestSchema: ItemParams.extend({ name: z.string().min(1) }),
  responseSchema: z.object({ id: z.number(), name: z.string() }),
  handler: ({ id, name }) => ({ id, name }),
});
```

Fields matching a named path segment become required OpenAPI path parameters. Other fields default to query on GET and body on other methods. Explicit metadata overrides this choice. For example, `.meta({ param: { in: 'header', name: 'X-Token' } })` reads the named header.

Use `.meta({ id: 'Item' })` to name a schema in the API reference.

### Errors and response documentation

Define reusable `ApplicationError` constants with an HTTP status, an error code, and a message. Pass them to the `errors` option of `routeDocs` as an object whose keys are the documented error codes:

```ts
import { ApplicationError, routeDocs } from 'nano-fw';

const ITEM_NOT_FOUND = new ApplicationError(404, 'ITEM_NOT_FOUND', 'Item not found.');
const EMAIL_EXISTS = new ApplicationError(409, 'EMAIL_EXISTS', 'Email already exists.');

routeDocs(app, '/docs', { errors: { ITEM_NOT_FOUND, EMAIL_EXISTS } });
```

Keep each catalog key equal to the corresponding `ApplicationError` code. The API reference gets an `Errors` section with each code, HTTP status, and message, in registration order.

Throw an error constant from a handler or service, such as `throw ITEM_NOT_FOUND`. With `app.onError(errorHandler)`, the response uses status `404` and a JSON body containing `code: 'ITEM_NOT_FOUND'` and `message: 'Item not found.'`. An optional fourth `ApplicationError` argument supplies a `payload` field. Requests that fail schema validation return `400`. Invalid handler output returns `500`.

For authentication and account routes, choose the `ApplicationError` status based on the reason the operation failed. Clients should branch on the status and stable `code` field. Return the same credential error for an unknown account and an incorrect password.

| Status | Use                                                                                        |
| ------ | ------------------------------------------------------------------------------------------ |
| `401`  | Missing or invalid authentication, including an invalid second factor at login.            |
| `403`  | An authenticated caller lacks permission.                                                  |
| `409`  | A conflict with current state, such as an email address already in use.                    |
| `422`  | Schema-valid input violates a domain constraint, such as a password confirmation mismatch. |

The `errors` option controls the catalog documentation. Runtime errors do not need registration to be handled, and catalog registration does not add error responses to every operation. Document each operation's expected errors with `meta.responses`, as described below.

Route metadata controls operation documentation:

| Metadata              | Purpose                                                                               |
| --------------------- | ------------------------------------------------------------------------------------- |
| `section`             | Group operations under a tag.                                                         |
| `description`         | Describe the operation.                                                               |
| `responseDescription` | Describe the default `200` response.                                                  |
| `responses`           | Add response descriptions and schemas by HTTP status.                                 |
| `visibility`          | Add a `public` or `private` tag. This does not enforce authentication or hide routes. |

For example, add `responses: { 404: { description: 'Item not found.', schema: ApplicationErrorSchema } }` to a route's `meta`. This documents the response; runtime status codes still come from the handler or error handler.

## API docs

Register the docs after all routes and error catalogs, before `serve`:

```ts
import { routeDocs } from 'nano-fw';

routeDocs(app, '/');
```

This serves the Scalar reference at `/` and the OpenAPI document at `/openapi.json`. Set the optional `docsAssets` directory to include local files. Markdown files in `docs-assets` form the API introduction in filename order. Use names such as `01-intro.md` and `02-authentication.md` to control that order. Static assets are served at root paths, such as `/logo.svg`.

The specification is generated when docs are registered. Routes registered later are not included.

### Scalar options

Pass a fourth argument to configure branding, tag order, and Scalar:

```ts
routeDocs(app, '/', {
  docsAssets: './docs-assets',
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
routeDocs(app, '/', {
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
pnpm add knex
```

Configure a database and repository:

```ts
import { createDatabase, Repository } from 'nano-fw/data';

type UserRow = { id: number; name: string; email: string };
type UserRowInsert = Pick<UserRow, 'name' | 'email'>;
type UserRowUpdate = Partial<UserRowInsert>;

const database = createDatabase({ connectionString: 'postgres://user:password@localhost:5432/app' });
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

class UsersRepository extends Repository<User, UserRow, UserRowInsert, UserRowUpdate> {
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

Import `runInTransaction({ database, fn })` from `nano-fw/data`. Use the same Knex database instance for both repositories and for nested calls.

```ts
import { runInTransaction } from 'nano-fw/data';

const userId = await runInTransaction({
  database,
  fn: async () => {
    const user = await UserRepository.create({ name: 'Alice', email: 'alice@example.com' });
    await ProfileRepository.create({ user_id: user.id });
    return user.id;
  },
});
```

The helper passes the Knex transaction to `fn`. Repository calls in `fn` join the transaction automatically. The helper commits and returns the callback result on success. If the callback throws or rejects, the helper rolls back and propagates the error. A nested call uses a savepoint. Use `lockBy` inside the callback when row locks are required.

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

## Compiled applications

Pass the application's package name to `createDatabase({ connectionString, packageName })` and its name and version to `routeDocs(app, '/docs', { packageMetadata: { name, version } })`. Both functions discover package metadata from the working directory when these options are omitted.

Import `runMigrations` from `nano-fw/data` and call `await runMigrations({ database, migrations })`. Supply an object keyed by complete migration filenames, with each value set to its imported migration function. The runner sorts names, runs pending migrations in a transaction, and records them in the same history table used by the CLI.
