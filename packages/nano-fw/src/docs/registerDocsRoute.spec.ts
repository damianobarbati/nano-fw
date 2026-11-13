import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { documentEndpoint, openapiRegistry } from './openapi.ts';
import { registerDocsRoute, type ScalarOptions } from './registerDocsRoute.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(__dirname, '../../../example/docs-assets');

const getScalarConfig = (html: string) => {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  const configScript = scripts.find((script) => script.includes('const scalarConfig'));
  const sorterScript = scripts.find((script) => script.includes('Scalar.createApiReference'));
  if (!configScript || !sorterScript) throw new Error('Scalar configuration scripts were not rendered');

  let configuration: any = {};

  const document = { body: {}, createElement: () => ({ style: {} }), querySelector: () => null };

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

let definitions: typeof openapiRegistry.definitions;

beforeEach(() => {
  definitions = [...openapiRegistry.definitions];
});

afterEach(() => {
  openapiRegistry.definitions.splice(0, openapiRegistry.definitions.length, ...definitions);
});

describe('registerDocsRoute', () => {
  it('passes Scalar settings through and overrides framework defaults', async () => {
    const app = new Hono();

    const scalarOptions = {
      sources: [
        { title: 'Partner API', url: '/partner.json' },
        { title: 'Public API', url: '/public.json' },
      ],
      theme: 'moon',
      forceDarkModeState: 'dark',
      hideDarkModeToggle: false,
      layout: 'classic',
      withDefaultFonts: false,
      favicon: '/custom-icon.svg',
      url: '/external-openapi.json',
      tagsSorter: 'alpha',
      operationsSorter: 'method',
      defaultHttpClient: { targetKey: 'js', clientKey: 'fetch' },
      title: 'Partner API',
      customCss: ':root { --scalar-font: Inter, sans-serif; }',
    } satisfies ScalarOptions;

    registerDocsRoute(app, '/docs', docsDir, { scalarOptions, faviconUrl: '/logo.svg', tagOrder: ['Websites'] });

    const html = await (await app.request('/docs')).text();
    expect(getScalarConfig(html)).toMatchObject(scalarOptions);
  });

  it('safely preserves inline-script characters and replacement tokens in Scalar options', async () => {
    const app = new Hono();
    const customCss = ':root { --example: "</script><script>&<>\u2028\u2029 $& $` $\' $$ ` \\"; }\n/* next line */';

    registerDocsRoute(app, '/docs', docsDir, { scalarOptions: { customCss } });

    const html = await (await app.request('/docs')).text();
    expect(html).not.toContain('</script><script>');
    expect(getScalarConfig(html).customCss).toEqual(customCss);
  });

  it.each([
    { depth: 'top-level', scalarOptions: { tagsSorter: () => 0 } },
    { depth: 'nested', scalarOptions: { sources: [{ url: '/spec.json', onSpecUpdate: () => {} }] } },
  ])('rejects $depth browser callbacks at registration', ({ scalarOptions }) => {
    const app = new Hono();
    expect(() =>
      registerDocsRoute(app, '/docs', docsDir, {
        // @ts-expect-error Browser callbacks cannot be serialized to JSON.
        scalarOptions,
      }),
    ).toThrow('Scalar options must be JSON-compatible. Browser callbacks are not supported.');
  });

  it.each([
    { routePath: '/docs', specPath: '/docs/openapi.json' },
    { routePath: '/api/v1/documentation/', specPath: '/api/v1/documentation/openapi.json' },
    { routePath: '/', specPath: '/openapi.json' },
  ])('serves docs at $routePath and OpenAPI at $specPath', async ({ routePath, specPath }) => {
    const app = new Hono();

    documentEndpoint(openapiRegistry, 'get', '/test-route', z.object({}), z.object({ status: z.string() }));
    registerDocsRoute(app, routePath, docsDir);

    const specRes = await app.request(specPath);
    const spec = await specRes.json();

    expect(specRes.status).toEqual(200);
    expect(specRes.headers.get('content-type')).toContain('application/json');
    expect(spec).toMatchObject({ openapi: '3.0.0', info: { title: expect.stringContaining('API reference') } });
    expect(spec.paths).toHaveProperty('/test-route');

    const htmlRes = await app.request(routePath);
    const html = await htmlRes.text();

    expect(htmlRes.status).toEqual(200);
    expect(htmlRes.headers.get('content-type')).toContain('text/html');
    expect(getScalarConfig(html).url).toEqual(specPath);
    expect(html).not.toContain('XYZ');
  });

  it('applies a synchronous OpenAPI document transformer without mutating the base document', async () => {
    const app = new Hono();

    documentEndpoint(openapiRegistry, 'get', '/test-route', z.object({}), z.boolean());

    registerDocsRoute(app, '/docs', docsDir, {
      transformOpenapiDocument: ({ document, request }) => {
        if (!request.headers.has('x-hide-route')) return document;

        const { '/test-route': _removedPath, ...paths } = document.paths;
        return { ...document, paths };
      },
    });

    const filtered = await (await app.request('/docs/openapi.json', { headers: { 'x-hide-route': 'true' } })).json();
    const original = await (await app.request('/docs/openapi.json')).json();

    expect(filtered.paths).not.toHaveProperty('/test-route');
    expect(original.paths).toHaveProperty('/test-route');
  });

  it('applies an asynchronous OpenAPI document transformer based on request headers', async () => {
    const app = new Hono();

    registerDocsRoute(app, '/docs', docsDir, {
      transformOpenapiDocument: async ({ document, request }) => ({
        ...document,
        info: { ...document.info, title: request.headers.get('x-api-title') ?? document.info.title },
      }),
    });

    const customSpec = await (
      await app.request('/docs/openapi.json', { headers: { 'x-api-title': 'Partner API' } })
    ).json();

    const defaultSpec = await (await app.request('/docs/openapi.json')).json();

    expect(customSpec.info.title).toEqual('Partner API');
    expect(defaultSpec.info.title).not.toEqual('Partner API');
  });

  it('keeps the three-argument call valid and sorts tags alphabetically by default', async () => {
    const app = new Hono();

    registerDocsRoute(app, '/docs', docsDir);

    const htmlText = await (await app.request('/docs')).text();
    const scalarConfig = getScalarConfig(htmlText);
    expect(scalarConfig).toMatchObject({ theme: 'default', forceDarkModeState: 'light', hideDarkModeToggle: true });

    expect(['Errors', 'Websites', 'Authentication', 'Accounts'].sort(scalarConfig.tagsSorter)).toEqual([
      'Accounts',
      'Authentication',
      'Websites',
      'Errors',
    ]);

    expect(scalarConfig.operationsSorter).toEqual('alpha');
  });

  it.each([
    { options: {}, logo: '/logo.png', favicon: '/logo.png' },
    { options: { logoUrl: '/mark.svg' }, logo: '/mark.svg', favicon: '/mark.svg' },
    { options: { logoUrl: '/mark.svg', faviconUrl: '/icon.svg' }, logo: '/mark.svg', favicon: '/icon.svg' },
    { options: { faviconUrl: '/icon.svg' }, logo: '/logo.png', favicon: '/icon.svg' },
  ])('uses logo $logo and favicon $favicon for $options', async ({ options, logo, favicon }) => {
    const app = new Hono();

    registerDocsRoute(app, '/docs', docsDir, options);

    const html = await (await app.request('/docs')).text();
    expect(getScalarConfig(html).favicon).toEqual(favicon);
    expect(html).toContain(`const logoUrl = ${JSON.stringify(logo)};`);
  });

  it('safely serializes special characters in faviconUrl', async () => {
    const app = new Hono();
    const faviconUrl = '/favicon.svg?value="</script><script>&\u2028\u2029';

    registerDocsRoute(app, '/docs', docsDir, { faviconUrl });

    const htmlText = await (await app.request('/docs')).text();
    const scalarConfig = getScalarConfig(htmlText);
    expect(scalarConfig.favicon).toEqual(faviconUrl);
    expect(htmlText).not.toContain(faviconUrl);
  });

  it('puts ordered tags first and sorts unlisted tags alphabetically', async () => {
    const app = new Hono();

    registerDocsRoute(app, '/docs', docsDir, { tagOrder: ['Errors', 'Authentication', 'Accounts'] });

    const htmlText = await (await app.request('/docs')).text();
    const scalarConfig = getScalarConfig(htmlText);
    expect(['Websites', 'Errors', 'Accounts', 'Payments', 'Authentication'].sort(scalarConfig.tagsSorter)).toEqual([
      'Authentication',
      'Accounts',
      'Payments',
      'Websites',
      'Errors',
    ]);
  });
});
