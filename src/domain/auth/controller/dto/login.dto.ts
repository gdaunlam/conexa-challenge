import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { EMAIL_MAX_LENGTH, EMAIL_MIN_LENGTH, EMAIL_REGEX, PASSWORD_MAX_LENGTH } from '../../utils/normalize-email';

const normalizeEmail = (value: unknown): unknown =>
  typeof value === 'string' ? value.trim().normalize('NFKC').toLowerCase() : value;

export class LoginDto {
  @ApiProperty({
    description:
      'Email del usuario. Se normaliza con `trim` -> `NFKC` -> `lowercase` antes de buscar en DB.',
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
    description:
      'Password del usuario. Se compara contra el hash bcrypt persistido. No se valida strength.',
    example: 'StrongP4ssw0rd#',
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
