import { BadRequestException, Logger, UnauthorizedException } from '@nestjs/common';
import { QueryFailedError, Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { BcryptPasswordService } from './bcrypt-password.service';
import { JwtTokenService } from './jwt-token.service';
import { User } from '../repository/user.entity';
import { DEFAULT_USER_ROLE } from '../enums/user-role.enum';
import { LoginDto } from '../controller/dto/login.dto';
import { SignupDto } from '../controller/dto/signup.dto';
import {
  EMAIL_ALREADY_REGISTERED_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
} from '../utils/normalize-email';

type UserFixture = {
  id: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  deletedAt: Date | null;
};

const buildUniqueViolation = (): QueryFailedError => {
  const driverError = Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
  });
  return new QueryFailedError('INSERT INTO users...', [], driverError);
};

const buildAuthService = (options: {
  users?: UserFixture[];
  uniqueViolation?: boolean;
}): {
  service: AuthService;
  users: jest.Mock;
  insert: jest.Mock;
  queryBuilder: {
    addSelect: jest.Mock;
    where: jest.Mock;
    withDeleted: jest.Mock;
    getOne: jest.Mock;
  };
  passwordHash: jest.Mock;
  passwordVerify: jest.Mock;
  jwtSign: jest.Mock;
  warnSpy: jest.SpyInstance;
} => {
  const usersState: UserFixture[] = options.users ? [...options.users] : [];
  const getOne = jest.fn().mockImplementation(async () => {
    return usersState[0] ?? null;
  });
  const where = jest.fn().mockReturnThis();
  const withDeleted = jest.fn().mockReturnThis();
  const addSelect = jest.fn().mockReturnThis();
  const queryBuilder = { addSelect, where, withDeleted, getOne };

  const usersRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    insert: jest.fn().mockImplementation(async () => {
      if (options.uniqueViolation) {
        throw buildUniqueViolation();
      }

      const lastCall =
        usersRepository.insert.mock.calls[usersRepository.insert.mock.calls.length - 1];
      const data = lastCall?.[0] as
        | { email: string; passwordHash: string; role: 'admin' | 'user' }
        | undefined;
      if (data) {
        usersState.push({
          id: String(usersState.length + 1),
          email: data.email,
          passwordHash: data.passwordHash,
          role: data.role,
          deletedAt: null,
        });
      }
    }),
  };

  const passwordHash = jest.fn().mockResolvedValue('$2b$10$hashed');
  const passwordVerify = jest.fn().mockResolvedValue(true);
  const passwordService = {
    hash: passwordHash,
    verify: passwordVerify,
  } as unknown as BcryptPasswordService;

  const jwtSign = jest.fn().mockReturnValue('signed.jwt');
  const jwtTokenService = { sign: jwtSign } as unknown as JwtTokenService;

  const service = new AuthService(
    usersRepository as unknown as Repository<User>,
    passwordService,
    jwtTokenService,
  );

  return {
    service,
    users: usersRepository as unknown as jest.Mock,
    insert: usersRepository.insert as unknown as jest.Mock,
    queryBuilder,
    passwordHash,
    passwordVerify,
    jwtSign,
    warnSpy: jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined),
  };
};

describe('AuthService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('signup', () => {
    it('normalizes the email and inserts a user with role "user" and a hashed password', async () => {
      const ctx = buildAuthService({});
      const dto: SignupDto = { email: '  Foo@Example.COM  ', password: 'StrongP4ssw0rd#' };

      await ctx.service.signup(dto);

      expect(ctx.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'foo@example.com',
          role: DEFAULT_USER_ROLE,
          passwordHash: expect.stringMatching(/^\$2[aby]\$\d{2}\$/),
        }),
      );

      const insertArg = ctx.insert.mock.calls[0]?.[0] as { role: string };
      expect(insertArg.role).toBe('user');
    });

    it('hashes the password via BcryptPasswordService (never stores the plain text)', async () => {
      const ctx = buildAuthService({});
      const dto: SignupDto = { email: 'foo@bar.com', password: 'StrongP4ssw0rd#' };

      await ctx.service.signup(dto);

      expect(ctx.passwordHash).toHaveBeenCalledWith('StrongP4ssw0rd#');
      const insertArg = ctx.insert.mock.calls[0]?.[0] as { passwordHash: string };
      expect(insertArg.passwordHash).not.toBe('StrongP4ssw0rd#');
      expect(insertArg.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    });

    it('throws BadRequestException with the generic message when the email is already registered', async () => {
      const ctx = buildAuthService({ uniqueViolation: true });
      const dto: SignupDto = { email: 'foo@bar.com', password: 'StrongP4ssw0rd#' };

      await expect(ctx.service.signup(dto)).rejects.toBeInstanceOf(BadRequestException);

      try {
        await ctx.service.signup(dto);
      } catch (caught) {
        const exception = caught as BadRequestException;
        const response = exception.getResponse() as Record<string, unknown>;
        expect(response).toMatchObject({
          error: 'Bad Request',
          message: EMAIL_ALREADY_REGISTERED_MESSAGE,
          details: null,
        });
      }
    });

    it('throws BadRequestException with the generic message when the normalized email fails the regex', async () => {
      const ctx = buildAuthService({});
      const dto: SignupDto = { email: 'no-at-sign', password: 'StrongP4ssw0rd#' };

      try {
        await ctx.service.signup(dto);
        throw new Error('expected rejection');
      } catch (caught) {
        const exception = caught as BadRequestException;
        const response = exception.getResponse() as Record<string, unknown>;
        expect(response).toMatchObject({
          error: 'Bad Request',
          message: EMAIL_ALREADY_REGISTERED_MESSAGE,
          details: null,
        });
      }

      expect(ctx.insert).not.toHaveBeenCalled();
    });

    it('rethrows non-unique DB errors (e.g. connection lost) without swallowing them', async () => {
      const ctx = buildAuthService({});
      ctx.insert.mockRejectedValueOnce(new Error('connection lost'));

      await expect(
        ctx.service.signup({ email: 'foo@bar.com', password: 'StrongP4ssw0rd#' }),
      ).rejects.toThrow('connection lost');
    });
  });

  describe('login', () => {
    it('returns an accessToken on successful authentication', async () => {
      const ctx = buildAuthService({
        users: [
          {
            id: '42',
            email: 'foo@bar.com',
            passwordHash: '$2b$10$hash',
            role: 'user',
            deletedAt: null,
          },
        ],
      });

      const dto: LoginDto = { email: 'foo@bar.com', password: 'CorrectP4ssw0rd#' };

      const result = await ctx.service.login(dto);

      expect(result).toEqual({ accessToken: 'signed.jwt' });
      expect(ctx.jwtSign).toHaveBeenCalledWith({ sub: '42', role: 'user' });
    });

    it('normalizes the email before querying (case-insensitive login)', async () => {
      const ctx = buildAuthService({
        users: [
          {
            id: '1',
            email: 'foo@bar.com',
            passwordHash: '$2b$10$hash',
            role: 'user',
            deletedAt: null,
          },
        ],
      });
      ctx.queryBuilder.getOne.mockImplementation(async () => {
        return ctx.queryBuilder.where.mock.calls[0]?.[1]?.['email'] === 'foo@bar.com'
          ? {
              id: '1',
              email: 'foo@bar.com',
              passwordHash: '$2b$10$hash',
              role: 'user',
              deletedAt: null,
            }
          : null;
      });
      const dto: LoginDto = { email: '  FOO@BAR.COM  ', password: 'x' };

      const result = await ctx.service.login(dto);

      expect(result.accessToken).toBe('signed.jwt');
      expect(ctx.queryBuilder.where).toHaveBeenCalledWith('user.email = :email', {
        email: 'foo@bar.com',
      });
    });

    it('throws 401 with the same message when the user does not exist (anti-enumeration)', async () => {
      const ctx = buildAuthService({ users: [] });
      const dto: LoginDto = { email: 'nonexistent@bar.com', password: 'whatever' };

      try {
        await ctx.service.login(dto);
        throw new Error('expected rejection');
      } catch (caught) {
        const exception = caught as UnauthorizedException;
        const response = exception.getResponse() as Record<string, unknown>;
        expect(exception.getStatus()).toBe(401);
        expect(response).toMatchObject({
          error: 'Unauthorized',
          message: INVALID_CREDENTIALS_MESSAGE,
          details: null,
        });
      }

      expect(ctx.passwordVerify).toHaveBeenCalled();

      expect(ctx.jwtSign).not.toHaveBeenCalled();

      expect(ctx.warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid_credentials'));
    });

    it('throws 401 with the same message when the password is wrong (anti-enumeration)', async () => {
      const ctx = buildAuthService({
        users: [
          {
            id: '1',
            email: 'foo@bar.com',
            passwordHash: '$2b$10$hash',
            role: 'user',
            deletedAt: null,
          },
        ],
      });
      ctx.passwordVerify.mockResolvedValue(false);
      const dto: LoginDto = { email: 'foo@bar.com', password: 'wrong' };

      try {
        await ctx.service.login(dto);
        throw new Error('expected rejection');
      } catch (caught) {
        const exception = caught as UnauthorizedException;
        expect(exception.getStatus()).toBe(401);
        const response = exception.getResponse() as Record<string, unknown>;
        expect(response).toMatchObject({
          error: 'Unauthorized',
          message: INVALID_CREDENTIALS_MESSAGE,
        });
      }

      expect(ctx.jwtSign).not.toHaveBeenCalled();
      expect(ctx.warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid_credentials'));
    });

    it('throws 401 with the same message when the account is soft-deleted (anti-enumeration)', async () => {
      const ctx = buildAuthService({
        users: [
          {
            id: '1',
            email: 'foo@bar.com',
            passwordHash: '$2b$10$hash',
            role: 'user',
            deletedAt: new Date(),
          },
        ],
      });
      const dto: LoginDto = { email: 'foo@bar.com', password: 'any' };

      try {
        await ctx.service.login(dto);
        throw new Error('expected rejection');
      } catch (caught) {
        const exception = caught as UnauthorizedException;
        const response = exception.getResponse() as Record<string, unknown>;
        expect(exception.getStatus()).toBe(401);
        expect(response).toMatchObject({
          error: 'Unauthorized',
          message: INVALID_CREDENTIALS_MESSAGE,
          details: null,
        });
      }

      expect(ctx.warnSpy).toHaveBeenCalledWith(expect.stringContaining('account_disabled'));
    });

    it('includes the user id in the log only when the user exists (no PII leak for non-existent users)', async () => {
      const ctx = buildAuthService({ users: [] });

      await expect(
        ctx.service.login({ email: 'foo@bar.com', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const logCall = ctx.warnSpy.mock.calls[0]?.[0] as string;
      expect(logCall).toContain('invalid_credentials');
      expect(logCall).not.toContain('userId=');
    });
  });
});
