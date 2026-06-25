import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from '../service/auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let signup: jest.Mock;
  let login: jest.Mock;

  const buildModule = async (): Promise<void> => {
    signup = jest.fn().mockResolvedValue(undefined);
    login = jest.fn().mockResolvedValue({ accessToken: 'jwt-token-value' });
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: { signup, login },
        },
      ],
    }).compile();
    controller = moduleRef.get<AuthController>(AuthController);
  };

  it('delegates signup to the AuthService and returns void (Nest serializes as 204)', async () => {
    await buildModule();
    const dto = { email: 'foo@bar.com', password: 'StrongP4ssw0rd#' };

    const result = await controller.signup(dto);

    expect(signup).toHaveBeenCalledWith(dto);
    expect(result).toBeUndefined();
  });

  it('delegates login to the AuthService and returns the accessToken', async () => {
    await buildModule();
    const dto = { email: 'foo@bar.com', password: 'StrongP4ssw0rd#' };

    const result = await controller.login(dto);

    expect(login).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ accessToken: 'jwt-token-value' });
  });
});
