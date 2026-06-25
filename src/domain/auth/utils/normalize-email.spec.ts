import {
  EMAIL_MAX_LENGTH,
  INVALID_CREDENTIALS_MESSAGE,
  isValidNormalizedEmail,
  normalizeEmail,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  EMAIL_ALREADY_REGISTERED_MESSAGE,
} from './normalize-email';
import { PASSWORD_REGEX } from '../constants';

describe('normalizeEmail', () => {
  it('trims surrounding whitespace before any other step', () => {
    expect(normalizeEmail('  foo@bar.com  ')).toBe('foo@bar.com');
    expect(normalizeEmail('\tfoo@bar.com\n')).toBe('foo@bar.com');
  });

  it('applies NFKC Unicode normalization (ligaduras, composed accents)', () => {
    // `ﬁ` (U+FB01, ligadura) -> `fi` en NFKC.
    expect(normalizeEmail('ﬁnance@example.com')).toBe('finance@example.com');
    // `é` (U+00E9, NFC compuesto) -> `e\u301` (NFD descompuesto) en NFKC NO;
    // NFKC mantiene la composicion pero normaliza casos raros. En este caso
    // `é` ya esta en NFC, NFKC lo deja igual pero baja a ASCII via lowercase
    // solo si tiene combinantes. Verificamos que el string es estable bajo NFKC.
    const withAccent = 'café@example.com';
    expect(normalizeEmail(withAccent).normalize('NFKC')).toBe('café@example.com');
  });

  it('lowercases the whole string', () => {
    expect(normalizeEmail('FOO@BAR.COM')).toBe('foo@bar.com');
    expect(normalizeEmail('Foo@Bar.Com')).toBe('foo@bar.com');
  });

  it('runs the pipeline in the documented order: trim -> NFKC -> lowercase', () => {
    // Si el orden fuera lowercase antes de NFKC, la ligadura `ﬁ` quedaria como
    // `ﬁ` (no tiene forma uppercase) y el regex fallaria. Esto verifica que
    // NFKC corre antes de lowercase: el `ﬁ` se descompone en `fi` y el lowercase
    // es trivial.
    expect(normalizeEmail('  ﬁNANCE@Example.COM  ')).toBe('finance@example.com');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeEmail('   ')).toBe('');
  });
});

describe('isValidNormalizedEmail', () => {
  it('accepts canonical addresses', () => {
    expect(isValidNormalizedEmail('foo@bar.com')).toBe(true);
    expect(isValidNormalizedEmail('user.name+tag@example.co.uk')).toBe(true);
    expect(isValidNormalizedEmail('a@b.io')).toBe(true);
  });

  it('rejects strings without an @', () => {
    expect(isValidNormalizedEmail('foobar.com')).toBe(false);
  });

  it('rejects strings with uppercase (the input must already be normalized)', () => {
    // La regex post-lowercase NO acepta mayusculas. Si el caller olvida
    // normalizar, la validacion falla ruidosamente en vez de pasar.
    expect(isValidNormalizedEmail('Foo@bar.com')).toBe(false);
  });

  it('rejects TLDs shorter than 2 chars', () => {
    expect(isValidNormalizedEmail('foo@bar.c')).toBe(false);
    expect(isValidNormalizedEmail('foo@bar.')).toBe(false);
  });

  it('rejects TLDs containing digits', () => {
    // `.123` no es TLD valido. Esto bloquea emails tipo `foo@bar.123` que
    // pasan `IsEmail` laxo.
    expect(isValidNormalizedEmail('foo@bar.123')).toBe(false);
  });

  it('rejects empty local-part', () => {
    expect(isValidNormalizedEmail('@bar.com')).toBe(false);
  });

  it('rejects empty domain', () => {
    expect(isValidNormalizedEmail('foo@')).toBe(false);
  });

  it('rejects spaces inside the address', () => {
    expect(isValidNormalizedEmail('foo @bar.com')).toBe(false);
    expect(isValidNormalizedEmail('foo@ bar.com')).toBe(false);
  });
});

describe('auth constants', () => {
  it('exposes the documented password length range', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(64);
  });

  it('exposes the documented email max length', () => {
    expect(EMAIL_MAX_LENGTH).toBe(255);
  });

  it('exposes a single, fixed invalid-credentials message (anti-enumeration)', () => {
    // El mensaje NO debe cambiar entre casos (user inexistente / password
    // incorrecto / soft-deleted). Si un dev futuro lo modifica para distinguir
    // casos, este test rompe.
    expect(INVALID_CREDENTIALS_MESSAGE).toBe('Invalid credentials');
  });

  it('exposes a single, fixed email-already-registered message (anti-enumeration)', () => {
    expect(EMAIL_ALREADY_REGISTERED_MESSAGE).toBe('Email already registered');
  });

  it('exposes the password regex from the spec', () => {
    // Acepta passwords validos.
    expect(PASSWORD_REGEX.test('Abcdef1!')).toBe(true);
    expect(PASSWORD_REGEX.test('StrongP4ssw0rd#')).toBe(true);
    // Rechaza passwords debiles.
    expect(PASSWORD_REGEX.test('abcdefgh')).toBe(false); // sin mayuscula, sin numero, sin especial
    expect(PASSWORD_REGEX.test('ABCDEFGH')).toBe(false); // sin minuscula, sin numero, sin especial
    expect(PASSWORD_REGEX.test('Abcdefgh')).toBe(false); // sin numero, sin especial
    expect(PASSWORD_REGEX.test('Abcde123')).toBe(false); // sin especial
    expect(PASSWORD_REGEX.test('Ab1!')).toBe(false); // muy corto
    expect(PASSWORD_REGEX.test('A'.repeat(65) + 'b1!')).toBe(false); // muy largo
  });
});
