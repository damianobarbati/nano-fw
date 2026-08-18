import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { AppError, BadRequestError, NotFoundError, UnauthorizedError } from '#framework/AppError.ts';
import { documentEndpoint, errorHandler, runSchemedFn } from '#framework/docs/middlewares.ts';
import z from '#framework/zod.ts';

describe('Error handling & Middlewares', () => {
  let _consoleErrorSpy: MockInstance;

  beforeEach(() => {
    _consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('AppError & Error subclasses', () => {
    it('creates AppError with status, code, message and payload', () => {
      const err = new AppError(404, 'NOT_FOUND', 'Item not found', { id: 123 });
      expect(err.status).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
      expect(err.message).toBe('Item not found');
      expect(err.payload).toEqual({ id: 123 });
      expect(AppError.isAppError(err)).toBe(true);
    });

    it('creates specific error subclasses', () => {
      const notFound = new NotFoundError('User missing');
      expect(notFound.status).toBe(404);
      expect(notFound.code).toBe('NOT_FOUND');

      const badReq = new BadRequestError('Invalid input');
      expect(badReq.status).toBe(400);
      expect(badReq.code).toBe('BAD_REQUEST');

      const unauth = new UnauthorizedError();
      expect(unauth.status).toBe(401);
      expect(unauth.code).toBe('UNAUTHORIZED');
    });
  });

  describe('errorHandler with Hono', () => {
    it('handles AppError properly', async () => {
      const app = new Hono();
      app.onError(errorHandler);

      app.get('/test-app-error', () => {
        throw new NotFoundError('Custom not found message', 'USER_NOT_FOUND', { userId: 42 });
      });

      const res = await app.request('/test-app-error');
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data).toEqual({
        code: 'USER_NOT_FOUND',
        message: 'Custom not found message',
        payload: { userId: 42 },
      });
    });

    it('handles request ZodError with 400 Bad Request and issues payload', async () => {
      const app = new Hono();
      app.onError(errorHandler);

      const RequestSchema = z.object({
        email: z.string().email(),
      });
      const ResponseSchema = z.object({
        success: z.boolean(),
      });

      app.post(
        '/test-validation',
        runSchemedFn(RequestSchema, ResponseSchema, () => ({ success: true })),
      );

      const res = await app.request('/test-validation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('VALIDATION_ERROR');
      expect(data.message).toBe('Validation error on request');
      expect(data.payload.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'email' })]));
    });

    it('handles response ZodError with 500 Internal Server Error', async () => {
      const app = new Hono();
      app.onError(errorHandler);

      const RequestSchema = z.object({});
      const ResponseSchema = z.object({
        id: z.number(),
      });

      app.get(
        '/test-response-invalid',
        runSchemedFn(RequestSchema, ResponseSchema, () => ({ id: 'not-a-number' as any })),
      );

      const res = await app.request('/test-response-invalid');
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe('RESPONSE_VALIDATION_ERROR');
    });

    it('handles unhandled unknown errors with 500', async () => {
      const app = new Hono();
      app.onError(errorHandler);

      app.get('/test-crash', () => {
        throw new Error('Database exploded');
      });

      const res = await app.request('/test-crash');
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe('INTERNAL_SERVER_ERROR');
      expect(data.message).toBe('Internal Server Error');
    });
  });

  describe('documentEndpoint with error responses', () => {
    it('registers default 200, 400, 500 and custom responses in openapi', () => {
      const registry = new OpenAPIRegistry();
      const ReqSchema = z.object({ id: z.number() });
      const ResSchema = z.object({ name: z.string() });
      const Custom404Schema = z.object({ code: z.string() });

      documentEndpoint(registry, 'get', '/users/:id', ReqSchema, ResSchema, {
        section: 'Users',
        description: 'Get user by ID',
        responses: {
          404: {
            description: 'User not found',
            schema: Custom404Schema,
          },
        },
      });

      const defs = registry.definitions;
      expect(defs.length).toBeGreaterThan(0);
      const route = defs.find((d: any) => d.type === 'route') as any;
      expect(route).toBeDefined();
      expect(route.route.responses['200']).toBeDefined();
      expect(route.route.responses['400']).toBeDefined();
      expect(route.route.responses['500']).toBeDefined();
      expect(route.route.responses['404']).toBeDefined();
      expect(route.route.responses['404'].description).toBe('User not found');
    });
  });
});
