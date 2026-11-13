import { createHash } from 'node:crypto';
import { AUTH_EMAIL_NOT_FOUND, AUTH_INVALID_CREDENTIALS, USER_EMAIL_EXISTS } from './errors.ts';
import { UserRepository } from './repositories.ts';
import type { AuthLoginRequest, UserCreateRequest, UserListRequest, UserRow } from './schemas.ts';

export class UserService {
  static async create({ name, email, password }: UserCreateRequest): Promise<UserRow> {
    const email_exists = await UserRepository.exists({ email });
    if (email_exists) throw USER_EMAIL_EXISTS(email);

    const password_hash = createHash('sha256').update(password).digest('hex');
    const user = await UserRepository.create({ name, email, password_hash });
    return user;
  }

  static async list({ search, ...params }: UserListRequest): Promise<UserRow[]> {
    const filters = search === undefined ? params : { ...params, name$ilike: search };
    const users = await UserRepository.getem(filters);
    return users;
  }
}

export class AuthService {
  static async login({ email, password }: AuthLoginRequest): Promise<UserRow> {
    const user = await UserRepository.findBy({ email });
    if (!user) throw AUTH_EMAIL_NOT_FOUND({ email });

    const password_hash = createHash('sha256').update(password).digest('hex');
    if (user.password_hash !== password_hash) throw AUTH_INVALID_CREDENTIALS;

    return user;
  }
}
