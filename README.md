# nano-fw

`nano-fw` (nano-sized framework) is a micro-framework powered by Hono, Zod, Knex, Vitest.  
It's pragmatic, ESM-first and TypeScript-first.

It provides:

- type-safe request and response validation
- automatic API docs generation with OpenAPI and Scalar from your Zod schemas
- typed repositories

Requires Node.js >=26.

## Development

Requirements:

- `fnm` (eg: `brew install fnm`)
- `docker` (eg: `brew install orbstack`)

Setup:

```sh
docker rm -f nano-fw
docker run -d --name nano-fw -p 5432:5432 -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=nano-fw postgres:18-alpine
fnm install
npm install
npm run build
```

Linting:

```sh
npm run lint
```

Testing:

```sh
npm -ws run test
```

Run example:

```sh
npm -w=nano-fw run dev

npm -w=example run db:migrate
npm -w=example run db:seed 
npm -w=example run dev
```

Example running at http://localhost:8080

## Publishing

```sh
npm run release
```
