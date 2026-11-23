import { ApplicationError } from 'nano-fw';

export const UNAUTHORIZED = new ApplicationError(401, 'UNAUTHORIZED', 'Authorization header is required.');

export const AUTH_INVALID_CREDENTIALS = new ApplicationError(
  401,
  'AUTH_INVALID_CREDENTIALS',
  'Invalid email or password.',
);

export const USER_EMAIL_EXISTS = (email: string) =>
  new ApplicationError(409, 'USER_EMAIL_EXISTS', `The email ${email} already exists.`);

export const ERRORS = { UNAUTHORIZED, AUTH_INVALID_CREDENTIALS, USER_EMAIL_EXISTS: USER_EMAIL_EXISTS('<email>') };
