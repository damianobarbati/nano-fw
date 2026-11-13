import type { ZodType } from 'zod';
import { AppErrorSchema } from './errorSchemas.ts';
import { openapiRegistry } from './openapi.ts';

export type ErrorCatalog = Record<string, { status: number; message: string }>;

const escapeTableCell = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, ' ');

export const registerErrors = (errors: ErrorCatalog, schema: ZodType = AppErrorSchema) => {
  const rows = Object.entries(errors).map(
    ([code, error]) => `| ${escapeTableCell(code)} | ${error.status} | ${escapeTableCell(error.message)} |`,
  );

  const description = ['| Code | HTTP status | Message |', '| --- | --- | --- |', ...rows].join('\n');

  openapiRegistry.register('Errors', schema.describe(description));
};
