import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { EMAIL_MAX_LENGTH } from '../../utils/normalize-email';

export class SignupDto {
  @ApiProperty({
    description:
      'Email del usuario. Se normaliza con `trim` -> `NFKC` -> `lowercase` antes de validar y persistir. La regex post-normalize vive en el AuthService.',
    example: 'foo@example.com',
    maxLength: EMAIL_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @ApiProperty({
    description:
      'Password del usuario. Exige 8-64 chars, al menos 1 minuscula, 1 mayuscula, 1 digito y 1 caracter especial de `!@#$%^&*`.',
    example: 'StrongP4ssw0rd#',
    minLength: 8,
    maxLength: 64,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/[A-Z]/, { message: 'password must contain at least one uppercase letter' })
  @Matches(/[a-z]/, { message: 'password must contain at least one lowercase letter' })
  @Matches(/\d/, { message: 'password must contain at least one digit' })
  @Matches(/[!@#$%^&*]/, {
    message: 'password must contain at least one special character from !@#$%^&*',
  })
  password!: string;
}
