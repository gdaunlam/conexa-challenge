import { ApiProperty } from '@nestjs/swagger';

import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const RELEASE_DATE_FORMAT_EXAMPLE = '1977-05-25';
const MAX_TITLE_LENGTH = 200;
const MAX_DIRECTOR_LENGTH = 100;
const MAX_PRODUCER_LENGTH = 200;
const MAX_OPENING_CRAWL_LENGTH = 5000;
const MAX_EXTERNAL_ID_LENGTH = 100;
const RELEASE_DATE_LENGTH = 10;

export class CreateMovieDto {
  @ApiProperty({
    description: 'Titulo de la pelicula. Persistido tal cual.',
    example: 'A New Hope',
    maxLength: MAX_TITLE_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TITLE_LENGTH)
  title!: string;

  @ApiProperty({
    description: 'Nombre del director. Persistido tal cual.',
    example: 'George Lucas',
    maxLength: MAX_DIRECTOR_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_DIRECTOR_LENGTH)
  director!: string;

  @ApiProperty({
    description: 'Nombre(s) del/de los productor(es). Persistido tal cual.',
    example: 'Gary Kurtz, Rick McCallum',
    maxLength: MAX_PRODUCER_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PRODUCER_LENGTH)
  producer!: string;

  @ApiProperty({
    description: 'Fecha de estreno en formato ISO 8601 estricto (`YYYY-MM-DD`, exactamente 10 chars). Requerido.',
    example: RELEASE_DATE_FORMAT_EXAMPLE,
    format: 'date',
    minLength: 10,
    maxLength: 10,
  })
  @IsDateString()
  @Length(RELEASE_DATE_LENGTH, RELEASE_DATE_LENGTH)
  releaseDate!: string;

  @ApiProperty({
    description: 'Numero de episodio en la saga. Caracteristica opcional, NO es identidad.',
    example: 4,
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
    description: 'Parrafo de apertura. Opcional, max 5000 chars.',
    example: 'It is a period of civil war...',
    required: false,
    nullable: true,
    maxLength: MAX_OPENING_CRAWL_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_OPENING_CRAWL_LENGTH)
  openingCrawl?: string;

  @ApiProperty({
    description:
      'ID externo (id de la fuente). Si viene y existe soft-deleted dentro del ' +
      "namespace `provider='manual'`, se REACTIVA con semantica PUT. " +
      'Si existe activo, devuelve 409. Si no existe, INSERT.',
    example: '1',
    required: false,
    nullable: true,
    minLength: 1,
    maxLength: MAX_EXTERNAL_ID_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_EXTERNAL_ID_LENGTH)
  externalId?: string;

  @ApiProperty({
    description:
      'JSONB con metadata adicional (URLs de SWAPI: characters, planets, starships, ' +
      'vehicles, species). Default `{}` para peliculas manuales.',
    example: {},
    required: false,
    type: Object,
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;
}
