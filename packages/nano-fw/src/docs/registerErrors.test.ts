import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApplicationError } from '../ApplicationError.ts';
import { ApplicationErrorSchema } from './errorSchemas.ts';
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
    it('documents plain definitions and ApplicationError instances in catalog order', () => {
      const originalDescription = ApplicationErrorSchema.description;

      registerErrors({
        DOMAIN_OCCUPIED: { status: 409, message: 'Domain is occupied.' },
        UNAUTHORIZED: new ApplicationError(401, 'UNAUTHORIZED', 'Sign in first.'),
      });

      const entry = openapiRegistry.definitions.at(-1);
      expect(entry).toMatchObject({
        type: 'catalog',
        description: [
          '| Code | HTTP status | Message |',
          '| --- | --- | --- |',
          '| DOMAIN_OCCUPIED | 409 | Domain is occupied. |',
          '| UNAUTHORIZED | 401 | Sign in first. |',
        ].join('\n'),
      });

      expect(ApplicationErrorSchema.description).toEqual(originalDescription);
      expect(ApplicationErrorSchema.meta()?.id).toEqual('ErrorResponse');
    });

    it('uses a custom response schema without changing its description or identity', () => {
      const schema = z.object({ error: z.string() }).meta({ id: 'CustomError', description: 'Original response.' });

      registerErrors({ INVALID_REQUEST: { status: 400, message: 'Invalid request.' } }, schema);

      const entry = openapiRegistry.definitions.at(-1);
      expect(entry).toMatchObject({
        type: 'catalog',
        description: expect.stringContaining('| INVALID_REQUEST | 400 | Invalid request. |'),
      });

      expect(schema.description).toEqual('Original response.');
      expect(schema.meta()?.id).toEqual('CustomError');
    });

    it('keeps placeholders, pipes and line breaks as table text', () => {
      registerErrors({ INVALID_INPUT: { status: 400, message: 'Use A | B & <email>.\nTry again.' } });

      const entry = openapiRegistry.definitions.at(-1);
      expect(entry).toMatchObject({
        type: 'catalog',
        description: expect.stringContaining('| INVALID_INPUT | 400 | Use A \\| B &amp; &lt;email&gt;. Try again. |'),
      });
    });
  });
});
