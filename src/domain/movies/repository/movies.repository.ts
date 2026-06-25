import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryDeepPartialEntity, Repository } from 'typeorm';
import { Movie } from './movie.entity';
import { DEFAULT_MOVIE_PROVIDER, MovieProvider } from '../enums/movie-provider.enum';
import { SortBy, SortOrder } from '../controller/dto/find-movies-query.dto';

export interface SoftDeleteResult {
  exists: boolean;
}

export interface FindAllOptions {
  search?: string;
  sortBy: SortBy;
  order: SortOrder;
  page: number;
  limit: number;
}

export interface FindAllResult {
  data: Movie[];
  total: number;
}

@Injectable()
export class MoviesRepository {
  constructor(
    @InjectRepository(Movie)
    private readonly repo: Repository<Movie>,
  ) {}

  async findAll(options: FindAllOptions): Promise<FindAllResult> {
    const qb = this.repo.createQueryBuilder('movie').where('movie.deleted_at IS NULL');

    if (options.search !== undefined && options.search.length > 0) {
      // pg_trgm `<%` toma la primera cadena como fuente de palabras y la
      // segunda como consulta. Ponemos `:search` primero para que la palabra
      // del cliente se compare contra el cuerpo completo de title/director.
      // Si se invirtiera (`title <% :search`) el word_similarity entre la
      // cadena larga y la corta cae bajo el threshold (0.3) y nunca matchea.
      qb.andWhere('(:search <% movie.title OR :search <% movie.director)', {
        search: options.search,
      });
    }

    const sortColumn = this.resolveSortColumn(options.sortBy);
    qb.orderBy(`movie.${sortColumn}`, options.order === SortOrder.Asc ? 'ASC' : 'DESC');

    qb.skip((options.page - 1) * options.limit).take(options.limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  private resolveSortColumn(sortBy: SortBy): 'title' | 'release_date' | 'episode_id' {
    switch (sortBy) {
      case SortBy.Title:
        return 'title';
      case SortBy.ReleaseDate:
        return 'release_date';
      case SortBy.EpisodeId:
        return 'episode_id';
      default:
        throw new Error(`Unsupported sortBy: ${String(sortBy)}`);
    }
  }

  async findOneActiveById(id: number): Promise<Movie | null> {
    return this.repo
      .createQueryBuilder('movie')
      .where('movie.id = :id', { id })
      .andWhere('movie.deleted_at IS NULL')
      .getOne();
  }

  async findOneByProviderAndExternalId(
    provider: MovieProvider,
    externalId: string,
  ): Promise<Movie | null> {
    return this.repo
      .createQueryBuilder('movie')
      .where('movie.provider = :provider', { provider })
      .andWhere('movie.external_id = :externalId', { externalId })
      .withDeleted()
      .getOne();
  }

  async createManual(input: {
    title: string;
    director: string;
    producer: string;
    releaseDate: string;
    episodeId?: number | null;
    openingCrawl?: string | null;
    externalId?: string | null;
    attributes?: Record<string, unknown>;
  }): Promise<Movie> {
    const insert = this.repo.create({
      title: input.title,
      director: input.director,
      producer: input.producer,
      releaseDate: input.releaseDate,
      episodeId: input.episodeId ?? null,
      openingCrawl: input.openingCrawl ?? null,
      provider: DEFAULT_MOVIE_PROVIDER,
      externalId: input.externalId ?? null,
      attributes: input.attributes ?? {},
    });
    return this.repo.save(insert);
  }

  async createSwapiFilm(input: {
    externalId: string;
    title: string;
    director: string;
    producer: string;
    releaseDate: string;
    episodeId?: number | null;
    openingCrawl?: string | null;
    attributes?: Record<string, unknown>;
  }): Promise<Movie> {
    const insert = this.repo.create({
      title: input.title,
      director: input.director,
      producer: input.producer,
      releaseDate: input.releaseDate,
      episodeId: input.episodeId ?? null,
      openingCrawl: input.openingCrawl ?? null,
      provider: 'swapi',
      externalId: input.externalId,
      attributes: input.attributes ?? {},
    });
    return this.repo.save(insert);
  }

  async updateSwapiFilm(
    id: number,
    partial: {
      title?: string;
      director?: string;
      producer?: string;
      releaseDate?: string;
      episodeId?: number | null;
      openingCrawl?: string | null;
      attributes?: Record<string, unknown>;
    },
  ): Promise<Movie | null> {
    const setObject: QueryDeepPartialEntity<Movie> = {};
    if (partial.title !== undefined) setObject['title'] = partial.title;
    if (partial.director !== undefined) setObject['director'] = partial.director;
    if (partial.producer !== undefined) setObject['producer'] = partial.producer;
    if (partial.releaseDate !== undefined) setObject['releaseDate'] = partial.releaseDate;
    if (partial.episodeId !== undefined) setObject['episodeId'] = partial.episodeId;
    if (partial.openingCrawl !== undefined) setObject['openingCrawl'] = partial.openingCrawl;
    if (partial.attributes !== undefined) setObject['attributes'] = partial.attributes as QueryDeepPartialEntity<Movie>['attributes'];

    if (Object.keys(setObject).length === 0) {
      return this.findOneActiveById(id);
    }

    const result = await this.repo
      .createQueryBuilder()
      .update(Movie)
      .set(setObject)
      .where('id = :id', { id })
      .andWhere('deleted_at IS NULL')
      .returning('*')
      .execute();

    if (result.affected === 0) {
      return null;
    }

    return this.findOneActiveById(id);
  }

  async reactivateAndReplace(
    id: number,
    input: {
      title: string;
      director: string;
      producer: string;
      releaseDate: string;
      episodeId?: number | null;
      openingCrawl?: string | null;
      attributes?: Record<string, unknown>;
    },
  ): Promise<Movie | null> {
    const result = await this.repo
      .createQueryBuilder()
      .update(Movie)
      .set({
        title: input.title,
        director: input.director,
        producer: input.producer,
        releaseDate: input.releaseDate,
        episodeId: input.episodeId ?? null,
        openingCrawl: input.openingCrawl ?? null,
        attributes: (input.attributes ?? {}) as QueryDeepPartialEntity<Movie>['attributes'],
        deletedAt: () => 'NULL',
      })
      .where('id = :id', { id })
      .andWhere('deleted_at IS NOT NULL')
      .returning('*')
      .execute();

    if (result.affected === 0) {
      return null;
    }

    return this.findOneActiveById(id);
  }

  async reactivateByExternalId(
    externalId: string,
    input: {
      title: string;
      director: string;
      producer: string;
      releaseDate: string;
      episodeId?: number | null;
      openingCrawl?: string | null;
      attributes?: Record<string, unknown>;
    },
  ): Promise<Movie | null> {
    const result = await this.repo
      .createQueryBuilder()
      .update(Movie)
      .set({
        title: input.title,
        director: input.director,
        producer: input.producer,
        releaseDate: input.releaseDate,
        episodeId: input.episodeId ?? null,
        openingCrawl: input.openingCrawl ?? null,
        attributes: (input.attributes ?? {}) as QueryDeepPartialEntity<Movie>['attributes'],
        deletedAt: () => 'NULL',
      })
      .where('provider = :provider', { provider: DEFAULT_MOVIE_PROVIDER })
      .andWhere('external_id = :externalId', { externalId })
      .andWhere('deleted_at IS NOT NULL')
      .returning('*')
      .execute();

    if (result.affected === 0) {
      return null;
    }

    return this.findOneByProviderAndExternalId(DEFAULT_MOVIE_PROVIDER, externalId);
  }

  async updateActive(
    id: number,
    partial: {
      title?: string;
      director?: string;
      producer?: string;
      releaseDate?: string;
      episodeId?: number | null;
      openingCrawl?: string | null;
      attributes?: Record<string, unknown>;
    },
  ): Promise<Movie | null> {
    const setObject: QueryDeepPartialEntity<Movie> = {};
    if (partial.title !== undefined) setObject['title'] = partial.title;
    if (partial.director !== undefined) setObject['director'] = partial.director;
    if (partial.producer !== undefined) setObject['producer'] = partial.producer;
    if (partial.releaseDate !== undefined) setObject['releaseDate'] = partial.releaseDate;
    if (partial.episodeId !== undefined) setObject['episodeId'] = partial.episodeId;
    if (partial.openingCrawl !== undefined) setObject['openingCrawl'] = partial.openingCrawl;
    if (partial.attributes !== undefined) setObject['attributes'] = partial.attributes as QueryDeepPartialEntity<Movie>['attributes'];

    if (Object.keys(setObject).length === 0) {
      return this.findOneActiveById(id);
    }

    const result = await this.repo
      .createQueryBuilder()
      .update(Movie)
      .set(setObject)
      .where('id = :id', { id })
      .andWhere('deleted_at IS NULL')
      .returning('*')
      .execute();

    if (result.affected === 0) {
      return null;
    }

    return this.findOneActiveById(id);
  }

  async softDelete(id: number): Promise<SoftDeleteResult> {
    const result = await this.repo
      .createQueryBuilder()
      .update(Movie)
      .set({ deletedAt: () => 'NOW()' })
      .where('id = :id', { id })
      .andWhere('deleted_at IS NULL')
      .execute();

    if (result.affected === 1) {
      return { exists: true };
    }

    const existing = await this.repo
      .createQueryBuilder('movie')
      .where('movie.id = :id', { id })
      .withDeleted()
      .getOne();

    return { exists: existing !== null };
  }
}
