import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { prettyJSON } from 'hono/pretty-json';
import { registerDocsRoute } from 'nano-fw/docs';
import { errorHandler } from 'nano-fw/http/middlewares.ts';
import { router } from './routes.ts';

const app = new Hono();

app.use(prettyJSON({ space: 2, force: true }));
app.onError(errorHandler);

// 1. mount routes
app.route('/', router);

// 2. serve ScalarUI at /docs, adding the markdowns in docsDir
const docsAssets = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs-assets');

registerDocsRoute(app, '/', docsAssets, {
  logoUrl: '/mark.svg',
  faviconUrl: '/logo.svg',
  tagOrder: ['Users', 'Private'],
});

// 3. start the server
const port = 8080;
const server = serve({ fetch: app.fetch, port }, () => console.log(`Serving at http://localhost:${port}`));

export { app, server };
