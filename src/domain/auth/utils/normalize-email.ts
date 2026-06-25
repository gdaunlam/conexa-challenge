import { EMAIL_REGEX } from '../constants';

export const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';

export const EMAIL_ALREADY_REGISTERED_MESSAGE = 'Email already registered';

export const EMAIL_MAX_LENGTH = 255;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

export function normalizeEmail(rawEmail: string): string {
  return rawEmail.trim().normalize('NFKC').toLowerCase();
}

export function isValidNormalizedEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}
