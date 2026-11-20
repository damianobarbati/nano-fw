# nano-fw

`nano-fw` (nano-sized framework) is a micro-framework powered by Hono, Zod, Knex, Vitest.  
It's pragmatic, ESM-first and TypeScript-first.

It provides:

- type-safe request and response validation
- automatic API docs generation with OpenAPI and Scalar from your Zod schemas
- typed repositories

Requires Node.js >=26.

## First route

```ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { route } from 'nano-fw';
import { z } from 'zod';

const app = new Hono();

route(app, {
  method: 'get',
  path: '/hello/:name',
  requestSchema: z.object({ name: z.string() }),
  responseSchema: z.object({ message: z.string() }),
  handler: ({ name }) => ({ message: `Hello, ${name}!` }),
});

serve({ fetch: app.fetch, port: 8080 });
```

`curl http://localhost:8080/hello/Ada` returns `{"message":"Hello, Ada!"}`.

See the [installation guide](packages/nano-fw/README.md) and [database example](packages/example/README.md).

## Development

Requirements:

- `fnm` (eg: `brew install fnm`)
- `docker` (eg: `brew install orbstack`)

Setup:

```sh
fnm install
npm install -g corepack
corepack enable
corepack install
pnpm install
pnpm run build
```

Linting:

```sh
pnpm run lint
```

Testing:

```sh
docker rm -f nano-fw
docker run -q -d --name nano-fw -p 5432:5432 -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=nano-fw postgres:19-alpine
pnpm -r test
```

Run example:

```sh
pnpm dev
pnpm -F example run db:migrate
pnpm -F example run db:seed
pnpm -F example run dev
```

Example running at http://localhost:8080

## Releasing

```sh
pnpm run release
```
