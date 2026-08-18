# nanofw

`nanofw` (xs-sized framework) is a minimal, schema-driven TypeScript micro-framework powered by Hono, Zod, Knex, and OpenAPI.  
It's small, pragmatic, ESM-first and TypeScript-first.  
It provides type-safe request and response validation, automatic OpenAPI generation with Scalar docs, and transparent transactional repositories via AsyncLocalStorage.

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
```

Linting:
```sh
pnpm lint # lint
pnpm tsc # typecheck
```

Testing:
```sh
docker run -d --name nanofw -p 5432:5432 -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=nanofw postgres:18-alpine
pnpm test
```

## Usage

Install:
```sh
pnpm i nanofw
```

Add the suggested scripts to your `package.json`:
```json
{
  "scripts": {
    "test": "vitest run --reporter=default --reporter=junit --outputFile=/tmp/junit.xml --coverage",
    "start:dev": "NODE_ENV=development NODE_OPTIONS='--no-warnings --enable-source-maps --import=amaro/transform' node --env-file-if-exists=../../.env --watch ./src/index.ts",
    "start": "NODE_ENV=production NODE_OPTIONS='--no-warnings --enable-source-maps --import=amaro/transform' node ./src/index.ts",
    "db:migrate": "NODE_ENV=development NODE_OPTIONS='--no-warnings --enable-source-maps --import=amaro/transform' knex migrate:latest --knexfile=./database/db.ts",
    "db:seed": "NODE_ENV=development NODE_OPTIONS='--no-warnings --enable-source-maps --import=amaro/transform' knex seed:run --knexfile=./database/db.ts",
    "db:migrate:make": "NODE_ENV=development NODE_OPTIONS='--no-warnings --enable-source-maps --import=amaro/transform' knex migrate:make --knexfile=./database/db.ts",
    "db:seed:make": "NODE_ENV=development NODE_OPTIONS='--no-warnings --enable-source-maps --import=amaro/transform' knex seed:make --knexfile=./database/db.ts"
  }
}
```

Now check the [example](./example) directory for a complete working setup.
