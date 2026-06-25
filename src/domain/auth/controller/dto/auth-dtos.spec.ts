import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { LoginResponseDto } from './login-response.dto';
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

describe('SignupDto', () => {
  it('accepts a canonical payload', async () => {
    const errors = await validateDto(SignupDto, {
      email: 'foo@example.com',
      password: 'StrongP4ssw0rd#',
    });
    expect(errors).toEqual([]);
  });

  it('rejects an empty email', async () => {
    const errors = await validateDto(SignupDto, {
      email: '',
      password: 'StrongP4ssw0rd#',
    });
    expect(errors.some((error) => error.field === 'email')).toBe(true);
  });

  it('rejects an email exceeding 255 chars', async () => {
    const localPart = 'a'.repeat(251);
    const errors = await validateDto(SignupDto, {
      email: `${localPart}@b.io`,
      password: 'StrongP4ssw0rd#',
    });
    expect(
      errors.some((error) => error.field === 'email' && error.constraint === 'maxLength'),
    ).toBe(true);
  });

  it('does NOT validate email format (validation lives in AuthService post-normalize)', async () => {
    const errors = await validateDto(SignupDto, {
      email: 'FOO@BAR.COM',
      password: 'StrongP4ssw0rd#',
    });
    expect(errors).toEqual([]);
  });

  it('rejects a password shorter than 8 chars', async () => {
    const errors = await validateDto(SignupDto, {
      email: 'foo@bar.com',
      password: 'Ab1!',
    });
    expect(
      errors.some((error) => error.field === 'password' && error.constraint === 'minLength'),
    ).toBe(true);
  });

  it('rejects a password longer than 64 chars', async () => {
    const errors = await validateDto(SignupDto, {
      email: 'foo@bar.com',
      password: 'A'.repeat(60) + 'b1!xx',
    });
    expect(
      errors.some((error) => error.field === 'password' && error.constraint === 'maxLength'),
    ).toBe(true);
  });

  it('rejects a password without lowercase', async () => {
    const errors = await validateDto(SignupDto, {
      email: 'foo@bar.com',
      password: 'STRONG123!',
    });
    expect(
      errors.some((error) => error.field === 'password' && error.constraint === 'matches'),
    ).toBe(true);
  });

  it('rejects a password without uppercase', async () => {
    const errors = await validateDto(SignupDto, {
      email: 'foo@bar.com',
      password: 'strong123!',
    });
    expect(
      errors.some((error) => error.field === 'password' && error.constraint === 'matches'),
    ).toBe(true);
  });

  it('rejects a password without digit', async () => {
    const errors = await validateDto(SignupDto, {
      email: 'foo@bar.com',
      password: 'StrongPwd!',
    });
    expect(
      errors.some((error) => error.field === 'password' && error.constraint === 'matches'),
    ).toBe(true);
  });

  it('rejects a password without special char', async () => {
    const errors = await validateDto(SignupDto, {
      email: 'foo@bar.com',
      password: 'Strong1234',
    });
    expect(
      errors.some((error) => error.field === 'password' && error.constraint === 'matches'),
    ).toBe(true);
  });

  it('rejects an unknown field (whitelist enforcement)', async () => {
    const errors = await validateDto(SignupDto, {
      email: 'foo@bar.com',
      password: 'StrongP4ssw0rd#',
      role: 'admin',
    });

    expect(
      errors.some((error) => error.field === 'role' && error.constraint === 'whitelistValidation'),
    ).toBe(true);
  });
});

describe('LoginDto', () => {
  it('accepts a canonical payload (email does not need to be normalized)', async () => {
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

  it('rejects an email exceeding 255 chars', async () => {
    const errors = await validateDto(LoginDto, {
      email: `${'a'.repeat(251)}@b.io`,
      password: 'x',
    });
    expect(
      errors.some((error) => error.field === 'email' && error.constraint === 'maxLength'),
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

describe('LoginResponseDto', () => {
  it('exposes only the accessToken field', () => {
    const dto = new LoginResponseDto();
    dto.accessToken = 'jwt-value';

    expect(JSON.stringify(dto)).toBe(JSON.stringify({ accessToken: 'jwt-value' }));
  });
});
