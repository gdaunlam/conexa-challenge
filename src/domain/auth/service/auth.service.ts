import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { BcryptPasswordService } from './bcrypt-password.service';
import { JwtTokenService } from './jwt-token.service';
import {
  EMAIL_ALREADY_REGISTERED_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  isValidNormalizedEmail,
  normalizeEmail,
} from '../utils/normalize-email';
import { User } from '../repository/user.entity';
import { DEFAULT_USER_ROLE } from '../enums/user-role.enum';
import { LoginDto } from '../controller/dto/login.dto';
import { SignupDto } from '../controller/dto/signup.dto';

const POSTGRES_UNIQUE_VIOLATION = '23505';

const DUMMY_PASSWORD_HASH = '$2b$10$CwTycUXWue0Thq9StjUM0uJ8h5K3V0nYlJ.1qjC0vI7sV4wC8/3.W';

const LOG_CODE_INVALID_CREDENTIALS = 'invalid_credentials';
const LOG_CODE_ACCOUNT_DISABLED = 'account_disabled';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly passwordService: BcryptPasswordService,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  async signup(signupDto: SignupDto): Promise<void> {
    const normalizedEmail = normalizeEmail(signupDto.email);

    if (!isValidNormalizedEmail(normalizedEmail)) {
      throw new BadRequestException({
        error: 'Bad Request',
        message: EMAIL_ALREADY_REGISTERED_MESSAGE,
        details: null,
      });
    }

    const passwordHash = await this.passwordService.hash(signupDto.password);

    try {
      await this.usersRepository.insert({
        email: normalizedEmail,
        passwordHash,
        role: DEFAULT_USER_ROLE,
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new BadRequestException({
          error: 'Bad Request',
          message: EMAIL_ALREADY_REGISTERED_MESSAGE,
          details: null,
        });
      }
      throw error;
    }
  }

  async login(loginDto: LoginDto): Promise<{ accessToken: string }> {
    const normalizedEmail = normalizeEmail(loginDto.email);

    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: normalizedEmail })
      .withDeleted()
      .getOne();

    if (user === null) {
      await this.passwordService.verify(loginDto.password, DUMMY_PASSWORD_HASH);
      this.logger.warn(`login attempt code=${LOG_CODE_INVALID_CREDENTIALS}`);
      throw new UnauthorizedException({
        error: 'Unauthorized',
        message: INVALID_CREDENTIALS_MESSAGE,
        details: null,
      });
    }

    const passwordMatches = await this.passwordService.verify(loginDto.password, user.passwordHash);

    if (user.deletedAt !== null) {
      this.logger.warn(`login attempt code=${LOG_CODE_ACCOUNT_DISABLED} userId=${user.id}`);
      throw new UnauthorizedException({
        error: 'Unauthorized',
        message: INVALID_CREDENTIALS_MESSAGE,
        details: null,
      });
    }

    if (!passwordMatches) {
      this.logger.warn(`login attempt code=${LOG_CODE_INVALID_CREDENTIALS} userId=${user.id}`);
      throw new UnauthorizedException({
        error: 'Unauthorized',
        message: INVALID_CREDENTIALS_MESSAGE,
        details: null,
      });
    }

    const accessToken = this.jwtTokenService.sign({ sub: user.id, role: user.role });
    return { accessToken };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (error instanceof QueryFailedError) {
      const driverError = (error as unknown as { driverError?: { code?: unknown } }).driverError;
      return driverError?.code === POSTGRES_UNIQUE_VIOLATION;
    }
    return false;
  }
}
