import { ZodError } from 'zod';

export type ValidationErrorPayload = { issues?: Array<{ path: string; message: string }> };

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

    Error.captureStackTrace?.(this, this.constructor);
  }
}
