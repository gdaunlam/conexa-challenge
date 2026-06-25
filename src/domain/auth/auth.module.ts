import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './controller/auth.controller';
import { AuthService } from './service/auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { BcryptPasswordService } from './service/bcrypt-password.service';
import { JwtTokenService } from './service/jwt-token.service';
import { User } from './repository/user.entity';
import { JwtConfig } from '../../config/configuration';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const jwtConfig = configService.getOrThrow<JwtConfig>('jwt');
        return {
          secret: jwtConfig.secret,
          signOptions: {
            expiresIn: `${jwtConfig.ttlSeconds}s`,
          },
          verifyOptions: {
            algorithms: ['HS256'],
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, BcryptPasswordService, JwtTokenService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, BcryptPasswordService, JwtTokenService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
