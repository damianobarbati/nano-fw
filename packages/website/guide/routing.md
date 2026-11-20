# Routing, schemas and docs

`route` validates requests and responses. The same schemas generate OpenAPI docs.

```ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { errorHandler, route, routeDocs } from 'nano-fw';
import { z } from 'zod';

const app = new Hono();
app.onError(errorHandler);

const HelloRequest = z.object({ name: z.string() }).meta({ id: 'HelloRequest' });
const HelloResponse = z.object({ message: z.string() }).meta({ id: 'HelloResponse' });

route(app, {
  method: 'post',
  path: '/hello',
  requestSchema: HelloRequest,
  responseSchema: HelloResponse,
  meta: { section: 'Hello', description: 'Say hello.' },
  handler: ({ name }) => ({ message: `Hello, ${name}!` }),
});

routeDocs(app, '/docs');

serve({ fetch: app.fetch, port: 8080 });
```

Create `docs-assets` before startup. Register docs after all routes.

- `/docs`: Scalar API reference.
- `/docs/openapi.json`: generated OpenAPI specification.
- Set the optional `docsAssets` directory to include local files. Markdown files in `docs-assets`: API introduction, in filename order.
- API name and version: application's `package.json`.

## Route options

| Option           | Purpose                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `method`, `path` | HTTP method and URL. Methods: `get`, `post`, `put`, `patch`, `delete`.                     |
| `requestSchema`  | Optional. Defaults to an empty object schema.                                              |
| `responseSchema` | Validate handler output before returning JSON.                                             |
| `handler`        | Receive validated parameters and Hono context; return data. Supports async functions.      |
| `middlewares`    | Optional Hono middleware, run before validation.                                           |
| `meta`           | Optional docs: `section`, `description`, `responseDescription`, `responses`, `visibility`. |

Input merges JSON body, query and path parameters; later sources win. Context `auth_params`, when set, replaces them.

## Error catalog

Pass the catalog as the `errors` option to `routeDocs`.
