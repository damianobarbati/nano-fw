# nano-fw example

This example folder showcases how to use the **nano-fw** utilities in your project.

Steps are:

1. Create the `./database` folder: add the database configuration and the initial db schema and db migration.
2. Create the `./src` folder: add the schemas, the repositories and the service.
3. Create the routes.
4. Create the `index.ts` file.
5. Run the database, run the migrations, start the server.

You should end up in a structure like this:

```text
packages/demo/
├── database/
│   ├── db.ts
│   ├── schema.sql
│   ├── views.sql
│   ├── migrations/
│   │   └── 20260101000000_schema.ts
│   └── seeds/
│       └── 1-users.ts
├── docs-assets/
│   ├── 01-intro.md
│   ├── 02-about-markdown.md
│   ├── logo.svg
│   └── mark.svg
├── src/
│   ├── errors.ts
│   ├── index.ts
│   ├── repositories.ts
│   ├── routes.ts
│   ├── schemas.ts
│   └── services.ts
├── package.json
└── README.md
```

Run the following commands from the repository root.

Start the database if it is not already running:

```sh
docker run -q --name nano-fw --restart unless-stopped -p 5432:5432 -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=nano-fw -d postgres:19-alpine
```

Run migrations:

```sh
pnpm run build
pnpm -F demo run db:migrate
```

From a consumer package, pass the module that exports the named Knex instance `database`.

```sh
pnpm nano-fw migrate ./database/db.ts
pnpm nano-fw seed ./database/db.ts
```

The commands read TypeScript files in filename order from `migrations/` or `seeds/` beside the database module. Each file exports exactly one function. Named and default exports both work. The runner passes the transaction to each migration. Each run applies all pending files in one transaction and records them in `knex_migrations`. A PostgreSQL advisory lock makes concurrent runs on the same schema wait for their turn. Finish any runs from the Knex CLI or older nano-fw versions before switching all deployments to this runner.

Each seed receives the database instance. Every seed runs on each invocation. A seed error stops the run and earlier seeds can remain committed.

Start the library compiler watcher in one terminal:

```sh
pnpm -F nano-fw run dev
```

Start the server in another terminal:

```sh
pnpm -F demo run dev
```

Library TypeScript changes compile automatically and restart the server. Changes to the library HTML require `pnpm run build`.

API server and docs at: http://localhost:8080

Try the API yourself:

```sh
curl -X POST -H "Content-Type: application/json" -d '{"name": "John Doe", "email": "john@example.com", "password": "example-password"}' http://localhost:8080/user
curl -X POST -H "Content-Type: application/json" -d '{}' http://localhost:8080/user/list
curl http://localhost:8080/user/1
```

Replace `1` with the ID returned by the create request.

## User rows and responses

`UserRowSchema` includes `password_hash`, stored as a SHA-256 hex string using Node's `crypto.createHash` in `UserService.create`. The creation request accepts `password`; the service passes only `name`, `email`, and the computed `password_hash` to the repository.

`UserSchema = UserRowSchema.omit({ password_hash: true })` defines the public response. `runFnSchemed` parses the response before serialization, so create, get, and list endpoints exclude the hash.

The updated SQL schema assumes a fresh example database. Existing databases need a separate migration before running this version.

## API documentation 

API docs are auto-generated using the zod schemas provided for request and response to the `route` fn.  
You can group endpoints under tags using `RouteMeta.section`.  
You sort tags passing an optional `tagOrder` param; groups not included in the `tagOrder` stay in alphabetical order.

```ts
route(router, {
  method: 'post',
  path: '/user/list',
  requestSchema: UserListRequestSchema,
  responseSchema: UserListSchema,
  meta: { section: 'Users', description: 'List users.' },
  handler: (params) => UserService.list(params),
});

app.route('/', router);
routeDocs(app, '/', { docsAssets, tagOrder: ['Users', 'Private'] });
```

You can use a custom logo displayed in the top-left section providing the `logoUrl` param:

```ts
routeDocs(app, '/', { docsAssets, logoUrl: '/mark.svg', tagOrder: ['Users', 'Private'] });
```

Pass JSON-compatible Scalar settings through `scalarOptions`:

```ts
routeDocs(app, '/', {
  docsAssets,
  logoUrl: '/mark.svg',
  faviconUrl: '/logo.svg',
  scalarOptions: {
    theme: 'moon',
    forceDarkModeState: 'dark',
    hideDarkModeToggle: false,
    customCss: ':root { --scalar-font: Inter, sans-serif; }',
  },
});
```

Explicit Scalar settings override framework defaults, including `favicon`, `url`, sorting, and `customCss`. Nested settings replace the corresponding default object. Omit `scalarOptions` to keep existing behavior. Browser callbacks are excluded from the configuration type and rejected at registration, including nested functions. Supported settings depend on the bundled Scalar browser version.
