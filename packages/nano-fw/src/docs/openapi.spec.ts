import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { documentEndpoint, generateOpenapiDoc } from './openapi.ts';

describe('OpenAPI generation', () => {
  it('moves the error catalog into a standalone tag without changing other models or routes', () => {
    const registry = new OpenAPIRegistry();
    const description = '| Code | HTTP status | Message |\n| --- | --- | --- |\n| UNAUTHORIZED | 401 | Sign in. |';

    registry.register('Errors', z.object({ code: z.string(), message: z.string() }).describe(description));
    registry.register('User', z.object({ id: z.number() }));
    documentEndpoint(registry, 'get', '/health', z.object({}), z.boolean(), { section: 'Health' });

    const document = generateOpenapiDoc(registry, new URL('../../../example/docs-assets', import.meta.url).pathname);
    expect(document.tags).toEqual([{ name: 'Errors', description }]);
    expect(document.components?.schemas).not.toHaveProperty('Errors');
    expect(document.components?.schemas?.User).toMatchObject({ properties: { id: { type: 'number' } } });
    expect(Object.keys(document.paths)).toEqual(['/health']);
    expect(document.paths['/health']?.get?.tags).toEqual(['Health']);
  });

  it('does not add an Errors section without a catalog', () => {
    const document = generateOpenapiDoc(
      new OpenAPIRegistry(),
      new URL('../../../example/docs-assets', import.meta.url).pathname,
    );

    expect(document.tags ?? []).toEqual([]);
  });

  it('concatenates trimmed Markdown files in filename order, including names with parentheses', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nano-fw-docs-'));

    try {
      fs.writeFileSync(path.join(directory, '02-(details).md'), '  Second section\n');
      fs.writeFileSync(path.join(directory, '01-intro.md'), '\nFirst section  ');
      fs.writeFileSync(path.join(directory, 'ignored.txt'), 'Not included');

      expect(generateOpenapiDoc(new OpenAPIRegistry(), directory).info.description).toEqual(
        'First section\nSecond section',
      );
    } finally {
      fs.rmSync(directory, { recursive: true });
    }
  });

  describe('documentEndpoint with error responses', () => {
    it('documents native metadata for parameters, named bodies and responses', () => {
      const registry = new OpenAPIRegistry();

      const requestSchema = z
        .object({
          id: z.number().meta({ param: { in: 'path', name: 'id', description: 'Item ID' }, example: 1 }),
          token: z.string().meta({ param: { in: 'header', name: 'x-token' } }),
          session: z.string().meta({ param: { in: 'cookie', name: 'session' } }),
          search: z
            .string()
            .optional()
            .meta({ param: { in: 'query', name: 'search' } }),
          name: z.string().meta({ example: 'Item' }),
        })
        .meta({ id: 'MetadataRequest' });

      const responseSchema = z.object({ name: z.string() }).meta({ id: 'MetadataResponse' });

      documentEndpoint(registry, 'post', '/items/:id', requestSchema, responseSchema);

      const document = generateOpenapiDoc(registry, new URL('../../../example/docs-assets', import.meta.url).pathname);
      expect(document.paths['/items/{id}']?.post).toMatchObject({
        parameters: expect.arrayContaining([
          expect.objectContaining({ in: 'path', name: 'id', required: true, description: 'Item ID' }),
          expect.objectContaining({ in: 'header', name: 'x-token' }),
          expect.objectContaining({ in: 'cookie', name: 'session' }),
          expect.objectContaining({ in: 'query', name: 'search', required: false }),
        ]),
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/MetadataRequest' } } } },
        responses: {
          200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/MetadataResponse' } } } },
        },
      });

      expect(document.components?.schemas?.MetadataRequest).toEqual({
        type: 'object',
        properties: { name: { type: 'string', example: 'Item' } },
        required: ['name'],
      });

      expect(document.components?.schemas?.MetadataResponse).toEqual({
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      });
    });

    it('registers only the success response by default', () => {
      const registry = new OpenAPIRegistry();

      documentEndpoint(registry, 'get', '/health', z.object({}), z.boolean());

      const route = registry.definitions.find((definition) => definition.type === 'route');
      expect(route?.type === 'route' && Object.keys(route.route.responses)).toEqual(['200']);
    });

    it('registers only 200 and explicitly configured responses in openapi', () => {
      const registry = new OpenAPIRegistry();
      const ReqSchema = z.object({ id: z.number() });
      const ResSchema = z.object({ name: z.string() });
      const Custom404Schema = z.object({ code: z.string() });

      documentEndpoint(registry, 'get', '/users/:id', ReqSchema, ResSchema, {
        section: 'Users',
        description: 'Get user by ID',
        responses: { 404: { description: 'User not found', schema: Custom404Schema } },
      });

      const document = generateOpenapiDoc(registry, new URL('../../../example/docs-assets', import.meta.url).pathname);
      const route = document.paths['/users/{id}']?.get;
      expect(Object.keys(route?.responses ?? {})).toEqual(['200', '404']);

      expect(route).toMatchObject({
        tags: ['Users'],
        responses: {
          404: {
            description: 'User not found',
            content: { 'application/json': { schema: { type: 'object', properties: { code: { type: 'string' } } } } },
          },
        },
      });
    });
  });
});
