import Repository from 'nano-fw/database/Repository.ts';
import { database } from '../database/db.ts';
import type { UserRow } from './schemas.ts';

export const UserRepository = new Repository<UserRow>({ database, tableName: 'users' });
