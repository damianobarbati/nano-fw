import fs from 'node:fs';
import path from 'node:path';
import type { OpenAPIObject, OperationObject, ParameterObject, SchemaObject } from 'openapi3-ts/oas30';
import * as z from 'zod/mini';
import type { $ZodType } from 'zod/v4/core';
import getPackage from '../getPackage.ts';
import type { HTTPMethod } from '../http/registerRoute.ts';
import { createSchemaConverter } from './schemaConverter.ts';

type Response = { description: string; schema: $ZodType };

export type RouteMeta = Partial<{
  section: string;
  visibility: 'public' | 'private';
  description: string;
  responseDescription: string;
  responses: Record<string, Response>;
}>;

type Route = {
  method: HTTPMethod;
  path: string;
  summary: string;
  request: $ZodType;
  tags: string[];
  description?: string;
  responses: Record<string, Response>;
};

type Definition =
  | { type: 'route'; route: Route }
  | { type: 'schema'; name: string; schema: $ZodType }
  | { type: 'catalog'; description: string; schema: $ZodType };

export class OpenAPIRegistry {
  definitions: Definition[] = [];
  register(name: string, schema: $ZodType) {
    this.definitions.push({ type: 'schema', name, schema });
  }
}

export const openapiRegistry = new OpenAPIRegistry();
export const registerSchema = (name: string, schema: $ZodType) => openapiRegistry.register(name, schema);

export const documentEndpoint = (
  registry: OpenAPIRegistry,
  method: HTTPMethod,
  path: string,
  request: $ZodType,
  response: $ZodType,
  meta?: RouteMeta,
) => {
  registry.definitions.push({
    type: 'route',
    route: {
      method,
      path: path.replace(/:([^/]+)/g, '{$1}'),
      summary: path,
      request,
      description: meta?.description,
      tags: [meta?.section, meta?.visibility].filter((tag): tag is string => Boolean(tag)),
      responses: {
        200: { description: meta?.responseDescription ?? 'Successful response', schema: response },
        ...meta?.responses,
      },
    },
  });
};

const jsonContent = (schema: SchemaObject) => ({ 'application/json': { schema } });

export const generateOpenapiDoc = (
  registry: OpenAPIRegistry,
  folderPath: string | undefined,
  title?: string,
  metadata = getPackage(),
): OpenAPIObject => {
  const files =
    folderPath && fs.statSync(folderPath, { throwIfNoEntry: false })?.isDirectory() ? fs.readdirSync(folderPath) : [];

  const description = files
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => fs.readFileSync(path.join(folderPath ?? '', file), 'utf8').trim())
    .join('\n');

  const schemas: Record<string, SchemaObject> = Object.create(null);

  const document: OpenAPIObject = {
    openapi: '3.0.0',
    info: { title: title ?? `${metadata.name} API reference`, description, version: metadata.version },
    components: { schemas },
    paths: Object.create(null),
  };

  const convert = createSchemaConverter(schemas);

  for (const entry of registry.definitions) {
    if (entry.type === 'catalog') {
      document.tags = [{ name: 'Errors', description: entry.description }];
      continue;
    }

    if (entry.type === 'schema') {
      if (entry.name === 'Errors' && z.globalRegistry.get(entry.schema)?.description) {
        document.tags = [{ name: 'Errors', description: z.globalRegistry.get(entry.schema)?.description }];
        continue;
      }

      convert(entry.schema, 'output', entry.name);
      continue;
    }

    const { route } = entry;

    const operation: OperationObject = {
      summary: route.summary,
      tags: route.tags,
      description: route.description,
      responses: {},
    };

    const responses = operation.responses ?? {};

    operation.responses = responses;

    for (const [status, response] of Object.entries(route.responses))
      responses[status] = {
        description: response.description,
        content: jsonContent(convert(response.schema, 'output')),
      };

    let request = route.request;

    if (request instanceof z.core.$ZodNullable) request = request._zod.def.innerType;

    const shape: Record<string, $ZodType> =
      request instanceof z.core.$ZodObject ? request._zod.def.shape : { body: request };

    const body: Record<string, $ZodType> = Object.create(null);

    for (const [field, item] of Object.entries(shape)) {
      const param = z.globalRegistry.get(item)?.param as Partial<ParameterObject> | undefined;
      const name = param?.name ?? field;
      let location: ParameterObject['in'] | 'body' = param?.in ?? (route.method === 'get' ? 'query' : 'body');

      if (!param?.in && route.path.includes(`{${name}}`)) location = 'path';

      if (location === 'body') {
        body[name] = item;
        continue;
      }

      operation.parameters ??= [];

      operation.parameters.push({
        ...param,
        name,
        in: location,
        required: location === 'path' || item._zod.optin !== 'optional',
        schema: convert(item, 'input'),
      });
    }

    if (Object.keys(body).length) {
      const wholeBody =
        request instanceof z.core.$ZodObject && Object.keys(shape).every((key) => body[key] === shape[key]);

      operation.requestBody = {
        content: jsonContent(convert(wholeBody ? request : z.object(body), 'input', z.globalRegistry.get(request)?.id)),
      };
    }

    document.paths[route.path] ??= {};
    document.paths[route.path][route.method] = operation;
  }

  return document;
};
