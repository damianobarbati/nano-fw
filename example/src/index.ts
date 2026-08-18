import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { prettyJSON } from 'hono/pretty-json';
import { errorHandler } from '#framework/docs/middlewares.ts';
import { openapiRegistry, writeOpenapiDoc } from '#framework/docs/openapi.ts';
import { registerRoute } from '#framework/docs/registerRoute.ts';
import { router } from './routes.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(__dirname, '../docs');

const app = new Hono();
app.use(prettyJSON({ space: 2, force: true }));
app.onError(errorHandler);

// 1. Generate openapi.yml file inside the docs/ folder
writeOpenapiDoc(openapiRegistry, docsDir);

// 2. Serve Scalar UI at /docs and static files (including openapi.yml)
registerRoute(app, '/docs', docsDir);

// 3. Mount application routes
app.route('/', router);

// 4. Start the server
const port = Number(process.env.PORT) || 3000;
console.log(`Serving at http://localhost:${port}`);
console.log(`API docs at http://localhost:${port}/docs`);

export const server = serve({ fetch: app.fetch, port });
export { app };
