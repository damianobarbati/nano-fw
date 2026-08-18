# fwxs example

The example showcases how to use the **fwxs** utilities:
- **Database & Repository**: PostgreSQL connection (via Knex) and `UserRepository` implementation extending `Repository`.
- **Zod & OpenAPI**: Schema definitions enriched with OpenAPI metadata (`.openapi(...)`).
- **Hono Routing & Middleware**: Automatic I/O validation and endpoint registration on OpenAPI via `documentEndpoint` and `runSchemedFn`.
- **Error Handling**: Standard error classes (`AppError`, `NotFoundError`, etc.), automatic 400/500 formatting via `errorHandler`, and OpenAPI error schema documentation.
- **Scalar Documentation**: Automatic generation of `openapi.yml` and interactive Scalar interface served at `/docs`.

## Directory Structure

```text
example/
├── database/
│   ├── db.ts               # Knex database configuration & connection
│   ├── schema.sql          # Raw SQL schema definition
│   └── migrations/
│       └── 20260101000000_schema.ts # Knex migration executing schema.sql
├── docs/
│   ├── 01-intro.md         # Markdown intro included in API documentation
│   ├── 02-about-markdown.md
│   └── openapi.yml         # Generated OpenAPI 3.0 specification
├── src/
│   ├── index.ts            # Hono server bootstrap, error handler & docs route
│   ├── migrate.ts          # Migration runner script
│   ├── repositories.ts     # Repository definition
│   ├── routes.ts           # Documented Hono API routes
│   └── schemas.ts          # Zod schemas
└── README.md
```

## Running the example

```sh
# start db 
docker run --name fwxs-pg --restart unless-stopped -p 5432:5432 -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=fwxs -d postgres:18-alpine

# run migrations
pnpm knex migrate:latest --knexfile=./example/database/db.ts

# start the app:
pnpm example
```

Use the API:
```sh
curl -X POST -H "Content-Type: application/json" -d '{"name": "John Doe", "email": "john@example.com"}' http://localhost:3000/users
curl http://localhost:3000/users
curl http://localhost:3000/users/1
```

Server at: http://localhost:3000/users.
API Documentation at: http://localhost:3000/docs.
