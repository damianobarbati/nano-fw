import { z } from 'zod';

export const UserRowSchema = z
  .object({
    id: z.number().meta({ example: 1 }),
    name: z.string().min(2).meta({ example: 'John Doe' }),
    email: z.email().meta({ example: 'john.doe@example.com' }),
    password_hash: z.string(),
  })
  .meta({ id: 'UserRow' });

export type UserRow = z.infer<typeof UserRowSchema>;

export const UserSchema = UserRowSchema.omit({ password_hash: true }).meta({ id: 'User' });
export type User = z.infer<typeof UserSchema>;

export const UserListSchema = z.array(UserSchema);
export type UserList = z.infer<typeof UserListSchema>;

export const UserCreateRequestSchema = UserRowSchema.pick({ name: true, email: true }).extend({
  password: z.string().min(1),
});

export type UserCreateRequest = z.infer<typeof UserCreateRequestSchema>;

export type AuthLoginRequest = Pick<UserCreateRequest, 'email' | 'password'>;

export const UserGetRequestSchema = z.object({
  id: z
    .string()
    .pipe(z.coerce.number())
    .meta({ param: { in: 'path', name: 'id' }, example: 1 }),
});

export type UserGetRequest = z.infer<typeof UserGetRequestSchema>;

export const UserUpdateRequestSchema = UserGetRequestSchema.extend({
  name: UserRowSchema.shape.name,
  email: UserRowSchema.shape.email,
});

export type UserUpdateRequest = z.infer<typeof UserUpdateRequestSchema>;

export const UserListRequestSchema = z.object({
  search: z.string().optional().meta({ example: 'John' }),
  sort: z
    .array(z.tuple([z.enum(['id', 'name', 'email']), z.enum(['asc', 'desc'])]))
    .optional()
    .meta({ example: [['name', 'asc']] }),
  limit: z.number().int().nonnegative().optional().meta({ example: 10 }),
  offset: z.number().int().nonnegative().optional().meta({ example: 0 }),
});

export type UserListRequest = z.infer<typeof UserListRequestSchema>;
