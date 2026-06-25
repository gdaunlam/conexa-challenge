import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { BcryptPasswordService } from './bcrypt-password.service';

describe('BcryptPasswordService', () => {
  const FAST_COST = 4;

  const buildService = (cost: number = FAST_COST): BcryptPasswordService => {
    const configService = {
      get: jest.fn().mockReturnValue({ cost }),
    } as unknown as ConfigService;
    return new BcryptPasswordService(configService);
  };

  it('throws when the bcrypt config is not available (defensive)', () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    expect(() => new BcryptPasswordService(configService)).toThrow(/bcrypt config/);
  });

  it('hashes a password into a non-empty bcrypt string', async () => {
    const service = buildService();

    const hashed = await service.hash('StrongP4ssw0rd#');

    expect(hashed).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
    expect(hashed).not.toBe('StrongP4ssw0rd#');
  });

  it('produces a different hash for the same input (salt aleatorio)', async () => {
    const service = buildService();
    const first = await service.hash('StrongP4ssw0rd#');
    const second = await service.hash('StrongP4ssw0rd#');

    expect(first).not.toBe(second);
    expect(await service.verify('StrongP4ssw0rd#', first)).toBe(true);
    expect(await service.verify('StrongP4ssw0rd#', second)).toBe(true);
  });

  it('verify returns true for the original password and false for a different one', async () => {
    const service = buildService();
    const hashed = await service.hash('CorrectHorseBatteryStaple1!');

    await expect(service.verify('CorrectHorseBatteryStaple1!', hashed)).resolves.toBe(true);
    await expect(service.verify('WrongHorseBatteryStaple1!', hashed)).resolves.toBe(false);
  });

  it('verify returns false (not throws) for an invalid hash string', async () => {
    const service = buildService();

    await expect(service.verify('any', 'not-a-bcrypt-hash')).resolves.toBe(false);
    await expect(service.verify('any', '')).resolves.toBe(false);
  });

  it('reads the cost from the ConfigService (not a hardcoded constant)', async () => {
    const service = buildService(6);
    const hashed = await service.hash('test');

    expect(hashed).toMatch(/^\$2[aby]\$06\$/);
  });

  it('verifies hashes generated with a different cost (bcrypt cost-agnostic verify)', async () => {
    const externalHash = await bcrypt.hash('mypassword', 8);
    const service = buildService(4);

    await expect(service.verify('mypassword', externalHash)).resolves.toBe(true);
    await expect(service.verify('wrong', externalHash)).resolves.toBe(false);
  });
});
