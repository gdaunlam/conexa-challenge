import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export enum SortBy {
  Title = 'title',
  ReleaseDate = 'release_date',
  EpisodeId = 'episode_id',
}

export enum SortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class FindMoviesQueryDto {
  @ApiProperty({
    description: 'Texto a buscar en title y director con word_similarity.',
    required: false,
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  search?: string;

  @ApiProperty({
    description: 'Campo de ordenamiento.',
    enum: SortBy,
    default: SortBy.EpisodeId,
    required: false,
  })
  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy = SortBy.EpisodeId;

  @ApiProperty({
    description: 'Direccion del ordenamiento.',
    enum: SortOrder,
    default: SortOrder.Asc,
    required: false,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  order?: SortOrder = SortOrder.Asc;

  @ApiProperty({
    description: 'Numero de pagina (>= 1).',
    default: DEFAULT_PAGE,
    minimum: 1,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = DEFAULT_PAGE;

  @ApiProperty({
    description: 'Items por pagina (1-100).',
    default: DEFAULT_LIMIT,
    minimum: 1,
    maximum: MAX_LIMIT,
    required: false,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number = DEFAULT_LIMIT;
}
