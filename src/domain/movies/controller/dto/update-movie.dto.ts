import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const MAX_TITLE_LENGTH = 200;
const MAX_DIRECTOR_LENGTH = 100;
const MAX_PRODUCER_LENGTH = 200;
const MAX_OPENING_CRAWL_LENGTH = 5000;
const RELEASE_DATE_LENGTH = 10;
const STRICT_DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateMovieDto {
  @ApiProperty({
    description:
      'Titulo. Ausencia = no modificar. `null` o `""` = 400 (NOT NULL).',
    required: false,
    maxLength: MAX_TITLE_LENGTH,
  })
  @ValidateIf((o) => o.title !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TITLE_LENGTH)
  title?: string;

  @ApiProperty({
    description: 'Director. Mismas reglas que title.',
    required: false,
    maxLength: MAX_DIRECTOR_LENGTH,
  })
  @ValidateIf((o) => o.director !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_DIRECTOR_LENGTH)
  director?: string;

  @ApiProperty({
    description: 'Producer. Mismas reglas que title.',
    required: false,
    maxLength: MAX_PRODUCER_LENGTH,
  })
  @ValidateIf((o) => o.producer !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PRODUCER_LENGTH)
  producer?: string;

  @ApiProperty({
    description:
      'Fecha de estreno ISO 8601 estricto (`YYYY-MM-DD`, exactamente 10 chars). `null` o `""` = 400 (NOT NULL). Ausencia = no modificar.',
    required: false,
    format: 'date',
    minLength: 10,
    maxLength: 10,
  })
  @ValidateIf((o) => o.releaseDate !== undefined)
  @IsDateString({ strict: true })
  @Length(RELEASE_DATE_LENGTH, RELEASE_DATE_LENGTH)
  @Matches(STRICT_DATE_FORMAT, {
    message: 'releaseDate must match YYYY-MM-DD (no ISO week/ordinal format)',
  })
  releaseDate?: string;

  @ApiProperty({
    description:
      'Numero de episodio. `null` = 400 (NOT NULL). Ausencia = no modificar.',
    required: false,
    nullable: true,
    minimum: 1,
    maximum: 20,
  })
  @ValidateIf((o) => o.episodeId !== undefined)
  @IsInt()
  @Min(1)
  @Max(20)
  episodeId?: number;

  @ApiProperty({
    description:
      'Opening crawl. `null` o `""` = borrar (setear NULL en DB). Ausencia = no modificar.',
    required: false,
    nullable: true,
    maxLength: MAX_OPENING_CRAWL_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_OPENING_CRAWL_LENGTH)
  openingCrawl?: string | null;

  @ApiProperty({
    description:
      'JSONB con metadata adicional. Ausencia = no modificar. `null` = 400 (NOT NULL en DB).',
    required: false,
    type: Object,
    additionalProperties: true,
    nullable: false,
  })
  @ValidateIf((o) => o.attributes !== undefined)
  @IsObject()
  attributes?: Record<string, unknown>;
}
