import fsp from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';
import getPackage from '#framework/getPackage.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const { pkg_name } = getPackage();

export const registerRoute = (app: Hono, routePath: string, folderPath: string) => {
  // serve docs.html
  app.get(routePath, async (c) => {
    let html = await fsp.readFile(path.join(__dirname, 'docs.html'), 'utf-8');
    html = html.replaceAll('XYZ', pkg_name);
    return c.html(html);
  });

  // serve static doc files, openapi.yml is expected here as well
  app.use(`/:filename{.+\\.(html|yml|png|jpg|jpeg|svg|css|js)}`, serveStatic({ root: folderPath, rewriteRequestPath: (p) => p }));
};
