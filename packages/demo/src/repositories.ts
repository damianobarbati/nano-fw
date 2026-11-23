import { Repository } from 'nano-fw/data';
import { database } from '../database/db.ts';
import type { UserRow } from './schemas.ts';

export const UserRepository = new Repository<UserRow>({ database, tableName: 'users' });
