# fwxs example

This example folder showcases how to use the **fwxs** utilities in your project.

Steps are:
1. Create the `./database` folder: define the db and the initial schema.
2. Create the `./src` folder.
3. Create the zod schemas.
4. Create the repository.
5. Create the routes.
6. Run the database, run the migrations, start the server.

You should end up in a structure like this:
```text
example/
├── database/
│   ├── db.ts               # db config
│   ├── schema.sql          # initial db schema
│   └── migrations/         # knex migrations
│       └── 20260101000000_schema.ts 
├── docs-assets/            # md files to add to api docs
│   ├── 01-intro.md         
│   ├── 02-about-markdown.md
│   └── openapi.yml         # auto-generated openapi v3 specification
├── src/
│   ├── index.ts            # bootstrap hono server
│   └── schemas.ts          # define zod schemas
│   ├── repositories.ts     # define repositories
│   ├── services.ts         # define services
│   ├── routes.ts           # define hono routes
└── README.md
```

Start db:
```sh
docker run --name fwxs-pg --restart unless-stopped -p 5432:5432 -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=fwxs -d postgres:18-alpine
```

Run migrations:
```
pnpm knex migrate:latest --knexfile=./example/database/db.ts
```

Start the server:
```sh
pnpm example
```

Server ready at: http://localhost:3000/users.  
API documentation ready at: http://localhost:3000/docs.

Try the API yourself:
```sh
curl -X POST -H "Content-Type: application/json" -d '{"name": "John Doe", "email": "john@example.com"}' http://localhost:3000/users
curl http://localhost:3000/users
curl http://localhost:3000/users/1
```
