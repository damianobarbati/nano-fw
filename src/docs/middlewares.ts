import { getOpenApiMetadata, getRefId, type OpenAPIRegistry, type RouteConfig } from '@asteasolutions/zod-to-openapi';
import type { Context, ErrorHandler, Hono, MiddlewareHandler } from 'hono';
import { ZodError, ZodNullable, ZodObject, type ZodType, z } from 'zod';
import { AppError, AppErrorSchema, ValidationErrorSchema } from '#framework/AppError.ts';

import { openapiRegistry } from './openapi.ts';

export { AppError, AppErrorSchema, openapiRegistry, ValidationErrorSchema };

export type RouteMeta = Partial<{
  section: string;
  description: string;
  responseDescription: string;
  visibility: 'public' | 'private';
  responses: Record<number | string, { description: string; schema: ZodType }>;
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
  if (meta?.section) tags.push(meta.section);
  if (meta?.visibility) tags.push(meta.visibility);

  const responses: RouteConfig['responses'] = {
    200: {
      description: meta?.responseDescription || 'Successful response',
      content: { 'application/json': { schema: responseSchema } },
    },
    400: {
      description: 'Request validation failed',
      content: { 'application/json': { schema: ValidationErrorSchema } },
    },
    500: {
      description: 'Internal Server Error',
      content: { 'application/json': { schema: AppErrorSchema } },
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

/**
 * Extracts and returns parameters from an incoming request.
 *
 * The function gathers parameters from the following sources in priority order:
 * - If `auth_params` are available in the context, they are returned directly.
 * - Parses the request body as JSON if the `Content-Type` header is `application/json`.
 * - Extracts query parameters from the URL.
 * - Extracts route parameters from the request.
 */
export const requestToParams = async (c: Context) => {
  const auth_params = c.get('auth_params');
  if (auth_params) return auth_params;

  const params = {
    ...(c.req.header('content-type')?.includes('application/json') ? await c.req.json().catch(() => ({})) : {}),
    ...c.req.query(),
    ...c.req.param(),
  };

  return params;
};

/**
 * Runs a function with the extracted parameters and returns the result as a JSON response.
 */
export const runFn = (fn: (params: any, c: Context) => any) => async (c: Context) => {
  const params = await requestToParams(c);
  const result = await fn(params, c);
  return c.json(result);
};

export type ZodErrorSource = 'request' | 'response';

/**
 * Runs a function with the extracted parameters, validates the input and output using Zod schemas, and returns the result as a JSON response.
 */
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

export const errorHandler: ErrorHandler = (err, c) => {
  if (AppError.isAppError(err)) {
    const body: Record<string, unknown> = { code: err.code, message: err.message || err.code };
    if (err.payload !== undefined) body.payload = err.payload;
    return c.json(body, err.status as any);
  }

  if (err instanceof ZodError || ('issues' in err && 'source' in (err as any))) {
    const source = (err as any).source ?? 'request';
    if (source === 'request') {
      const appError = new AppError(400, 'VALIDATION_ERROR', 'Validation error on request', err as ZodError);
      return c.json({ code: appError.code, message: appError.message, payload: appError.payload }, 400);
    }

    console.error('API Response Schema Violation:', err);
    return c.json({ code: 'RESPONSE_VALIDATION_ERROR', message: 'Internal server error (response format mismatch)' }, 500);
  }

  console.error('Unhandled error:', err);
  return c.json({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal Server Error' }, 500);
};

export interface RouteOptions<TReq, TRes> {
  method: HTTPMethod;
  path: string;
  requestSchema: ZodType<TReq>;
  responseSchema: ZodType<TRes>;
  meta?: RouteMeta;
  middlewares?: MiddlewareHandler[];
  handler: (params: TReq, c: Context) => Promise<TRes> | TRes;
}

/**
 * Registers a route with the provided options and adds the necessary middlewares.
 */
export const registerRoute = <TReq, TRes>(router: Hono, options: RouteOptions<TReq, TRes>) => {
  documentEndpoint(openapiRegistry, options.method, options.path, options.requestSchema, options.responseSchema, options.meta);
  const handlers: MiddlewareHandler[] = [...(options.middlewares || []), runSchemedFn(options.requestSchema, options.responseSchema, options.handler)];
  router[options.method](options.path as any, ...handlers);
};
