import { userRepository } from './repositories.ts';
import type { User, UserCreateRequest, UserGetRequest, UserList, UserListRequest } from './schemas.ts';

export class UserService {
  static async create(params: UserCreateRequest): Promise<User> {
    return userRepository.create(params);
  }

  static async get(params: UserGetRequest): Promise<User> {
    return userRepository.get(params);
  }

  static async getem(params: UserListRequest): Promise<UserList> {
    return userRepository.getem(params);
  }
}
