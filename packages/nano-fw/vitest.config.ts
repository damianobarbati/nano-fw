import fs from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (fs.existsSync(envPath)) loadEnvFile(envPath);

export default defineConfig({
  test: { include: ['src/**/*.test.ts'], setupFiles: ['./vitest.setup.ts'], restoreMocks: true },
});
