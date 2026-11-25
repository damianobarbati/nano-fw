import { createDatabase } from 'nano-fw/data';

export const database = createDatabase({ connectionString: 'postgres://user:password@localhost:5432/nano-fw' });
