import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { documentEndpoint } from '#framework/docs/middlewares.ts';
import { openapiRegistry } from '#framework/docs/openapi.ts';
import { registerDocsRoute } from '#framework/docs/registerDocsRoute.ts';
import z from '#framework/zod.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(__dirname, '../../example/docs-assets');

describe('registerDocsRoute', () => {
  it('serves openapi spec from memory at /docs/openapi.json and rendered api docs at /docs', async () => {
    const app = new Hono();
    documentEndpoint(openapiRegistry, 'get', '/test-route', z.object({}), z.object({ status: z.string() }), { section: 'Test', description: 'Test endpoint' });
    registerDocsRoute(app, '/docs', docsDir);

    const specRes = await app.request('/docs/openapi.json');
    expect(specRes.status).toBe(200);
    expect(specRes.headers.get('content-type')).toContain('application/json');

    const specJson = await specRes.json();
    expect(specJson.openapi).toBe('3.0.0');
    expect(specJson.info.title).toContain('API reference');
    expect(specJson.paths['/test-route']).toBeDefined();

    const htmlRes = await app.request('/docs');
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.headers.get('content-type')).toContain('text/html');

    const htmlText = await htmlRes.text();
    expect(htmlText).toContain('data-url="/docs/openapi.json"');
    expect(htmlText).not.toContain('XYZ');
  });

  it('handles custom routePath properly', async () => {
    const app = new Hono();
    registerDocsRoute(app, '/api/v1/documentation/', docsDir);

    const specRes = await app.request('/api/v1/documentation/openapi.json');
    expect(specRes.status).toBe(200);

    const htmlRes = await app.request('/api/v1/documentation/');
    expect(htmlRes.status).toBe(200);
    const htmlText = await htmlRes.text();
    expect(htmlText).toContain('data-url="/api/v1/documentation/openapi.json"');
  });
});
