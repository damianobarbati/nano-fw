import getConfig from '../src/database/getConfig.ts';
import getDatabase from '../src/database/getDatabase.ts';

const config = getConfig('postgres://user:password@localhost:5432/nano-fw');
const database = getDatabase(config);

export { database };
