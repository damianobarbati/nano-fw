import { Hono } from 'hono';
import { AppErrorSchema, documentEndpoint, openapiRegistry, runFn, runSchemedFn } from '#framework/docs/middlewares.ts';
import { userRepository } from './repositories.ts';
import { CreateUserRequestSchema, GetUserRequestSchema, ListUsersRequestSchema, ListUsersResponseSchema, UserSchema } from './schemas.ts';

export const router = new Hono();

// GET /users
documentEndpoint(openapiRegistry, 'get', '/users', ListUsersRequestSchema, ListUsersResponseSchema, {
  section: 'Users',
  description: 'List users.',
});
router.get(
  '/users',
  runSchemedFn(ListUsersRequestSchema, ListUsersResponseSchema, (params) => userRepository.getem({ limit: params.limit, offset: params.offset })),
);

// GET /users/:id
documentEndpoint(openapiRegistry, 'get', '/users/:id', GetUserRequestSchema, UserSchema, {
  section: 'Users',
  description: 'Get user by ID.',
  responses: {
    404: { description: 'User not found', schema: AppErrorSchema },
  },
});
router.get(
  '/users/:id',
  runSchemedFn(GetUserRequestSchema, UserSchema, (params) => userRepository.get(params.id)),
);

// POST /users
documentEndpoint(openapiRegistry, 'post', '/users', CreateUserRequestSchema, UserSchema, {
  section: 'Users',
  description: 'Create user.',
});
router.post(
  '/users',
  runSchemedFn(CreateUserRequestSchema, UserSchema, (params) => userRepository.create(params)),
);

// undocumented and unschemed fn, using the same params + request query + request body merger of runSchemedFn
const echoFn = (value: any) => value;
router.post('/test-fn', runFn(echoFn));
