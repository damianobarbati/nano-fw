import { getOpenApiMetadata, getRefId, type OpenAPIRegistry, type RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { Context } from 'hono';
import { ZodNullable, ZodObject, type ZodType, z } from 'zod';

export { openapiRegistry } from './openapi.ts';

const toOpenApiPath = (expressPath: string): string => expressPath.replace(/:([^/]+)/g, '{$1}');

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

type RouteMeta = Partial<{
  section: string;
  description: string;
  responseDescription: string;
  visibility: 'public' | 'private';
}>;

export const HTTPMethods = ['get', 'post', 'put', 'delete'] as const;
export type HTTPMethod = (typeof HTTPMethods)[number];

export const documentEndpoint = (openapiRegistry: OpenAPIRegistry, method: HTTPMethod, path: string, requestSchema: ZodType, responseSchema: ZodType, meta?: RouteMeta) => {
  const metadata = getOpenApiMetadataByParamIn(requestSchema, method === 'get' ? 'query' : 'body');

  const request: RouteConfig['request'] = {};
  if (metadata.header) request.headers = metadata.header;
  if (metadata.cookie) request.cookies = metadata.cookie;
  if (metadata.path) request.params = metadata.path;
  if (metadata.query) request.query = metadata.query;
  if (metadata.body) request.body = { content: { 'application/json': { schema: metadata.body } } };

  const tags: string[] = [];
  if (meta?.description) tags.push(meta.description);
  if (meta?.visibility) tags.push(meta.visibility);

  const routeConfig: RouteConfig = {
    method,
    path: toOpenApiPath(path),
    tags,
    summary: path,
    description: meta?.description ?? '',
    request,
    responses: {
      200: {
        description: meta?.responseDescription || '',
        content: { 'application/json': { schema: responseSchema } },
      },
    },
  };

  openapiRegistry.registerPath(routeConfig);
};

export const requestToParams = async (c: Context) => {
  const auth_params = c.get('auth_params');
  if (auth_params) return auth_params;

  const params = {
    ...c.req.query(),
    ...c.req.param(),
    ...(c.req.header('content-type')?.includes('application/json') ? await c.req.json().catch(() => ({})) : {}),
  };

  return params;
};

export const runFn = (fn: (params: any, c: Context) => any) => async (c: Context) => {
  const params = await requestToParams(c);
  const result = await fn(params, c);
  return c.json(result);
};

export type ZodErrorSource = 'request' | 'response';

export const runSchemedFn = <TRequest, TResponse>(
  requestSchema: ZodType<TRequest>,
  responseSchema: ZodType<TResponse>,
  fn: (params: TRequest, c: Context) => Promise<TResponse> | TResponse,
) => {
  return async (c: Context) => {
    const unsafe_input = await requestToParams(c);
    const input = await requestSchema.safeParseAsync(unsafe_input);
    if (!input.success) throw Object.assign(input.error, { source: 'request' satisfies ZodErrorSource });
    const unsafe_output = await fn(input.data, c);
    const output = await responseSchema.safeParseAsync(unsafe_output);
    if (!output.success) throw Object.assign(output.error, { source: 'response' satisfies ZodErrorSource });
    return c.json(output.data);
  };
};
