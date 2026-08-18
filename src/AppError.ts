import { ZodError } from 'zod';
import z from '#framework/zod.ts';

export type ErrorRegistry = Record<string, string | ((data: any) => string)>;

export type ValidationErrorPayload = {
  issues?: Array<{ path: string; message: string }>;
};

const normalizeZodError = (error: ZodError): ValidationErrorPayload => ({
  issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
});

export class AppError<TCode extends string = string> extends Error {
  public readonly status: number;
  public readonly code: TCode;
  public readonly payload?: Record<string, unknown> | ValidationErrorPayload;

  constructor(status: number, code: TCode, message?: string, payload?: Record<string, unknown> | ZodError) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.payload = payload instanceof ZodError ? normalizeZodError(payload) : payload;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace?.(this, this.constructor);
  }

  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', code = 'BAD_REQUEST', payload?: Record<string, unknown> | ZodError) {
    super(400, code, message, payload);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', code = 'UNAUTHORIZED', payload?: Record<string, unknown>) {
    super(401, code, message, payload);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', code = 'FORBIDDEN', payload?: Record<string, unknown>) {
    super(403, code, message, payload);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND', payload?: Record<string, unknown>) {
    super(404, code, message, payload);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', code = 'CONFLICT', payload?: Record<string, unknown>) {
    super(409, code, message, payload);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = 'Unprocessable Entity', code = 'UNPROCESSABLE_ENTITY', payload?: Record<string, unknown>) {
    super(422, code, message, payload);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal Server Error', code = 'INTERNAL_SERVER_ERROR', payload?: Record<string, unknown>) {
    super(500, code, message, payload);
  }
}

export const createAppErrorFactory = <T extends ErrorRegistry>(registry: T) => {
  return <K extends keyof T & string>(
    status: number,
    code: K,
    data?: T[K] extends (data: infer D) => string ? D : never,
    payload?: Record<string, unknown> | ZodError,
  ): AppError<K> => {
    const entry = registry[code];
    const message = typeof entry === 'function' ? entry(data as any) : (entry as string);
    return new AppError(status, code, message, payload);
  };
};

export const AppErrorSchema = z
  .object({
    code: z.string().openapi({ example: 'NOT_FOUND' }),
    message: z.string().openapi({ example: 'Resource not found' }),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .openapi('ErrorResponse');

export const ValidationErrorSchema = z
  .object({
    code: z.string().openapi({ example: 'VALIDATION_ERROR' }),
    message: z.string().openapi({ example: 'Validation error on request' }),
    payload: z
      .object({
        issues: z.array(
          z.object({
            path: z.string().openapi({ example: 'email' }),
            message: z.string().openapi({ example: 'Invalid email' }),
          }),
        ),
      })
      .optional(),
  })
  .openapi('ValidationError');
