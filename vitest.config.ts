import fs from 'node:fs';
import path from 'node:path';
import envk from 'envk/fn';
import { defineConfig } from 'vitest/config';

const envPath = path.resolve('../../.env');
if (fs.existsSync(envPath)) envk(envPath);

if (!process.env.DB_URI) throw new Error('DB_URI is required.');

export default defineConfig({
  test: {
    restoreMocks: true,
  },
});
