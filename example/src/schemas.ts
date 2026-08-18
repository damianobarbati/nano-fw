import z from '#framework/zod.ts';

export const UserSchema = z
  .object({
    id: z.number().openapi({ example: 1 }),
    name: z.string().min(2).openapi({ example: 'John Doe' }),
    email: z.email().openapi({ example: 'john.doe@example.com' }),
  })
  .openapi('User');

export const GetUserRequestSchema = z.object({
  id: z.coerce.number().openapi({ param: { in: 'path', name: 'id' }, example: 1 }),
});

export const ListUsersRequestSchema = z.object({
  limit: z.coerce
    .number()
    .optional()
    .openapi({ param: { in: 'query', name: 'limit' }, example: 10 }),
  offset: z.coerce
    .number()
    .optional()
    .openapi({ param: { in: 'query', name: 'offset' }, example: 0 }),
});
export const ListUsersResponseSchema = z.array(UserSchema);

export const CreateUserRequestSchema = z.object({
  name: z.string().min(2).openapi({ example: 'John Doe' }),
  email: z.email().openapi({ example: 'john.doe@example.com' }),
});
