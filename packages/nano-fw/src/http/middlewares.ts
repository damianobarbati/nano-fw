import type { Context, ErrorHandler } from 'hono';
import { ZodError, type ZodType } from 'zod';
import { AppError } from '../AppError.ts';

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
  requestSchema: ZodType<TRequest>,
  responseSchema: ZodType<TResponse>,
  fn: (params: TRequest, c: Context) => Promise<TResponse> | TResponse,
) => {
  return async (c: Context) => {
    const unsafe_input = await requestToParams(c);
    const input = await requestSchema.safeParseAsync(unsafe_input);
    if (!input.success) throw Object.assign(input.error, { source: 'request' satisfies ZodErrorSource });

    const unsafe_output = await fn(input.data, c);
    const output = await responseSchema.safeParseAsync(unsafe_output);
    if (!output.success) throw Object.assign(output.error, { source: 'response' satisfies ZodErrorSource });
    return c.json(output.data);
  };
};

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = { code: err.code, message: err.message || err.code };

    if (err.payload !== undefined) body.payload = err.payload;
    return c.json(body, err.status as any);
  }

  if (err instanceof ZodError || ('issues' in err && 'source' in (err as any))) {
    const source = (err as any).source ?? 'request';

    if (source === 'request') {
      const appError = new AppError(400, 'VALIDATION_ERROR', 'Validation error on request', err as ZodError);
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
