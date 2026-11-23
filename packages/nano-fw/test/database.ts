import getConfig from '../src/database/getConfig.ts';
import getDatabase from '../src/database/getDatabase.ts';

const config = getConfig(process.env.NANO_FW_TEST_DATABASE_URL ?? 'postgres://user:password@localhost:5432/nano-fw');
const database = getDatabase(config);

export { database };
