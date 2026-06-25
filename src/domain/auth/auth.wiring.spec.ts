import { Controller, Get, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { AuthModule } from './auth.module';
import { AuthService } from './service/auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { BcryptPasswordService } from './service/bcrypt-password.service';
import { JwtTokenService } from './service/jwt-token.service';

const TEST_JWT_SECRET = 'test-jwt-secret-test-jwt-secret-32-chars+';

const WIRING_PATH_PUBLIC = '/wiring-test/public';
const WIRING_PATH_PROTECTED = '/wiring-test/protected';
const WIRING_PATH_ADMIN = '/wiring-test/admin';

@Controller('wiring-test/public')
class PublicTestController {
  @Public()
  @Get()
  ok(): { ok: true } {
    return { ok: true };
  }
}

@Controller('wiring-test/protected')
class ProtectedTestController {
  @Get()
  ok(): { ok: true } {
    return { ok: true };
  }
}

@Controller('wiring-test/admin')
class AdminTestController {
  @Roles('admin')
  @Get()
  ok(): { ok: true } {
    return { ok: true };
  }
}

const buildMockUserRepository = (): Record<string, jest.Mock> => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  save: jest.fn().mockResolvedValue({}),
  insert: jest.fn().mockResolvedValue(undefined),
  createQueryBuilder: jest.fn().mockReturnValue({
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    withDeleted: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
  }),
});

const buildMockDataSource = (mockUserRepo: Record<string, jest.Mock>): unknown => ({
  getRepository: jest.fn().mockReturnValue(mockUserRepo),
  getTreeRepository: jest.fn().mockReturnValue(mockUserRepo),
  getMongoRepository: jest.fn().mockReturnValue(mockUserRepo),
  query: jest.fn().mockResolvedValue(undefined),
  isInitialized: true,
  entityMetadatas: [],
  options: { type: 'postgres' },
  destroy: jest.fn().mockResolvedValue(undefined),
});

describe('AuthModule wiring (APP_GUARDs end-to-end)', () => {
  let app: INestApplication;
  let jwtVerifySpy: jest.SpyInstance;

  beforeEach(async () => {
    const mockUserRepo = buildMockUserRepository();
    const mockDataSource = buildMockDataSource(mockUserRepo);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              jwt: { secret: TEST_JWT_SECRET, ttlSeconds: 3600 },
              bcrypt: { cost: 4 },
              port: 3000,
              nodeEnv: 'test',
            }),
          ],
        }),

        TypeOrmModule.forRootAsync({
          useFactory: () => ({
            type: 'postgres',
          }),
          dataSourceFactory: async () => mockDataSource as DataSource,
        }),
        AuthModule,
      ],
      controllers: [PublicTestController, ProtectedTestController, AdminTestController],
      providers: [
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    const jwtService = moduleRef.get<JwtService>(JwtService);
    jwtVerifySpy = jest.spyOn(jwtService, 'verify');

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  describe('resolucion de providers', () => {
    it('resuelve JwtAuthGuard como provider de Nest', () => {
      expect(app.get(JwtAuthGuard)).toBeInstanceOf(JwtAuthGuard);
    });

    it('resuelve RolesGuard como provider de Nest', () => {
      expect(app.get(RolesGuard)).toBeInstanceOf(RolesGuard);
    });

    it('resuelve AuthService (cierra la cadena de DI del modulo)', () => {
      expect(app.get(AuthService)).toBeInstanceOf(AuthService);
    });

    it('resuelve JwtTokenService', () => {
      expect(app.get(JwtTokenService)).toBeInstanceOf(JwtTokenService);
    });

    it('resuelve BcryptPasswordService', () => {
      expect(app.get(BcryptPasswordService)).toBeInstanceOf(BcryptPasswordService);
    });

    it('resuelve DataSource (la wiring de TypeORM cerro)', () => {
      const dataSource = app.get(DataSource);
      expect(dataSource).toBeDefined();
      expect(typeof (dataSource as { getRepository?: unknown }).getRepository).toBe('function');
    });
  });

  describe('comportamiento HTTP de los APP_GUARDs', () => {
    it('permite GET en endpoint publico sin Bearer (200)', async () => {
      const response = await request(app.getHttpServer()).get(WIRING_PATH_PUBLIC).expect(200);

      expect(response.body).toEqual({ ok: true });
      expect(jwtVerifySpy).not.toHaveBeenCalled();
    });

    it('rechaza GET en endpoint protegido sin Bearer (401)', async () => {
      const response = await request(app.getHttpServer()).get(WIRING_PATH_PROTECTED).expect(401);

      expect(response.body).toMatchObject({
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
      expect(jwtVerifySpy).not.toHaveBeenCalled();
    });

    it('rechaza GET en endpoint protegido con Bearer invalido (401)', async () => {
      jwtVerifySpy.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      const response = await request(app.getHttpServer())
        .get(WIRING_PATH_PROTECTED)
        .set('Authorization', 'Bearer bad.jwt.value')
        .expect(401);

      expect(response.body).toMatchObject({ error: 'Unauthorized' });
      expect(jwtVerifySpy).toHaveBeenCalledWith('bad.jwt.value', expect.anything());
    });

    it('permite GET en endpoint protegido con Bearer valido y role user (200)', async () => {
      jwtVerifySpy.mockReturnValue({ sub: '1', role: 'user' });

      const response = await request(app.getHttpServer())
        .get(WIRING_PATH_PROTECTED)
        .set('Authorization', 'Bearer good.jwt.value')
        .expect(200);

      expect(response.body).toEqual({ ok: true });
    });

    it('rechaza GET en endpoint admin con Bearer valido pero role user (403)', async () => {
      jwtVerifySpy.mockReturnValue({ sub: '1', role: 'user' });

      const response = await request(app.getHttpServer())
        .get(WIRING_PATH_ADMIN)
        .set('Authorization', 'Bearer good.jwt.value')
        .expect(403);

      expect(response.body).toMatchObject({
        error: 'Forbidden',
        message: 'Insufficient permissions',
      });
    });

    it('permite GET en endpoint admin con Bearer valido y role admin (200)', async () => {
      jwtVerifySpy.mockReturnValue({ sub: '1', role: 'admin' });

      const response = await request(app.getHttpServer())
        .get(WIRING_PATH_ADMIN)
        .set('Authorization', 'Bearer admin.jwt.value')
        .expect(200);

      expect(response.body).toEqual({ ok: true });
    });
  });
});
