import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { EMAIL_MAX_LENGTH, EMAIL_MIN_LENGTH, EMAIL_REGEX, NAME_MAX_LENGTH, NAME_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../utils/normalize-email';

const normalizeEmail = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().normalize('NFKC').toLowerCase() : value;

export class SignupDto {
  @ApiProperty({
    description:
      'Email del usuario. Se normaliza con `trim` -> `NFKC` -> `lowercase` antes de validar y persistir.',
    example: 'foo@example.com',
    minLength: EMAIL_MIN_LENGTH,
    maxLength: EMAIL_MAX_LENGTH,
  })
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsString()
  @IsNotEmpty()
  @MinLength(EMAIL_MIN_LENGTH)
  @MaxLength(EMAIL_MAX_LENGTH)
  @Matches(EMAIL_REGEX, { message: 'email must be a valid email address' })
  email!: string;

  @ApiProperty({
    description: 'Nombre del usuario. 2-100 chars.',
    example: 'Foo Bar',
    minLength: NAME_MIN_LENGTH,
    maxLength: NAME_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(NAME_MIN_LENGTH)
  @MaxLength(NAME_MAX_LENGTH)
  name!: string;

  @ApiProperty({
    description:
      'Password del usuario. Exige 8-64 chars, al menos 1 minuscula, 1 mayuscula, 1 digito y 1 caracter especial de `!@#$%^&*`.',
    example: 'StrongP4ssw0rd#',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(/[A-Z]/, { message: 'password must contain at least one uppercase letter' })
  @Matches(/[a-z]/, { message: 'password must contain at least one lowercase letter' })
  @Matches(/\d/, { message: 'password must contain at least one digit' })
  @Matches(/[!@#$%^&*]/, {
    message: 'password must contain at least one special character from !@#$%^&*',
  })
  password!: string;
}
