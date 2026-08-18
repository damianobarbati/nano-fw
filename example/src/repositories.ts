import Repository from '#framework/database/Repository.ts';
import { database } from '../database/db.ts';
import type { User } from './schemas.ts';

export class UserRepository extends Repository<User> {}
export const userRepository = new UserRepository({ database, tableName: 'users', uniqueSortColumn: 'id' });
