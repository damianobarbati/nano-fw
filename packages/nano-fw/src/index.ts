export { ApplicationError, type ValidationErrorPayload } from './ApplicationError.ts';
export { ApplicationErrorSchema, ValidationErrorSchema } from './docs/errorSchemas.ts';
export type { RouteMeta } from './docs/openapi.ts';
export { registerSchema } from './docs/openapi.ts';
export { type RouteDocsOptions, routeDocs, type ScalarOptions } from './docs/registerDocsRoute.ts';
export type { ErrorCatalog } from './docs/registerErrors.ts';
export { errorHandler } from './http/middlewares.ts';
export { type HTTPMethod, type RouteOptions, route } from './http/registerRoute.ts';
