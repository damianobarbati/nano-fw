import z from '#framework/zod.ts';

export const UserRowSchema = z
  .object({
    id: z.number().openapi({ example: 1 }),
    name: z.string().min(2).openapi({ example: 'John Doe' }),
    email: z.email().openapi({ example: 'john.doe@example.com' }),
  })
  .openapi('User');
export type UserRow = z.infer<typeof UserRowSchema>;

export const UserSchema = UserRowSchema.clone();
export type User = z.infer<typeof UserRowSchema>;

export const UserListSchema = z.array(UserSchema);
export type UserList = z.infer<typeof UserListSchema>;

export const UserCreateRequestSchema = UserRowSchema.pick({
  name: true,
  email: true,
}).required();
export type UserCreateRequest = z.infer<typeof UserCreateRequestSchema>;

export const UserGetRequestSchema = z.object({
  id: z.coerce.number().openapi({ param: { in: 'path', name: 'id' }, example: 1 }),
});
export type UserGetRequest = z.infer<typeof UserGetRequestSchema>;

export const UserListRequestSchema = z.object({
  limit: z
    .number()
    .optional()
    .openapi({ param: { in: 'query', name: 'limit' }, example: 10 }),
  offset: z
    .number()
    .optional()
    .openapi({ param: { in: 'query', name: 'offset' }, example: 0 }),
});
export type UserListRequest = z.infer<typeof UserListRequestSchema>;
