import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AppError } from '../AppError.ts';
import { errorHandler, runFn, runFnSchemed } from './middlewares.ts';

describe('HTTP middlewares', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('errorHandler with Hono', () => {
    it('handles AppError properly', async () => {
      const app = new Hono();

      app.onError(errorHandler);

      app.get('/test-app-error', () => {
        throw new AppError(404, 'USER_NOT_FOUND', 'Custom not found message', { userId: 42 });
      });

      const res = await app.request('/test-app-error');
      expect(res.status).toEqual(404);

      const data = await res.json();
      expect(data).toEqual({ code: 'USER_NOT_FOUND', message: 'Custom not found message', payload: { userId: 42 } });
    });

    it('handles request ZodError with 400 Bad Request and issues payload', async () => {
      const app = new Hono();

      app.onError(errorHandler);

      const RequestSchema = z.object({ email: z.string().email() });
      const ResponseSchema = z.object({ success: z.boolean() });

      app.post(
        '/test-validation',
        runFnSchemed(RequestSchema, ResponseSchema, () => ({ success: true })),
      );

      const res = await app.request('/test-validation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });

      expect(res.status).toEqual(400);

      const data = await res.json();
      expect(data).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Validation error on request',
        payload: { issues: [{ path: 'email', message: expect.any(String) }] },
      });
    });

    it('handles response ZodError with 500 Internal Server Error', async () => {
      const app = new Hono();

      app.onError(errorHandler);

      const RequestSchema = z.object({});
      const ResponseSchema = z.object({ id: z.number() });

      app.get(
        '/test-response-invalid',
        runFnSchemed(RequestSchema, ResponseSchema, () => ({ id: 'not-a-number' as any })),
      );

      const res = await app.request('/test-response-invalid');
      expect(res.status).toEqual(500);

      const data = await res.json();
      expect(data.code).toEqual('RESPONSE_VALIDATION_ERROR');
    });

    it('handles unhandled unknown errors with 500', async () => {
      const app = new Hono();

      app.onError(errorHandler);

      app.get('/test-crash', () => {
        throw new Error('Database exploded');
      });

      const res = await app.request('/test-crash');
      expect(res.status).toEqual(500);

      const data = await res.json();
      expect(data).toEqual({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal Server Error' });
    });
  });
});

describe('runFn parameter extraction', () => {
  it('merges body, query and path parameters in precedence order', async () => {
    const app = new Hono();

    app.post(
      '/items/:id',
      runFn((params) => params),
    );

    const response = await app.request('/items/path?id=query&shared=query&queryOnly=yes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'body', shared: 'body', bodyOnly: true }),
    });

    expect(await response.json()).toEqual({ id: 'path', shared: 'query', queryOnly: 'yes', bodyOnly: true });
  });

  it('uses auth_params instead of collecting request parameters', async () => {
    const app = new Hono<{ Variables: { auth_params: { userId: number } } }>();

    app.use(async (c, next) => {
      c.set('auth_params', { userId: 42 });
      await next();
    });

    app.post(
      '/items/:id',
      runFn(async (params) => params),
    );

    const response = await app.request('/items/path?query=yes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: true }),
    });

    expect(await response.json()).toEqual({ userId: 42 });
  });

  it.each([
    ['text/plain', '{"ignored":true}'],
    ['application/json', '{invalid'],
  ])('keeps query and path parameters with an unusable %s body', async (contentType, body) => {
    const app = new Hono();

    app.post(
      '/items/:id',
      runFn((params) => params),
    );

    const response = await app.request('/items/one?query=yes', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body,
    });

    expect(await response.json()).toEqual({ id: 'one', query: 'yes' });
  });
});
