export const EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

export const EMAIL_MIN_LENGTH = 5;
export const EMAIL_MAX_LENGTH = 254;

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 100;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

export const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';
export const EMAIL_ALREADY_REGISTERED_MESSAGE = 'Email already registered';

export function normalizeEmail(rawEmail: string): string {
  return rawEmail.trim().normalize('NFKC').toLowerCase();
}
