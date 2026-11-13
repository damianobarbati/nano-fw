import { AppError, registerErrors } from 'nano-fw/docs';

export const UNAUTHORIZED = new AppError(401, 'UNAUTHORIZED', 'Authorization header is required.');

export const AUTH_INVALID_CREDENTIALS = new AppError(401, 'AUTH_INVALID_CREDENTIALS', 'Invalid email or password.');

export const AUTH_EMAIL_NOT_FOUND = ({ email }: { email: string }) =>
  new AppError(401, 'AUTH_EMAIL_NOT_FOUND', `The email ${email} was not found.`);

export const USER_EMAIL_EXISTS = (email: string) =>
  new AppError(409, 'USER_EMAIL_EXISTS', `The email ${email} already exists.`);

export const ERRORS = {
  UNAUTHORIZED,
  AUTH_INVALID_CREDENTIALS,
  AUTH_EMAIL_NOT_FOUND: AUTH_EMAIL_NOT_FOUND({ email: '<email>' }),
  USER_EMAIL_EXISTS: USER_EMAIL_EXISTS('<email>'),
};

registerErrors(ERRORS);
