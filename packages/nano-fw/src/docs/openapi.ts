import fs from 'node:fs';
import * as path from 'node:path';

import {
  extendZodWithOpenApi,
  getOpenApiMetadata,
  getRefId,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  type RouteConfig,
} from '@asteasolutions/zod-to-openapi';

import { ZodNullable, ZodObject, type ZodType, z } from 'zod';
import getPackage from '../getPackage.ts';
import type { HTTPMethod } from '../http/registerRoute.ts';

extendZodWithOpenApi(z);

const { pkg_name, pkg_version } = getPackage();

export const openapiRegistry = new OpenAPIRegistry();

export const generateOpenapiDoc = (openapiRegistry: OpenAPIRegistry, folderPath: string) => {
  const generator = new OpenApiGeneratorV3(openapiRegistry.definitions);

  const description = fs
    .readdirSync(folderPath)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => fs.readFileSync(path.join(folderPath, file), 'utf8').trim())
    .join('\n');

  const document = generator.generateDocument({
    openapi: '3.0.0',
    info: { version: pkg_version, title: `${pkg_name} API reference`, description },
  });

  const schemas = document.components?.schemas;
  const errors = schemas?.Errors;

  if (schemas && errors && 'description' in errors && errors.description) {
    document.tags = [...(document.tags ?? []), { name: 'Errors', description: errors.description }];
    delete schemas.Errors;
  }

  return document;
};

export type RouteMeta = Partial<{
  section: string;
  description: string;
  responseDescription: string;
  visibility: 'public' | 'private';
  responses: Record<number | string, { description: string; schema: ZodType }>;
}>;

export const documentEndpoint = (
  openapiRegistry: OpenAPIRegistry,
  method: HTTPMethod,
  path: string,
  requestSchema: ZodType,
  responseSchema: ZodType,
  meta?: RouteMeta,
) => {
  const metadata = getOpenApiMetadataByParamIn(requestSchema, method === 'get' ? 'query' : 'body');

  const request: RouteConfig['request'] = {};

  if (metadata.header) request.headers = metadata.header;

  if (metadata.cookie) request.cookies = metadata.cookie;

  if (metadata.path) request.params = metadata.path;

  if (metadata.query) request.query = metadata.query;

  if (metadata.body) request.body = { content: { 'application/json': { schema: metadata.body } } };

  const tags: string[] = [];

  if (meta?.section) tags.push(meta.section);

  if (meta?.visibility) tags.push(meta.visibility);

  const responses: RouteConfig['responses'] = {
    200: {
      description: meta?.responseDescription || 'Successful response',
      content: { 'application/json': { schema: responseSchema } },
    },
  };

  if (meta?.responses) {
    for (const [status, config] of Object.entries(meta.responses)) {
      responses[Number(status) || status] = {
        description: config.description,
        content: { 'application/json': { schema: config.schema } },
      };
    }
  }

  const openapiPath = path.replace(/:([^/]+)/g, '{$1}');

  const routeConfig: RouteConfig = {
    method,
    path: openapiPath,
    tags,
    summary: path,
    description: meta?.description ?? '',
    request,
    responses,
  };

  openapiRegistry.registerPath(routeConfig);
};

const addItem = (schemas: Record<string, Record<string, ZodType>>, paramIn: string, name: string, item: ZodType) => {
  if (!schemas[paramIn]) schemas[paramIn] = {};
  schemas[paramIn][name] = item;
};

const getOpenApiMetadataByParamIn = (schema: ZodType, paramIn: 'query' | 'body' = 'body') => {
  const schemas: Record<string, Record<string, ZodType>> = {};

  if (schema instanceof ZodNullable) {
    return getOpenApiMetadataByParamIn(schema._def.innerType as ZodType, paramIn);
  }

  if (schema instanceof ZodObject) {
    for (const [key, item] of Object.entries(schema.shape)) {
      const itemMetadata = getOpenApiMetadata(item as ZodType);
      const paramMeta = itemMetadata.param;
      const targetIn = paramMeta?.in ?? paramIn;
      const name = paramMeta?.name ?? key;

      addItem(schemas, targetIn, name, item as ZodType);
    }
  } else {
    const meta = getOpenApiMetadata(schema);

    if (meta.param?.in && meta.param.name) {
      addItem(schemas, meta.param.in, meta.param.name, schema);
    } else {
      addItem(schemas, paramIn, meta.param?.name ?? 'body', schema);
    }
  }

  const query = schemas.query ? z.object(schemas.query) : undefined;
  const path = schemas.path ? z.object(schemas.path) : undefined;
  const header = schemas.header ? z.object(schemas.header) : undefined;
  const cookie = schemas.cookie ? z.object(schemas.cookie) : undefined;
  let body = schemas.body ? z.object(schemas.body) : undefined;

  const refId = getRefId(schema);
  if (body && schema instanceof ZodObject && refId) body = body.openapi(refId);

  return { query, path, header, cookie, body };
};
