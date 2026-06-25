import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { EMAIL_MAX_LENGTH } from '../../utils/normalize-email';

export class LoginDto {
  @ApiProperty({
    description:
      'Email del usuario. Se normaliza con `trim` -> `NFKC` -> `lowercase` antes de buscar en DB.',
    example: 'foo@example.com',
    maxLength: EMAIL_MAX_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @ApiProperty({
    description:
      'Password del usuario. Se compara contra el hash bcrypt persistido. No se valida strength.',
    example: 'StrongP4ssw0rd#',
  })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
