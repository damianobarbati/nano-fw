import type { Context, ErrorHandler, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { $ZodError, $ZodNullable, $ZodObject, type $ZodType, globalRegistry, safeParseAsync } from 'zod/v4/core';
import { ApplicationError } from '../ApplicationError.ts';

/**
 * Extracts and returns parameters from an incoming request.
 *
 * The function gathers parameters from the following sources in priority order:
 * - If `auth_params` are available in the context, they are returned directly.
 * - Parses the request body as JSON if the `Content-Type` header is `application/json`.
 * - Extracts query parameters from the URL.
 * - Extracts route parameters from the request.
 */
export const requestToParams = async (c: Context) => {
  const auth_params = c.get('auth_params');
  if (auth_params) return auth_params;

  const params = {
    ...(c.req.header('content-type')?.includes('application/json') ? await c.req.json().catch(() => ({})) : {}),
    ...c.req.query(),
    ...c.req.param(),
  };

  return params;
};

/**
 * Runs a function with the extracted parameters and returns the result as a JSON response.
 */
export const runFn = (fn: (params: any, c: Context) => any) => async (c: Context) => {
  const params = await requestToParams(c);
  const result = await fn(params, c);
  return c.json(result);
};

export type ZodErrorSource = 'request' | 'response';

/**
 * Runs a function with the extracted parameters, validates the input and output using Zod schemas, and returns the result as a JSON response.
 */
export const runFnSchemed = <TRequest, TResponse>(
  requestSchema: $ZodType<TRequest>,
  responseSchema: $ZodType<TResponse>,
  fn: (params: TRequest, c: Context) => Promise<TResponse> | TResponse,
): MiddlewareHandler => {
  const object = requestSchema instanceof $ZodNullable ? requestSchema._zod.def.innerType : requestSchema;
  const fields: { field: string; name: string; location: string }[] = [];

  if (object instanceof $ZodObject) {
    for (const [field, schema] of Object.entries(object._zod.def.shape)) {
      const param = globalRegistry.get(schema as $ZodType)?.param as { in?: string; name?: string } | undefined;
      if (param?.in) fields.push({ field, name: param.name ?? field, location: param.in });
    }
  }

  return async (c: Context) => {
    const unsafe_input = await requestToParams(c);

    if (!c.get('auth_params')) {
      for (const { field, name, location } of fields) {
        if (location === 'header') unsafe_input[field] = c.req.header(name);

        if (location === 'cookie') unsafe_input[field] = getCookie(c, name);

        if (location === 'query') unsafe_input[field] = c.req.query(name);

        if (location === 'path') unsafe_input[field] = c.req.param(name);
      }
    }

    const input = await safeParseAsync(requestSchema, unsafe_input);
    if (!input.success) throw Object.assign(input.error, { source: 'request' satisfies ZodErrorSource });

    const unsafe_output = await fn(input.data, c);
    const output = await safeParseAsync(responseSchema, unsafe_output);
    if (!output.success) throw Object.assign(output.error, { source: 'response' satisfies ZodErrorSource });
    return c.json(output.data);
  };
};

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof ApplicationError) {
    const body: Record<string, unknown> = { code: err.code, message: err.message || err.code };

    if (err.payload !== undefined) body.payload = err.payload;
    return c.json(body, err.status as any);
  }

  if (err instanceof $ZodError || ('issues' in err && 'source' in (err as any))) {
    const source = (err as any).source ?? 'request';

    if (source === 'request') {
      const appError = new ApplicationError(400, 'VALIDATION_ERROR', 'Validation error on request', err as $ZodError);
      return c.json({ code: appError.code, message: appError.message, payload: appError.payload }, 400);
    }

    console.error('API Response Schema Violation:', err);

    return c.json(
      { code: 'RESPONSE_VALIDATION_ERROR', message: 'Internal server error (response format mismatch)' },
      500,
    );
  }

  console.error('Unhandled error:', err);
  return c.json({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal Server Error' }, 500);
};
