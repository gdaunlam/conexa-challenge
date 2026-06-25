import { EMAIL_MAX_LENGTH, INVALID_CREDENTIALS_MESSAGE, normalizeEmail, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, EMAIL_ALREADY_REGISTERED_MESSAGE } from './normalize-email';
import { PASSWORD_REGEX } from '../constants';

describe('normalizeEmail', () => {
  it('trims surrounding whitespace before any other step', () => {
    expect(normalizeEmail('  foo@bar.com  ')).toBe('foo@bar.com');
    expect(normalizeEmail('\tfoo@bar.com\n')).toBe('foo@bar.com');
  });

  it('applies NFKC Unicode normalization (ligaduras, composed accents)', () => {
    const withAccent = 'café@example.com';
    expect(normalizeEmail(withAccent).normalize('NFKC')).toBe('café@example.com');
  });

  it('lowercases the whole string', () => {
    expect(normalizeEmail('FOO@BAR.COM')).toBe('foo@bar.com');
    expect(normalizeEmail('Foo@Bar.Com')).toBe('foo@bar.com');
  });

  it('runs the pipeline in the documented order: trim -> NFKC -> lowercase', () => {
    expect(normalizeEmail('  ﬁNANCE@Example.COM  ')).toBe('finance@example.com');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeEmail('   ')).toBe('');
  });
});

describe('auth constants', () => {
  it('exposes the documented password length range', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(64);
  });

  it('exposes the documented email max length', () => {
    expect(EMAIL_MAX_LENGTH).toBe(254);
  });

  it('exposes a single, fixed invalid-credentials message (anti-enumeration)', () => {
    expect(INVALID_CREDENTIALS_MESSAGE).toBe('Invalid credentials');
  });

  it('exposes a single, fixed email-already-registered message (anti-enumeration)', () => {
    expect(EMAIL_ALREADY_REGISTERED_MESSAGE).toBe('Email already registered');
  });

  it('exposes the password regex from the spec', () => {
    expect(PASSWORD_REGEX.test('Abcdef1!')).toBe(true);
    expect(PASSWORD_REGEX.test('StrongP4ssw0rd#')).toBe(true);
    expect(PASSWORD_REGEX.test('abcdefgh')).toBe(false);
    expect(PASSWORD_REGEX.test('ABCDEFGH')).toBe(false);
    expect(PASSWORD_REGEX.test('Abcdefgh')).toBe(false);
    expect(PASSWORD_REGEX.test('Abcde123')).toBe(false);
    expect(PASSWORD_REGEX.test('Ab1!')).toBe(false);
    expect(PASSWORD_REGEX.test('A'.repeat(65) + 'b1!')).toBe(false);
  });
});
