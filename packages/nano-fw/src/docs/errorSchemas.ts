import { z } from 'zod';

export const ApplicationErrorSchema = z
  .object({
    code: z.string().meta({ example: 'NOT_FOUND' }),
    message: z.string().meta({ example: 'Resource not found' }),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .meta({ id: 'ErrorResponse' });

export const ValidationErrorSchema = ApplicationErrorSchema.extend({
  code: z.string().meta({ example: 'VALIDATION_ERROR' }),
  message: z.string().meta({ example: 'Validation error on request' }),
  payload: z
    .object({
      issues: z.array(
        z.object({
          path: z.string().meta({ example: 'email' }),
          message: z.string().meta({ example: 'Invalid email' }),
        }),
      ),
    })
    .optional(),
}).meta({ id: 'ValidationError' });
