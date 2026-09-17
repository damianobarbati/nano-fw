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

const getScalarConfig = (html: string) => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  const configScript = scripts.find((script) => script.includes('const scalarConfig'));
  const sorterScript = scripts.find((script) => script.includes('Scalar.createApiReference'));
  if (!configScript || !sorterScript) throw new Error('Scalar configuration scripts were not rendered');

  let configuration: any = {};
  const document = {
    body: {},
    createElement: () => ({ style: {} }),
    querySelector: () => null,
  };
  class MutationObserver {
    disconnect() {}
    observe() {}
  }
  const Scalar = {
    createApiReference: (_selector: string, initialConfiguration: Record<string, unknown>) => {
      configuration = initialConfiguration;
      return { updateConfiguration: () => {} };
    },
  };

  new Function('window', 'document', 'MutationObserver', 'Scalar', `${configScript}\n${sorterScript}`)(
    { location: { href: 'http://localhost/docs' } },
    document,
    MutationObserver,
    Scalar,
  );

  return configuration;
};

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
    expect(htmlText).toContain("url: '/docs/openapi.json'");
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
    expect(htmlText).toContain("url: '/api/v1/documentation/openapi.json'");
  });

  it('uses /openapi.json in Scalar when docs are registered at the root path', async () => {
    const app = new Hono();
    registerDocsRoute(app, '/', docsDir);

    const specRes = await app.request('/openapi.json');
    expect(specRes.status).toBe(200);

    const htmlText = await (await app.request('/')).text();
    expect(htmlText).toContain("url: '/openapi.json'");
    expect(htmlText).not.toContain("url: '/docs/openapi.json'");
  });

  it('applies a synchronous OpenAPI document transformer without mutating the base document', async () => {
    const app = new Hono();
    registerDocsRoute(app, '/docs', docsDir, {
      transformOpenapiDocument: ({ document }) => {
        const { '/test-route': _removedPath, ...paths } = document.paths;
        return { ...document, paths };
      },
    });

    const specJson = await (await app.request('/docs/openapi.json')).json();
    expect(specJson.paths['/test-route']).toBeUndefined();
  });

  it('applies an asynchronous OpenAPI document transformer based on request headers', async () => {
    const app = new Hono();
    registerDocsRoute(app, '/docs', docsDir, {
      transformOpenapiDocument: async ({ document, request }) => ({
        ...document,
        info: { ...document.info, title: request.headers.get('x-api-title') ?? document.info.title },
      }),
    });

    const customSpec = await (await app.request('/docs/openapi.json', { headers: { 'x-api-title': 'Partner API' } })).json();
    const defaultSpec = await (await app.request('/docs/openapi.json')).json();
    expect(customSpec.info.title).toBe('Partner API');
    expect(defaultSpec.info.title).not.toBe('Partner API');
  });

  it('keeps the three-argument call valid and sorts tags alphabetically by default', async () => {
    const app = new Hono();
    registerDocsRoute(app, '/docs', docsDir);

    const htmlText = await (await app.request('/docs')).text();
    const scalarConfig = getScalarConfig(htmlText);
    expect(['Websites', 'Authentication', 'Accounts'].sort(scalarConfig.tagsSorter)).toEqual(['Accounts', 'Authentication', 'Websites']);
    expect(scalarConfig.operationsSorter).toBe('alpha');
  });

  it('uses the default logo when logoUrl is omitted', async () => {
    const app = new Hono();
    registerDocsRoute(app, '/docs', docsDir);

    const htmlText = await (await app.request('/docs')).text();
    const scalarConfig = getScalarConfig(htmlText);
    expect(scalarConfig.favicon).toBe('/logo.png');
    expect(htmlText).toContain('const logoUrl = "/logo.png";');
  });

  it('uses logoUrl for the Scalar favicon and sidebar logo', async () => {
    const app = new Hono();
    registerDocsRoute(app, '/s/docs', docsDir, { logoUrl: '/s/docs/logo.svg' });

    const htmlText = await (await app.request('/s/docs')).text();
    const scalarConfig = getScalarConfig(htmlText);
    expect(scalarConfig.favicon).toBe('/s/docs/logo.svg');
    expect(htmlText).toContain('const logoUrl = "/s/docs/logo.svg";');
    expect(htmlText).toContain("document.querySelector('.t-doc__sidebar')");
    expect(htmlText).toContain('img.src = logoUrl;');
  });

  it('puts ordered tags first and sorts unlisted tags alphabetically', async () => {
    const app = new Hono();
    registerDocsRoute(app, '/docs', docsDir, { tagOrder: ['Authentication', 'Accounts'] });

    const htmlText = await (await app.request('/docs')).text();
    const scalarConfig = getScalarConfig(htmlText);
    expect(['Websites', 'Accounts', 'Payments', 'Authentication'].sort(scalarConfig.tagsSorter)).toEqual(['Authentication', 'Accounts', 'Payments', 'Websites']);
  });
});
