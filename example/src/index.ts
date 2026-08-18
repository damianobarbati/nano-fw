import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { prettyJSON } from 'hono/pretty-json';
import { errorHandler, registerDocsRoute } from '#framework/docs/index.ts';
import { router } from './routes.ts';

const app = new Hono();
app.use(prettyJSON({ space: 2, force: true }));
app.onError(errorHandler);

// 1. mount routes
app.route('/', router);

// 2. serve ScalarUI at /docs, adding the markdowns in docsDir
const docsAssets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs-assets');
registerDocsRoute(app, '/docs', docsAssets);

// 3. start the server
const port = Number(process.env.PORT) || 3000;
console.log(`Serving at http://localhost:${port}`);
console.log(`API docs at http://localhost:${port}/docs`);

export const server = serve({ fetch: app.fetch, port });
export { app };
