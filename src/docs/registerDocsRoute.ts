import fsp from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';
import getPackage from '#framework/getPackage.ts';
import { generateOpenapiDoc, openapiRegistry } from './openapi.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const { pkg_name } = getPackage();

export interface DocsRouteOptions {
  /** Tags to show first in Scalar, in the specified order. */
  tagOrder?: readonly string[];
}

const serializeForInlineScript = (value: unknown) =>
  JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');

export const registerDocsRoute = (app: Hono, routePath: string, docsAssets: string, options: DocsRouteOptions = {}) => {
  const cleanRoutePath = routePath.replace(/\/$/, '');
  const specPath = `${cleanRoutePath}/openapi.json`;

  const openapiSpec = generateOpenapiDoc(openapiRegistry, docsAssets);
  const openapiJson = JSON.stringify(openapiSpec);

  // serve openapi spec in-memory
  app.get(specPath, (c) => c.body(openapiJson, 200, { 'Content-Type': 'application/json; charset=utf-8' }));

  // serve docs.html
  app.get(routePath, async (c) => {
    let html = await fsp.readFile(path.join(__dirname, 'docs.html'), 'utf-8');
    html = html.replaceAll('XYZ', pkg_name);
    html = html.replaceAll('/docs/openapi.json', specPath);
    html = html.replace('__TAG_ORDER__', serializeForInlineScript(options.tagOrder ?? []));
    return c.html(html);
  });

  // serve static doc files
  app.use(`/:filename{.+\\.(html|yml|png|jpg|jpeg|svg|css|js)}`, serveStatic({ root: docsAssets, rewriteRequestPath: (p) => p }));
};
