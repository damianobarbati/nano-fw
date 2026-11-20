import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as mini from 'zod/mini';
import { generateOpenapiDoc, openapiRegistry } from '../docs/openapi.ts';
import { errorHandler } from './middlewares.ts';
import { route } from './registerRoute.ts';

let definitions: typeof openapiRegistry.definitions;

beforeEach(() => {
  definitions = [...openapiRegistry.definitions];
});

afterEach(() => {
  openapiRegistry.definitions.splice(0, openapiRegistry.definitions.length, ...definitions);
});

describe('route', () => {
  describe('request and response validation', () => {
    it('runs middleware, parses parameters, strips response fields and documents the route', async () => {
      const app = new Hono();

      app.onError(errorHandler);

      route(app, {
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

    it('infers path fields on an extended PATCH schema', async () => {
      const app = new Hono();
      const teamId = '550e8400-e29b-41d4-a716-446655440000';
      const pathFields = z.object({ teamId: z.uuid(), id: z.coerce.number().int().positive() });
      const request = pathFields.extend({ name: z.string() });

      app.onError(errorHandler);

      route(app, {
        method: 'patch',
        path: '/teams/:teamId/items/:id',
        requestSchema: request,
        responseSchema: z.object({ id: z.number(), name: z.string() }),
        handler: ({ id, name }) => ({ id: id + 1, name }),
      });

      const options = { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{"name":"Ada"}' };
      const result = await app.request(`/teams/${teamId}/items/2?id=99`, options);
      expect(await result.json()).toEqual({ id: 3, name: 'Ada' });
      expect((await app.request(`/teams/${teamId}/items/0`, options)).status).toEqual(400);
      expect((await app.request('/teams/invalid/items/2', options)).status).toEqual(400);

      const doc = generateOpenapiDoc(openapiRegistry, undefined);
      const operation = doc.paths['/teams/{teamId}/items/{id}'].patch;
      expect(operation?.parameters).toMatchObject([
        { name: 'teamId', in: 'path', required: true, schema: { format: 'uuid' } },
        { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
      ]);

      expect(operation?.requestBody).toMatchObject({
        content: { 'application/json': { schema: { properties: { name: { type: 'string' } }, required: ['name'] } } },
      });
    });

    it.each([
      [mini.object({ name: mini.string() }), mini.string()],
      [mini.object({ name: mini.string() }), z.string()],
      [z.object({ name: z.string() }), mini.string()],
    ])('validates and documents Mini and mixed routes', async (requestSchema, responseSchema) => {
      const app = new Hono();

      app.onError(errorHandler);
      route(app, { method: 'get', path: '/mixed', requestSchema, responseSchema, handler: ({ name }) => name });
      expect(await (await app.request('/mixed?name=Ada')).json()).toEqual('Ada');
      expect((await app.request('/mixed')).status).toEqual(400);

      const doc = generateOpenapiDoc(
        openapiRegistry,
        new URL('../../../example/docs-assets', import.meta.url).pathname,
      );

      expect(doc.paths['/mixed'].get).toMatchObject({
        parameters: [{ name: 'name', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { content: { 'application/json': { schema: { type: 'string' } } } } },
      });
    });

    it('rejects invalid input before calling the handler', async () => {
      const app = new Hono();

      app.onError(errorHandler);

      let handlerCalled = false;

      route(app, {
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

it('treats an omitted request schema as an empty schema', async () => {
  const app = new Hono();

  const options = {
    method: 'get' as const,
    responseSchema: z.object({ input: z.object({}).strict() }),
    handler: (input: Record<string, never>) => ({ input, extra: true }),
  };

  route(app, { ...options, path: '/implicit' });
  route(app, { ...options, path: '/explicit', requestSchema: z.object({}) });

  const response = await app.request('/implicit?extra=true');
  expect(await response.json()).toEqual({ input: {} });

  const doc = generateOpenapiDoc(openapiRegistry, new URL('../../../example/docs-assets', import.meta.url).pathname);
  expect(doc.paths['/implicit'].get).toEqual({ ...doc.paths['/explicit'].get, summary: '/implicit' });
});
