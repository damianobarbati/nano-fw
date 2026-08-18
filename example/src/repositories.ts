import Repository from '#framework/database/Repository.ts';
import { database } from '../database/db.ts';

export type UserRow = {
  id: number;
  created_at: string;
  name: string;
  email: string;
};

export type User = UserRow;
export type UserInsert = Omit<UserRow, 'id' | 'created_at'>;
export type UserUpdate = Partial<UserInsert>;

export class UserRepository extends Repository<User, UserRow, UserInsert, UserUpdate> {}

export const userRepository = new UserRepository({ database, tableName: 'users', uniqueSortColumn: 'id' });
