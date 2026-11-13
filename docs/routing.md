# Routing, schemas and docs

`registerRoute` validates requests and responses. The same schemas generate OpenAPI docs.

```ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { errorHandler, registerDocsRoute, registerRoute } from 'nano-fw/docs';
import { z } from 'zod';

const app = new Hono();
app.onError(errorHandler);

const HelloRequest = z.object({ name: z.string() }).meta({ id: 'HelloRequest' });
const HelloResponse = z.object({ message: z.string() }).meta({ id: 'HelloResponse' });

registerRoute(app, {
  method: 'post',
  path: '/hello',
  requestSchema: HelloRequest,
  responseSchema: HelloResponse,
  meta: { section: 'Hello', description: 'Say hello.' },
  handler: ({ name }) => ({ message: `Hello, ${name}!` }),
});

registerDocsRoute(app, '/docs', './docs-assets');

serve({ fetch: app.fetch, port: 8080 });
```

Create `docs-assets` before startup. Register docs after all routes.

- `/docs`: Scalar API reference.
- `/docs/openapi.json`: generated OpenAPI specification.
- Markdown files in `docs-assets`: API introduction, in filename order.
- API name and version: application's `package.json`.

## Route options

| Option           | Purpose                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `method`, `path` | HTTP method and URL. Methods: `get`, `post`, `put`, `patch`, `delete`.                     |
| `requestSchema`  | Validate handler input.                                                                    |
| `responseSchema` | Validate handler output before returning JSON.                                             |
| `handler`        | Receive validated parameters and Hono context; return data. Supports async functions.      |
| `middlewares`    | Optional Hono middleware, run before validation.                                           |
| `meta`           | Optional docs: `section`, `description`, `responseDescription`, `responses`, `visibility`. |

Input merges JSON body, query and path parameters; later sources win. Context `auth_params`, when set, replaces them.

## Helpers

Exports from `nano-fw/docs`:

| Helper                                                                           | Purpose                                                                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `registerRoute(app, options)`                                                    | Register route, validation and docs together.                                              |
| `registerDocsRoute(app, path, assets, options?)`                                 | Serve docs. Options include `logoUrl`, `tagOrder`, `scalarOptions`.                        |
| `registerErrors(errors, schema?)`                                                | Document a central error catalog in a separate `Errors` section.                           |
| `requestToParams(context)`                                                       | Collect request parameters.                                                                |
| `runFn(handler)`                                                                 | Adapt a handler to Hono and return JSON.                                                   |
| `runFnSchemed(requestSchema, responseSchema, handler)`                           | Same, with validation; does not register docs.                                             |
| `documentEndpoint(registry, method, path, requestSchema, responseSchema, meta?)` | Document a route registered separately.                                                    |
| `openapiRegistry`                                                                | Shared registry used by route and docs registration.                                       |
| `errorHandler`                                                                   | Return JSON errors: `400` for invalid input, `500` for invalid output or unhandled errors. |
| `AppError`, `AppErrorSchema`, `ValidationErrorSchema`                            | Application errors and schemas for documenting errors.                                     |

```ts
import { AppError } from 'nano-fw/docs';

throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
```

## Error catalog

Register once, before `registerDocsRoute`:

```ts
import { AppError, registerErrors } from 'nano-fw/docs';

export const UNAUTHORIZED = new AppError(401, 'UNAUTHORIZED', 'Sign in to continue.');

registerErrors({ UNAUTHORIZED, DOMAIN_OCCUPIED: { status: 409, message: 'Domain is occupied.' } });
```

Scalar shows an `Errors` section at the end of the page, after Models, with a table of codes, HTTP statuses and messages. Catalog keys become error codes; entries keep their insertion order. No route configuration required. The catalog does not add a model.

The optional schema argument remains supported. The Errors section displays the catalog table only.

`registerErrors` documents the catalog only. Throw errors and register `app.onError(errorHandler)` to control runtime responses. Custom response formats require a matching application error handler.
