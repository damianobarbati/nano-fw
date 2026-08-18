import getConfig from '#framework/database/getConfig.ts';
import getDatabase from '#framework/database/getDatabase.ts';

// credentials as defined in README.md test section when spinning the pg docker container
const config = getConfig('postgres://user:password@localhost:5432/nano-fw');
const database = getDatabase(config);

export default config;
export { database };
