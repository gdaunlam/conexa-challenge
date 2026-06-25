import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtTokenService, JwtPayload } from './jwt-token.service';

describe('JwtTokenService', () => {
  const SECRET = 'a-long-enough-secret-for-tests-1234567890';
  const TTL = 3600;

  const buildService = (
    jwtService: Partial<JwtService>,
    configOverrides: { secret?: string; ttlSeconds?: number } = {},
  ): JwtTokenService => {
    const configService = {
      get: jest.fn().mockReturnValue({
        secret: configOverrides.secret ?? SECRET,
        ttlSeconds: configOverrides.ttlSeconds ?? TTL,
      }),
    } as unknown as ConfigService;
    return new JwtTokenService(jwtService as JwtService, configService);
  };

  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('throws when the jwt config is not available (defensive)', () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const jwtService = {} as JwtService;

    expect(() => new JwtTokenService(jwtService, configService)).toThrow(/jwt config/);
  });

  it('sign forwards the payload and config (secret + expiresIn) to the underlying JwtService', () => {
    const sign = jest.fn().mockReturnValue('signed.jwt.value');
    const service = buildService({ sign });

    const token = service.sign({ sub: '42', role: 'user' });

    expect(token).toBe('signed.jwt.value');
    expect(sign).toHaveBeenCalledWith(
      { sub: '42', role: 'user' },
      expect.objectContaining({ secret: SECRET, expiresIn: TTL }),
    );
  });

  it('sign threads the custom TTL through to the JwtService when config changes', () => {
    const sign = jest.fn().mockReturnValue('token');
    const service = buildService({ sign }, { ttlSeconds: 7200 });

    service.sign({ sub: '1', role: 'admin' });

    expect(sign).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ expiresIn: 7200 }),
    );
  });

  it('verify returns the payload when the underlying JwtService accepts the token', () => {
    const verify = jest.fn().mockReturnValue({ sub: '42', role: 'user' });
    const service = buildService({ verify });

    const payload = service.verify('valid.jwt');

    expect(payload).toEqual({ sub: '42', role: 'user' });
    expect(verify).toHaveBeenCalledWith('valid.jwt', expect.objectContaining({ secret: SECRET }));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('verify throws UnauthorizedException and logs token_expired when the JwtService rejects a TokenExpiredError', () => {
    const tokenExpiredError = new Error('jwt expired');
    tokenExpiredError.name = 'TokenExpiredError';
    const verify = jest.fn().mockImplementation(() => {
      throw tokenExpiredError;
    });
    const service = buildService({ verify });

    expect(() => service.verify('expired.jwt')).toThrow(UnauthorizedException);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/code=token_expired/);
  });

  it('verify throws UnauthorizedException and logs token_invalid for JsonWebTokenError (signature mismatch, malformed)', () => {
    const jwtError = new Error('invalid signature');
    jwtError.name = 'JsonWebTokenError';
    const verify = jest.fn().mockImplementation(() => {
      throw jwtError;
    });
    const service = buildService({ verify });

    expect(() => service.verify('bad.jwt')).toThrow(UnauthorizedException);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/code=token_invalid/);
  });

  it('verify logs token_invalid (fallback) for non-Error throws', () => {
    const verify = jest.fn().mockImplementation(() => {
      throw 'string error';
    });
    const service = buildService({ verify });

    expect(() => service.verify('weird.jwt')).toThrow(UnauthorizedException);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/code=token_invalid/);
  });

  it('exposes a JwtPayload type with the documented shape', () => {
    const payload: JwtPayload = { sub: '1', role: 'user' };
    expect(payload.sub).toBe('1');
    expect(payload.role).toBe('user');
  });
});
