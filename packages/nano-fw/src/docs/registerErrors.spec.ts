import { getRefId, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from '../AppError.ts';
import { AppErrorSchema } from './errorSchemas.ts';
import { openapiRegistry } from './openapi.ts';
import { registerErrors } from './registerErrors.ts';

let definitions: typeof openapiRegistry.definitions;

beforeEach(() => {
  definitions = [...openapiRegistry.definitions];
});

afterEach(() => {
  openapiRegistry.definitions.splice(0, openapiRegistry.definitions.length, ...definitions);
});

describe('registerErrors', () => {
  describe('registration', () => {
    it('documents plain definitions and AppError instances in catalog order', () => {
      const start = openapiRegistry.definitions.length;
      const originalDescription = AppErrorSchema.description;

      registerErrors({
        DOMAIN_OCCUPIED: { status: 409, message: 'Domain is occupied.' },
        UNAUTHORIZED: new AppError(401, 'UNAUTHORIZED', 'Sign in first.'),
      });

      const generator = new OpenApiGeneratorV3(openapiRegistry.definitions.slice(start));
      const document = generator.generateComponents();
      expect(document.components?.schemas?.Errors).toMatchObject({
        type: 'object',
        properties: { code: { type: 'string' }, message: { type: 'string' } },
        description: [
          '| Code | HTTP status | Message |',
          '| --- | --- | --- |',
          '| DOMAIN_OCCUPIED | 409 | Domain is occupied. |',
          '| UNAUTHORIZED | 401 | Sign in first. |',
        ].join('\n'),
      });

      expect(AppErrorSchema.description).toEqual(originalDescription);
      expect(getRefId(AppErrorSchema)).toEqual('ErrorResponse');
    });

    it('uses a custom response schema without changing its description or identity', () => {
      const start = openapiRegistry.definitions.length;
      const schema = z.object({ error: z.string() }).meta({ id: 'CustomError', description: 'Original response.' });

      registerErrors({ INVALID_REQUEST: { status: 400, message: 'Invalid request.' } }, schema);

      const generator = new OpenApiGeneratorV3(openapiRegistry.definitions.slice(start));
      const document = generator.generateComponents();
      expect(document.components?.schemas?.Errors).toMatchObject({
        type: 'object',
        properties: { error: { type: 'string' } },
        required: ['error'],
        description: expect.stringContaining('| INVALID_REQUEST | 400 | Invalid request. |'),
      });

      expect(schema.description).toEqual('Original response.');
      expect(getRefId(schema)).toEqual('CustomError');
    });

    it('keeps placeholders, pipes and line breaks as table text', () => {
      const start = openapiRegistry.definitions.length;

      registerErrors({ INVALID_INPUT: { status: 400, message: 'Use A | B & <email>.\nTry again.' } });

      const generator = new OpenApiGeneratorV3(openapiRegistry.definitions.slice(start));
      const document = generator.generateComponents();
      expect(document.components?.schemas?.Errors).toMatchObject({
        description: expect.stringContaining('| INVALID_INPUT | 400 | Use A \\| B &amp; &lt;email&gt;. Try again. |'),
      });
    });
  });
});
