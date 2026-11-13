import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { openapiRegistry } from '../docs/openapi.ts';
import { errorHandler } from './middlewares.ts';
import { registerRoute } from './registerRoute.ts';

let definitions: typeof openapiRegistry.definitions;

beforeEach(() => {
  definitions = [...openapiRegistry.definitions];
});

afterEach(() => {
  openapiRegistry.definitions.splice(0, openapiRegistry.definitions.length, ...definitions);
});

describe('registerRoute', () => {
  describe('request and response validation', () => {
    it('runs middleware, parses parameters, strips response fields and documents the route', async () => {
      const app = new Hono();

      app.onError(errorHandler);

      registerRoute(app, {
        method: 'post',
        path: '/registered-items/:id',
        requestSchema: z.object({
          id: z.coerce.number().meta({ param: { in: 'path', name: 'id' } }),
          name: z.string(),
        }),
        responseSchema: z.object({ id: z.number(), name: z.string() }),
        meta: { section: 'Items' },
        middlewares: [
          async (c, next) => {
            c.header('x-route-middleware', 'active');
            await next();
          },
        ],
        handler: (params) => ({ ...params, internal: 'excluded' }),
      });

      const response = await app.request('/registered-items/42', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Item' }),
      });

      const body = await response.json();

      expect(response.status).toEqual(200);
      expect(response.headers.get('x-route-middleware')).toEqual('active');
      expect(body).toEqual({ id: 42, name: 'Item' });

      const definition = openapiRegistry.definitions.find(
        (entry) => entry.type === 'route' && entry.route.path === '/registered-items/{id}',
      );

      expect(definition).toMatchObject({ type: 'route', route: { method: 'post', tags: ['Items'] } });
    });

    it('rejects invalid input before calling the handler', async () => {
      const app = new Hono();

      app.onError(errorHandler);

      let handlerCalled = false;

      registerRoute(app, {
        method: 'get',
        path: '/registered-count',
        requestSchema: z.object({ count: z.coerce.number() }),
        responseSchema: z.number(),
        handler: ({ count }) => {
          handlerCalled = true;
          return count;
        },
      });

      const response = await app.request('/registered-count?count=invalid');
      const body = await response.json();

      expect(response.status).toEqual(400);
      expect(body.code).toEqual('VALIDATION_ERROR');
      expect(handlerCalled).toEqual(false);
    });
  });
});
