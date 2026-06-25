import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { LoginDto } from './login.dto';
import { SignupDto } from './signup.dto';

interface FlattenedError {
  field: string;
  constraint: string;
  message: string;
}

const validateDto = async <T extends object>(
  dtoClass: new () => T,
  payload: Record<string, unknown>,
): Promise<FlattenedError[]> => {
  const instance = plainToInstance(dtoClass, payload);
  const errors = await validate(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errors.flatMap((error: ValidationError) =>
    Object.entries(error.constraints ?? {}).map(
      ([constraint, message]): FlattenedError => ({
        field: error.property,
        constraint,
        message,
      }),
    ),
  );
};

const validSignupPayload = {
  email: 'foo@example.com',
  name: 'Foo Bar',
  password: 'StrongP4ssw0rd#',
};

describe('SignupDto', () => {
  it('accepts a canonical payload', async () => {
    const errors = await validateDto(SignupDto, validSignupPayload);
    expect(errors).toEqual([]);
  });

  it('rejects an empty email', async () => {
    const errors = await validateDto(SignupDto, { ...validSignupPayload, email: '' });
    expect(errors.some((error) => error.field === 'email')).toBe(true);
  });

  it('rejects an email shorter than 5 chars', async () => {
    const errors = await validateDto(SignupDto, { ...validSignupPayload, email: 'a@b' });
    expect(
      errors.some((error) => error.field === 'email' && error.constraint === 'minLength'),
    ).toBe(true);
  });

  it('rejects an email exceeding 254 chars', async () => {
    const localPart = 'a'.repeat(250);
    const errors = await validateDto(SignupDto, {
      ...validSignupPayload,
      email: `${localPart}@b.io`,
    });
    expect(
      errors.some((error) => error.field === 'email' && error.constraint === 'maxLength'),
    ).toBe(true);
  });

  it('normalizes uppercase email to lowercase before regex validation', async () => {
    const errors = await validateDto(SignupDto, {
      ...validSignupPayload,
      email: 'FOO@BAR.COM',
    });
    expect(errors).toEqual([]);
  });

  it('rejects email with invalid format post-normalize', async () => {
    const errors = await validateDto(SignupDto, {
      ...validSignupPayload,
      email: 'no-at-sign',
    });
    expect(
      errors.some((error) => error.field === 'email' && error.constraint === 'matches'),
    ).toBe(true);
  });

  it('rejects an empty name', async () => {
    const errors = await validateDto(SignupDto, { ...validSignupPayload, name: '' });
    expect(errors.some((error) => error.field === 'name')).toBe(true);
  });

  it('rejects a name shorter than 2 chars', async () => {
    const errors = await validateDto(SignupDto, { ...validSignupPayload, name: 'a' });
    expect(
      errors.some((error) => error.field === 'name' && error.constraint === 'minLength'),
    ).toBe(true);
  });

  it('rejects a name longer than 100 chars', async () => {
    const errors = await validateDto(SignupDto, {
      ...validSignupPayload,
      name: 'a'.repeat(101),
    });
    expect(
      errors.some((error) => error.field === 'name' && error.constraint === 'maxLength'),
    ).toBe(true);
  });

  it('rejects a password shorter than 8 chars', async () => {
    const errors = await validateDto(SignupDto, { ...validSignupPayload, password: 'Ab1!' });
    expect(
      errors.some((error) => error.field === 'password' && error.constraint === 'minLength'),
    ).toBe(true);
  });

  it('rejects a password longer than 64 chars', async () => {
    const errors = await validateDto(SignupDto, {
      ...validSignupPayload,
      password: 'A'.repeat(60) + 'b1!xx',
    });
    expect(
      errors.some((error) => error.field === 'password' && error.constraint === 'maxLength'),
    ).toBe(true);
  });

  it('rejects a password without lowercase', async () => {
    const errors = await validateDto(SignupDto, { ...validSignupPayload, password: 'STRONG123!' });
    expect(
      errors.some((error) => error.field === 'password' && error.constraint === 'matches'),
    ).toBe(true);
  });

  it('rejects a password without uppercase', async () => {
    const errors = await validateDto(SignupDto, { ...validSignupPayload, password: 'strong123!' });
    expect(
      errors.some((error) => error.field === 'password' && error.constraint === 'matches'),
    ).toBe(true);
  });

  it('rejects a password without digit', async () => {
    const errors = await validateDto(SignupDto, { ...validSignupPayload, password: 'StrongPwd!' });
    expect(
      errors.some((error) => error.field === 'password' && error.constraint === 'matches'),
    ).toBe(true);
  });

  it('rejects a password without special char', async () => {
    const errors = await validateDto(SignupDto, { ...validSignupPayload, password: 'Strong1234' });
    expect(
      errors.some((error) => error.field === 'password' && error.constraint === 'matches'),
    ).toBe(true);
  });

  it('rejects an unknown field (whitelist enforcement)', async () => {
    const errors = await validateDto(SignupDto, {
      ...validSignupPayload,
      role: 'admin',
    });
    expect(
      errors.some((error) => error.field === 'role' && error.constraint === 'whitelistValidation'),
    ).toBe(true);
  });
});

describe('LoginDto', () => {
  it('accepts a canonical payload (email gets normalized, password is not)', async () => {
    const errors = await validateDto(LoginDto, {
      email: 'FOO@BAR.COM',
      password: 'anypassword',
    });
    expect(errors).toEqual([]);
  });

  it('rejects an empty email', async () => {
    const errors = await validateDto(LoginDto, { email: '', password: 'x' });
    expect(errors.some((error) => error.field === 'email')).toBe(true);
  });

  it('rejects an empty password', async () => {
    const errors = await validateDto(LoginDto, { email: 'foo@bar.com', password: '' });
    expect(errors.some((error) => error.field === 'password')).toBe(true);
  });

  it('rejects an email exceeding 254 chars', async () => {
    const localPart = 'a'.repeat(250);
    const errors = await validateDto(LoginDto, {
      email: `${localPart}@b.io`,
      password: 'x',
    });
    expect(
      errors.some((error) => error.field === 'email' && error.constraint === 'maxLength'),
    ).toBe(true);
  });

  it('rejects an email shorter than 5 chars', async () => {
    const errors = await validateDto(LoginDto, { email: 'a@b', password: 'x' });
    expect(
      errors.some((error) => error.field === 'email' && error.constraint === 'minLength'),
    ).toBe(true);
  });

  it('rejects an email with invalid format', async () => {
    const errors = await validateDto(LoginDto, { email: 'no-at-sign', password: 'x' });
    expect(
      errors.some((error) => error.field === 'email' && error.constraint === 'matches'),
    ).toBe(true);
  });

  it('rejects a password exceeding 64 chars', async () => {
    const errors = await validateDto(LoginDto, {
      email: 'foo@bar.com',
      password: 'A'.repeat(60) + 'b1!xx',
    });
    expect(
      errors.some((error) => error.field === 'password' && error.constraint === 'maxLength'),
    ).toBe(true);
  });

  it('does not enforce password strength (legacy users keep access)', async () => {
    const errors = await validateDto(LoginDto, {
      email: 'foo@bar.com',
      password: 'weak',
    });
    expect(errors).toEqual([]);
  });
});
