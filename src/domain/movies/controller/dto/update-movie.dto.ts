import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const MAX_TITLE_LENGTH = 200;
const MAX_DIRECTOR_LENGTH = 100;
const MAX_PRODUCER_LENGTH = 200;
const MAX_OPENING_CRAWL_LENGTH = 5000;

export class UpdateMovieDto {
  @ApiProperty({
    description:
      'Titulo. Ausencia = no modificar. Valor = reemplazar. `null` o `""` = 400 (NOT NULL).',
    required: false,
    maxLength: MAX_TITLE_LENGTH,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TITLE_LENGTH)
  title?: string;

  @ApiProperty({
    description: 'Director. Mismas reglas que title.',
    required: false,
    maxLength: MAX_DIRECTOR_LENGTH,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_DIRECTOR_LENGTH)
  director?: string;

  @ApiProperty({
    description: 'Producer. Mismas reglas que title.',
    required: false,
    maxLength: MAX_PRODUCER_LENGTH,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PRODUCER_LENGTH)
  producer?: string;

  @ApiProperty({
    description: 'Fecha de estreno ISO 8601. `null` = 400 (NOT NULL). Ausencia = no modificar.',
    required: false,
    format: 'date',
  })
  @IsOptional()
  @IsDateString()
  releaseDate?: string;

  @ApiProperty({
    description: 'Numero de episodio. `null` = 400 (NOT NULL). Ausencia = no modificar.',
    required: false,
    nullable: true,
    minimum: 1,
    maximum: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  episodeId?: number;

  @ApiProperty({
    description: 'Opening crawl. `null` o `""` = borrar (setear NULL en DB).',
    required: false,
    nullable: true,
    maxLength: MAX_OPENING_CRAWL_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_OPENING_CRAWL_LENGTH)
  openingCrawl?: string;

  @ApiProperty({
    description: 'JSONB con metadata adicional. Ausencia = no modificar.',
    required: false,
    type: Object,
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}
