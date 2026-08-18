# fwxs

XS sized framework:
- core libraries are Hono, Knex, Zod
- utility to validate request and responses and auto-generate OpenAPI spec
- utility to perform queries

## Requirements

Dependencies:
- `fnm` (eg: `brew install fnm`)
- add `eval "$(fnm env --use-on-cd)"` into your `~/.zprofile` or `~/.profile`

## Development

Setup:
```sh
fnm install
npm install -g corepack
corepack enable
corepack install
pnpm install
export $(grep -v '^#' .env | xargs)
pnpm env:down
pnpm env:up
```

Linting:
```sh
pnpm lint # lint
pnpm tsc # typecheck
```

Testing:
```sh
docker run -d --name fwxs -p 5432:5432 -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=fwxs postgres:18-alpine
pnpm test
```

## Usage

Install:
```sh
pnpm i fwxs
```

Add the suggested scripts to your `package.json`:
```sh
"scripts": {
  "test": "vitest run --reporter=default --reporter=junit --outputFile=/tmp/junit.xml --coverage",
  "start:dev": "NODE_ENV=development NODE_OPTIONS='--no-warnings --enable-source-maps --import=amaro/transform' node --env-file-if-exists=../../.env --watch ./src/index.ts",
  "start": "NODE_ENV=production NODE_OPTIONS='--no-warnings --enable-source-maps --import=amaro/transform' node ./src/index.ts",
  "db:migrate": "NODE_ENV=development NODE_OPTIONS='--no-warnings --enable-source-maps --import=amaro/transform' knex migrate:latest --knexfile=./database/db.ts",
  "db:seed": "NODE_ENV=development NODE_OPTIONS='--no-warnings --enable-source-maps --import=amaro/transform' knex seed:run --knexfile=./database/db.ts",
  "db:migrate:make": "NODE_ENV=development NODE_OPTIONS='--no-warnings --enable-source-maps --import=amaro/transform' knex migrate:make --knexfile=./database/db.ts",
  "db:seed:make": "NODE_ENV=development NODE_OPTIONS='--no-warnings --enable-source-maps --import=amaro/transform' knex seed:make --knexfile=./database/db.ts"
}
```

Now check the example directory.
