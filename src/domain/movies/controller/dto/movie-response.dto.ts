import { ApiProperty } from '@nestjs/swagger';
import { MovieProvider } from '../../enums/movie-provider.enum';

export class MovieResponseDto {
  @ApiProperty({ description: 'BIGSERIAL como string para preservar precision.' })
  id!: string;

  @ApiProperty({ example: 'A New Hope' })
  title!: string;

  @ApiProperty({ example: 4, nullable: true, required: false })
  episodeId!: number | null;

  @ApiProperty({ example: 'It is a period of civil war...', nullable: true, required: false })
  openingCrawl!: string | null;

  @ApiProperty({ example: 'George Lucas' })
  director!: string;

  @ApiProperty({ example: 'Gary Kurtz, Rick McCallum' })
  producer!: string;

  @ApiProperty({ example: '1977-05-25', nullable: true, required: false, format: 'date' })
  releaseDate!: string | null;

  @ApiProperty({ enum: ['manual', 'swapi'], example: 'manual' })
  provider!: MovieProvider;

  @ApiProperty({ example: '1', nullable: true, required: false })
  externalId!: string | null;

  @ApiProperty({
    description:
      'Metadata SWAPI (characters, planets, starships, vehicles, species). ' +
      'Solo se expone en el detalle, no en el listado.',
    type: Object,
    additionalProperties: true,
    required: false,
  })
  attributes?: Record<string, unknown>;

  @ApiProperty({ example: '2026-06-23T15:30:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-06-23T15:30:00.000Z' })
  updatedAt!: string;
}
