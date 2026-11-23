# nano-fw

`nano-fw` (nano-sized framework) is a micro-framework powered by Hono, Zod, Knex, Vitest.  
It's pragmatic, ESM-first and TypeScript-first.

It provides:

- type-safe request and response validation
- automatic API docs generation with OpenAPI and Scalar from your Zod schemas
- typed repositories

Requires Node.js >=26.

## Usage

Use a Node.js ESM project with a name and version in `package.json`.

```sh
npm install nano-fw hono @hono/node-server zod
```

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

See the [API reference](https://github.com/damianobarbati/nano-fw/blob/main/docs/api.md) and [database example](https://github.com/damianobarbati/nano-fw/tree/main/packages/demo).

## Development

Requirements:

- `fnm` (eg: `brew install fnm`)
- `docker` (eg: `brew install orbstack`)

Setup:

```sh
fnm install --use
npm install -g corepack
corepack enable
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
pnpm -F demo run db:migrate
pnpm -F demo run db:seed
pnpm -F demo run dev
```

Example running at http://localhost:8080

## Release

```sh
pnpm run release
```
