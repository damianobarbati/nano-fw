import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppErrorSchema, ValidationErrorSchema } from './errorSchemas.ts';
import { documentEndpoint, generateOpenapiDoc } from './openapi.ts';

describe('errorSchemas', () => {
  it('keeps generic and validation error schemas distinct', () => {
    const registry = new OpenAPIRegistry();

    documentEndpoint(registry, 'get', '/errors', z.object({}), AppErrorSchema, {
      responses: { 400: { description: 'Validation error', schema: ValidationErrorSchema } },
    });

    const document = generateOpenapiDoc(registry, new URL('../../../example/docs-assets', import.meta.url).pathname);
    expect(document.components?.schemas).toHaveProperty('ErrorResponse');
    expect(document.components?.schemas).toHaveProperty('ValidationError');

    expect(
      ValidationErrorSchema.safeParse({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        payload: { issues: [{ path: 'email', message: 'Invalid email' }] },
      }).success,
    ).toEqual(true);

    expect(
      ValidationErrorSchema.safeParse({
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        payload: { unrelated: true },
      }).success,
    ).toEqual(false);
  });
});
