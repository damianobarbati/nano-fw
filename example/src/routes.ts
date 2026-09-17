import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import { registerRoute } from '#framework/docs/middlewares.ts';
import { userRepository } from './repositories.ts';
import { UserCreateRequestSchema, UserGetRequestSchema, UserListRequestSchema, UserListSchema, UserSchema } from './schemas.ts';
import { UserService } from './services.ts';

const loggerMiddleware: MiddlewareHandler = async (c, next) => {
  console.log(`[${c.req.method}] ${c.req.url}`);
  await next();
};

const authMiddleware: MiddlewareHandler = async (c, next) => {
  const token = c.req.header('Authorization');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  await next();
};

export const router = new Hono();

// GET /users
registerRoute(router, {
  method: 'get',
  path: '/users',
  requestSchema: UserListRequestSchema,
  responseSchema: UserListSchema,
  meta: { section: 'Users', description: 'List users.' },
  middlewares: [loggerMiddleware],
  handler: (params) => UserService.getem(params),
});

// GET /users/:id
registerRoute(router, {
  method: 'get',
  path: '/users/:id',
  requestSchema: UserGetRequestSchema,
  responseSchema: UserSchema,
  meta: { section: 'Users', description: 'Get user by ID.' },
  middlewares: [loggerMiddleware],
  handler: (params) => userRepository.get(params.id),
});

// POST /users
registerRoute(router, {
  method: 'post',
  path: '/users',
  requestSchema: UserCreateRequestSchema,
  responseSchema: UserSchema,
  meta: { section: 'Users', description: 'Create user.' },
  middlewares: [loggerMiddleware],
  handler: (params) => UserService.create(params),
});

// POST /private
registerRoute(router, {
  method: 'post',
  path: '/private/xyz',
  requestSchema: z.object({}),
  responseSchema: z.string(),
  meta: { section: 'Private', description: 'Authenticated endpoint.' },
  middlewares: [loggerMiddleware, authMiddleware],
  handler: () => 'welcome!',
});

registerRoute(router, {
  method: 'get',
  path: '/abc-random',
  requestSchema: z.object({}),
  responseSchema: z.string(),
  meta: { description: 'A non-tagged endpoint.' },
  handler: () => 'welcome!',
});

registerRoute(router, {
  method: 'get',
  path: '/xyz-random',
  requestSchema: z.object({}),
  responseSchema: z.string(),
  meta: { description: 'Another non-tagged endpoint.' },
  handler: () => 'welcome!',
});
