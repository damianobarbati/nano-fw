import { Hono, type MiddlewareHandler } from 'hono';
import { registerRoute } from 'nano-fw/http/registerRoute.ts';
import { z } from 'zod';
import { UNAUTHORIZED } from './errors.ts';
import { UserRepository } from './repositories.ts';

import {
  UserCreateRequestSchema,
  UserGetRequestSchema,
  UserListRequestSchema,
  UserListSchema,
  UserSchema,
  UserUpdateRequestSchema,
} from './schemas.ts';

import { UserService } from './services.ts';

const loggerMiddleware: MiddlewareHandler = async (c, next) => {
  console.log(`[${c.req.method}] ${c.req.url}`);
  await next();
};

const authMiddleware: MiddlewareHandler = async (c, next) => {
  const token = c.req.header('Authorization');
  if (!token) throw UNAUTHORIZED;
  await next();
};

export const router = new Hono();

registerRoute(router, {
  method: 'post',
  path: '/user',
  requestSchema: UserCreateRequestSchema,
  responseSchema: UserSchema,
  meta: { section: 'Users', description: 'Create user.' },
  middlewares: [loggerMiddleware],
  handler: (params) => UserService.create(params),
});

registerRoute(router, {
  method: 'get',
  path: '/user/:id',
  requestSchema: UserGetRequestSchema,
  responseSchema: UserSchema,
  meta: { section: 'Users', description: 'Get user by ID.' },
  middlewares: [loggerMiddleware],
  handler: (params) => UserRepository.get(params.id),
});

registerRoute(router, {
  method: 'put',
  path: '/user/:id',
  requestSchema: UserUpdateRequestSchema,
  responseSchema: UserSchema,
  meta: { section: 'Users', description: 'Update user name and email.' },
  middlewares: [loggerMiddleware],
  handler: async ({ id, ...input }) => {
    const user = await UserRepository.update(id, input);
    return user;
  },
});

registerRoute(router, {
  method: 'delete',
  path: '/user/:id',
  requestSchema: UserGetRequestSchema,
  responseSchema: z.boolean(),
  meta: { section: 'Users', description: 'Remove user. Returns whether a user was removed.' },
  middlewares: [loggerMiddleware],
  handler: async ({ id }) => {
    const removed = await UserRepository.remove(id);
    return removed;
  },
});

registerRoute(router, {
  method: 'post',
  path: '/user/list',
  requestSchema: UserListRequestSchema,
  responseSchema: UserListSchema,
  meta: { section: 'Users', description: 'List users.' },
  middlewares: [loggerMiddleware],
  handler: (params) => UserService.list(params),
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
  path: '/xyz',
  requestSchema: z.object({}),
  responseSchema: z.string(),
  meta: { description: 'A non-tagged endpoint.' },
  handler: () => 'welcome!',
});
