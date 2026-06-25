import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { CreateMovieDto } from '../controller/dto/create-movie.dto';
import { FindMoviesQueryDto } from '../controller/dto/find-movies-query.dto';
import { MovieResponseDto } from '../controller/dto/movie-response.dto';
import { UpdateMovieDto } from '../controller/dto/update-movie.dto';
import { Movie } from '../repository/movie.entity';
import { DEFAULT_MOVIE_PROVIDER } from '../enums/movie-provider.enum';
import { MoviesRepository } from '../repository/movies.repository';

const LISTING_INCLUDE_ATTRIBUTES = false;
const DETAIL_INCLUDE_ATTRIBUTES = true;

export interface CreateMovieResult {
  status: 200 | 201;
  movie: MovieResponseDto;
}

const LOG_CODE_MOVIE_CREATED = 'movie_created';
const LOG_CODE_MOVIE_REACTIVATED = 'movie_reactivated';
const LOG_CODE_MOVIE_CONFLICT = 'movie_conflict';
const LOG_CODE_MOVIE_UPDATED = 'movie_updated';
const LOG_CODE_MOVIE_NOT_FOUND = 'movie_not_found';
const LOG_CODE_MOVIE_DELETED = 'movie_deleted';

@Injectable()
export class MoviesService {
  private readonly logger = new Logger(MoviesService.name);

  constructor(private readonly repository: MoviesRepository) {}

  async findAll(query: FindMoviesQueryDto): Promise<{
    items: MovieResponseDto[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const { search, sortBy, order, page, limit } = query;

    const result = await this.repository.findAll({
      search,
      sortBy: sortBy!,
      order: order!,
      page: page!,
      limit: limit!,
    });

    const items = result.data.map((movie) => this.toResponseDto(movie, LISTING_INCLUDE_ATTRIBUTES));

    return {
      items,
      meta: {
        page: page!,
        limit: limit!,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / limit!)),
      },
    };
  }

  async findOne(id: number): Promise<MovieResponseDto> {
    const movie = await this.repository.findOneActiveById(id);
    if (movie === null) {
      throw new NotFoundException({
        error: 'Not Found',
        message: `Movie ${id} not found`,
        details: null,
      });
    }
    return this.toResponseDto(movie, DETAIL_INCLUDE_ATTRIBUTES);
  }

  async create(dto: CreateMovieDto): Promise<CreateMovieResult> {
    const normalizedInput = {
      title: dto.title,
      director: dto.director,
      producer: dto.producer,
      releaseDate: dto.releaseDate,
      episodeId: dto.episodeId ?? null,
      openingCrawl: dto.openingCrawl ?? null,
      externalId: dto.externalId ?? null,
      attributes: dto.attributes ?? {},
    };

    if (dto.externalId !== undefined && dto.externalId !== null) {
      const existing = await this.repository.findOneByProviderAndExternalId(
        DEFAULT_MOVIE_PROVIDER,
        dto.externalId,
      );

      if (existing !== null) {
        if (existing.deletedAt === null) {
          this.logger.warn(
            `create conflict code=${LOG_CODE_MOVIE_CONFLICT} externalId=${dto.externalId}`,
          );
          throw new ConflictException({
            error: 'Conflict',
            message: `Movie with external_id '${dto.externalId}' already exists`,
            details: null,
          });
        }

        const reactivated = await this.repository.reactivateAndReplace(
          Number(existing.id),
          normalizedInput,
        );

        if (reactivated === null) {
          throw new ConflictException({
            error: 'Conflict',
            message: `Movie with external_id '${dto.externalId}' is in an inconsistent state`,
            details: null,
          });
        }

        this.logger.log(
          `create reactivated code=${LOG_CODE_MOVIE_REACTIVATED} id=${reactivated.id} externalId=${dto.externalId}`,
        );

        return {
          status: 200,
          movie: this.toResponseDto(reactivated, DETAIL_INCLUDE_ATTRIBUTES),
        };
      }
    }

    const created = await this.repository.createManual(normalizedInput);
    this.logger.log(`create code=${LOG_CODE_MOVIE_CREATED} id=${created.id}`);

    return {
      status: 201,
      movie: this.toResponseDto(created, DETAIL_INCLUDE_ATTRIBUTES),
    };
  }

  async update(id: number, dto: UpdateMovieDto): Promise<MovieResponseDto> {
    const updated = await this.repository.updateActive(id, dto);

    if (updated === null) {
      this.logger.warn(`update not found code=${LOG_CODE_MOVIE_NOT_FOUND} id=${id}`);
      throw new NotFoundException({
        error: 'Not Found',
        message: `Movie ${id} not found`,
        details: null,
      });
    }

    this.logger.log(`update code=${LOG_CODE_MOVIE_UPDATED} id=${id}`);
    return this.toResponseDto(updated, DETAIL_INCLUDE_ATTRIBUTES);
  }

  async remove(id: number): Promise<void> {
    const result = await this.repository.softDelete(id);
    if (!result.exists) {
      throw new NotFoundException({
        error: 'Not Found',
        message: `Movie ${id} not found`,
        details: null,
      });
    }
    this.logger.log(`delete code=${LOG_CODE_MOVIE_DELETED} id=${id}`);
  }

  private toResponseDto(movie: Movie, includeAttributes: boolean): MovieResponseDto {
    return plainToInstance(MovieResponseDto, {
      id: movie.id.toString(),
      title: movie.title,
      episodeId: movie.episodeId,
      openingCrawl: movie.openingCrawl,
      director: movie.director,
      producer: movie.producer,
      releaseDate: movie.releaseDate,
      provider: movie.provider,
      externalId: movie.externalId,
      ...(includeAttributes ? { attributes: movie.attributes } : {}),
      createdAt: movie.createdAt.toISOString(),
      updatedAt: movie.updatedAt.toISOString(),
    });
  }
}
