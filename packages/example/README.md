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
packages/example/
├── database/
│   ├── db.ts         # db config
│   ├── schema.sql      # initial db schema
│   └── migrations/     # knex migrations
│     └── 20260101000000_schema.ts 
├── docs-assets/      # md files to add to api docs
│   ├── 01-intro.md     
│   └── 02-about-markdown.md
├── src/
│   ├── index.ts      # bootstrap hono server
│   └── schemas.ts      # define zod schemas
│   ├── repositories.ts   # define repositories
│   ├── services.ts     # define services
│   ├── routes.ts       # define hono routes
└── README.md
```

Run the following commands from the repository root.

Start db:

```sh
docker run --name nano-fw-pg --restart unless-stopped -p 5432:5432 -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=nano-fw -d postgres:18-alpine
```

Run migrations:

```
npm run build
npm run migrate --workspace=example
```

Start the library compiler watcher in one terminal:

```sh
npm run dev --workspace=nano-fw
```

Start the server in another terminal:

```sh
npm run dev --workspace=example
```

Library TypeScript changes compile automatically and restart the server. Changes to the library HTML or migration stub require `npm run build`.

API server and docs at: http://localhost:8080

Try the API yourself:

```sh
curl -X POST -H "Content-Type: application/json" -d '{"name": "John Doe", "email": "john@example.com", "password": "example-password"}' http://localhost:8080/users
curl http://localhost:8080/users
curl http://localhost:8080/users/1
```

## User rows and responses

`UserRowSchema` includes `password_hash`, stored as a SHA-256 hex string using Node's `crypto.createHash` in `UserService.create`. The creation request accepts `password`; the service passes only `name`, `email`, and the computed `password_hash` to the repository.

`UserSchema = UserRowSchema.omit({ password_hash: true })` defines the public response. `runFnSchemed` parses the response before serialization, so create, get, and list endpoints exclude the hash.

The updated SQL schema assumes a fresh example database. Existing databases need a separate migration before running this version.

## API documentation 

API docs are auto-generated using the zod schemas provided for request and response to the `registerRoute` fn.  
You can group endpoints under tags using `RouteMeta.section`.  
You sort tags passing an optional `tagOrder` param; groups not included in the `tagOrder` stay in alphabetical order.

```ts
registerDocsRoute(app, '/docs', docsAssets, { tagOrder: ['Users', 'Payments'] });

registerRoute(router, {
  method: 'get',
  path: '/users',
  requestSchema: UserListRequestSchema,
  responseSchema: UserListSchema,
  meta: { section: 'Users', description: 'List users.' },
  handler: (params) => userRepository.getem(params),
});
```

You can use a custom logo displayed in the top-left section providing the `logoUrl` param:

```ts
registerDocsRoute(app, '/docs', docsAssets, { logoUrl: 'https://xyz.com/logo.svg', tagOrder: ['Users', 'Payments'] });
```

Pass JSON-compatible Scalar settings through `scalarOptions`:

```ts
registerDocsRoute(app, '/docs', docsAssets, {
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
