import { ZodError } from 'zod';

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
