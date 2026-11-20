import type { Context, Hono, MiddlewareHandler } from 'hono';
import { z } from 'zod';
import type { $ZodType } from 'zod/v4/core';
import { documentEndpoint, openapiRegistry, type RouteMeta } from '../docs/openapi.ts';
import { runFnSchemed } from './middlewares.ts';

export const HTTPMethods = ['get', 'post', 'put', 'patch', 'delete'] as const;
export type HTTPMethod = (typeof HTTPMethods)[number];

export type RouteOptions<TReq, TRes> = {
  method: HTTPMethod;
  path: string;

  responseSchema: $ZodType<TRes>;
  meta?: RouteMeta;
  middlewares?: MiddlewareHandler[];
} & (
  | { requestSchema: $ZodType<TReq>; handler: (params: TReq, c: Context) => Promise<TRes> | TRes }
  | { requestSchema?: undefined; handler: (params: Record<string, never>, c: Context) => Promise<TRes> | TRes }
);

const emptyRequest = z.object({});

/**
 * Registers a route with the provided options and adds the necessary middlewares.
 */
export const route = <TReq, TRes>(router: Hono, options: RouteOptions<TReq, TRes>) => {
  documentEndpoint(
    openapiRegistry,
    options.method,
    options.path,
    options.requestSchema ?? emptyRequest,
    options.responseSchema,
    options.meta,
  );

  const handlers: MiddlewareHandler[] = [
    ...(options.middlewares || []),
    options.requestSchema
      ? runFnSchemed(options.requestSchema, options.responseSchema, options.handler)
      : runFnSchemed(emptyRequest, options.responseSchema, options.handler),
  ];

  router[options.method](options.path as any, ...handlers);
};
