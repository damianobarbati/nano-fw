import type { SchemaObject } from 'openapi3-ts/oas30';
import * as z from 'zod/mini';
import type { $ZodType } from 'zod/v4/core';

export const createSchemaConverter = (schemas: Record<string, SchemaObject>) => {
  const signatures = new Map<string, string>();

  const convert = (schema: $ZodType, io: 'input' | 'output', name = z.globalRegistry.get(schema)?.id): SchemaObject => {
    const raw = z.toJSONSchema(schema, {
      target: 'openapi-3.0',
      io,
      override: ({ jsonSchema }) => {
        delete jsonSchema.param;
      },
    });

    const { definitions, ...root } = raw;
    const suffix = io === 'input' ? 'Input' : 'Output';
    const keys = Object.keys(definitions ?? {});
    const signature = JSON.stringify(raw);
    const names = new Map<string, string>();

    const reserve = (key: string, fingerprint: string) => {
      let candidate = key;
      let index = 1;

      while (signatures.has(candidate) && signatures.get(candidate) !== fingerprint) {
        candidate = key + suffix + (index === 1 ? '' : index);
        index++;
      }

      signatures.set(candidate, fingerprint);
      names.set(key, candidate);
      return candidate;
    };

    for (const key of keys) {
      const definition = JSON.stringify(definitions?.[key]);

      reserve(key, definition.includes('"$ref"') ? signature : definition);
    }

    const recursiveName = name ? (names.get(name) ?? reserve(name, signature)) : `Recursive${signatures.size}`;
    let recursive = false;

    // Zod emits document-local references. Move their schema targets into OpenAPI components.
    const rewrite = (value: unknown): SchemaObject =>
      JSON.parse(
        JSON.stringify(value, (key, item) => {
          if (key === '$ref' && typeof item === 'string') {
            if (item === '#') {
              recursive = true;
              return `#/components/schemas/${recursiveName}`;
            }

            if (item.startsWith('#/definitions/')) return `#/components/schemas/${names.get(item.slice(14))}`;
            return item;
          }

          return item;
        }),
      );

    for (const [key, value] of Object.entries(definitions ?? {})) schemas[names.get(key) ?? key] = rewrite(value);

    const result = rewrite(root);

    if (root.$ref === `#/definitions/${name}` && name && definitions?.[name]) return result;

    if (name || recursive) {
      signatures.set(recursiveName, signature);
      schemas[recursiveName] = result;
      return { $ref: `#/components/schemas/${recursiveName}` } as SchemaObject;
    }

    return result;
  };

  return convert;
};
