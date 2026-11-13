import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { ZodType } from 'zod';
import { documentEndpoint, openapiRegistry, type RouteMeta } from '../docs/openapi.ts';
import { runFnSchemed } from './middlewares.ts';

export const HTTPMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;
export type HTTPMethod = (typeof HTTPMethods)[number];

export type RouteOptions<TReq, TRes> = {
  method: HTTPMethod;
  path: string;
  requestSchema: ZodType<TReq>;
  responseSchema: ZodType<TRes>;
  meta?: RouteMeta;
  middlewares?: MiddlewareHandler[];
  handler: (params: TReq, c: Context) => Promise<TRes> | TRes;
};

/**
 * Registers a route with the provided options and adds the necessary middlewares.
 */
export const registerRoute = <TReq, TRes>(router: Hono, options: RouteOptions<TReq, TRes>) => {
  documentEndpoint(
    openapiRegistry,
    options.method,
    options.path,
    options.requestSchema,
    options.responseSchema,
    options.meta,
  );

  const handlers: MiddlewareHandler[] = [
    ...(options.middlewares || []),
    runFnSchemed(options.requestSchema, options.responseSchema, options.handler),
  ];

  router[options.method](options.path as any, ...handlers);
};
