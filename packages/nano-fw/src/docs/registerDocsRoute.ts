import fs from 'node:fs';
import { serveStatic } from '@hono/node-server/serve-static';
import type { ApiReferenceConfiguration } from '@scalar/hono-api-reference';
import type { Hono } from 'hono';
import type { OpenAPIObject } from 'openapi3-ts/oas30';
import type { $ZodType } from 'zod/v4/core';
import getPackage, { type PackageMetadata } from '../getPackage.ts';
import { docsTemplate } from './docsTemplate.ts';
import { generateOpenapiDoc, OpenAPIRegistry, openapiRegistry } from './openapi.ts';
import { type ErrorCatalog, registerErrors } from './registerErrors.ts';

type JsonConfiguration<Value> = Value extends (...args: never[]) => unknown
  ? never
  : Value extends readonly (infer Item)[]
    ? JsonConfiguration<Item>[]
    : Value extends object
      ? { [Key in keyof Value]: JsonConfiguration<Value[Key]> }
      : Value;

export type ScalarOptions = JsonConfiguration<Partial<ApiReferenceConfiguration>>;

export interface RouteDocsOptions {
  docsAssets?: string;
  packageMetadata?: PackageMetadata;
  errors?: ErrorCatalog;
  errorSchema?: $ZodType;
  /** Browser tab title and Scalar introduction heading. Defaults to API Reference. */
  title?: string;
  /** JSON-compatible Scalar settings. Explicit values override framework defaults. Browser callbacks are not supported. */
  scalarOptions?: ScalarOptions;
  /** Tags to show first in Scalar, in the specified order. */
  tagOrder?: readonly string[];
  /** Sidebar logo URL. Also used as the favicon when faviconUrl is omitted. */
  logoUrl?: string;
  /** Favicon URL. Defaults to logoUrl, then /logo.png. */
  faviconUrl?: string;
  /** Transform the generated OpenAPI document for an individual request. */
  transformOpenapiDocument?: (input: {
    document: OpenAPIObject;
    request: Request;
  }) => OpenAPIObject | Promise<OpenAPIObject>;
}

const serializeForInlineScript = (value: unknown) => {
  const json = JSON.stringify(value, (_key, item) => {
    if (typeof item === 'function')
      throw new TypeError('Scalar options must be JSON-compatible. Browser callbacks are not supported.');

    return item;
  });

  return json
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
};

export const routeDocs = (app: Hono, routePath: string, options: RouteDocsOptions = {}) => {
  const docsAssets = options.docsAssets;
  const metadata = options.packageMetadata ?? getPackage();
  const cleanRoutePath = routePath.replace(/\/$/, '');
  const specPath = `${cleanRoutePath}/openapi.json`;
  const scalarOptionsJson = serializeForInlineScript(options.scalarOptions ?? {});

  const registry = new OpenAPIRegistry();

  registry.definitions = [...openapiRegistry.definitions];

  if (options.errors) registerErrors(options.errors, options.errorSchema, registry);

  const openapiSpec = generateOpenapiDoc(registry, docsAssets, options.title ?? 'API Reference', metadata);
  const openapiJson = JSON.stringify(openapiSpec);

  // serve openapi spec in-memory
  app.get(specPath, async (c) => {
    if (!options.transformOpenapiDocument)
      return c.body(openapiJson, 200, { 'Content-Type': 'application/json; charset=utf-8' });

    const document = await options.transformOpenapiDocument({ document: openapiSpec, request: c.req.raw });
    return c.body(JSON.stringify(document), 200, { 'Content-Type': 'application/json; charset=utf-8' });
  });

  let html = docsTemplate.replaceAll('XYZ', () => metadata.name);

  html = html.replaceAll('/docs/openapi.json', () => specPath);
  html = html.replace('__TAG_ORDER__', () => serializeForInlineScript(options.tagOrder ?? []));

  html = html.replace('__HAS_ERRORS__', () =>
    serializeForInlineScript(openapiSpec.tags?.some((tag) => tag.name === 'Errors') ?? false),
  );

  html = html.replace('__LOGO_URL__', () => serializeForInlineScript(options.logoUrl ?? '/logo.png'));

  html = html.replace('__FAVICON_URL__', () =>
    serializeForInlineScript(options.faviconUrl ?? options.logoUrl ?? '/logo.png'),
  );

  html = html.replace('__SCALAR_OPTIONS__', () => scalarOptionsJson);

  html = html.replace('__PAGE_TITLE__', () =>
    openapiSpec.info.title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  );

  app.get(routePath, (c) => c.html(html));

  // serve static doc files
  if (!docsAssets || !fs.statSync(docsAssets, { throwIfNoEntry: false })?.isDirectory()) return;

  app.use(
    `/:filename{.+\\.(html|yml|png|jpg|jpeg|svg|css|js)}`,
    serveStatic({ root: docsAssets, rewriteRequestPath: (p) => p }),
  );
};
