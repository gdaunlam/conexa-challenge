import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtConfig } from '../../../config/configuration';
import { UserRole } from '../enums/user-role.enum';

const LOG_CODE_TOKEN_EXPIRED = 'token_expired';
const LOG_CODE_TOKEN_INVALID = 'token_invalid';
const INVALID_CREDENTIALS_MESSAGE = 'Invalid credentials';

export interface JwtPayload {
  sub: string;
  role: UserRole;
}

@Injectable()
export class JwtTokenService {
  private readonly logger = new Logger(JwtTokenService.name);

  private readonly secret: string;
  private readonly ttlSeconds: number;

  constructor(
    private readonly jwtService: JwtService,
    configService: ConfigService,
  ) {
    const jwtConfig = configService.get<JwtConfig>('jwt');
    if (jwtConfig === undefined) {
      throw new Error('jwt config is not available; cannot start JwtTokenService');
    }
    this.secret = jwtConfig.secret;
    this.ttlSeconds = jwtConfig.ttlSeconds;
  }

  sign(payload: JwtPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.secret,
      expiresIn: this.ttlSeconds,
    });
  }

  verify(token: string): JwtPayload {
    try {
      return this.jwtService.verify<JwtPayload>(token, { secret: this.secret });
    } catch (error) {
      const code =
        error instanceof Error && error.name === 'TokenExpiredError'
          ? LOG_CODE_TOKEN_EXPIRED
          : LOG_CODE_TOKEN_INVALID;
      this.logger.warn(`jwt verification failed code=${code}`);
      throw new UnauthorizedException({
        error: 'Unauthorized',
        message: INVALID_CREDENTIALS_MESSAGE,
        details: null,
      });
    }
  }
}
