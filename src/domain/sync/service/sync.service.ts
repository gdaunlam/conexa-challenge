import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SwapiClientService, SwapiError } from './swapi-client/swapi-client.service';
import { SwapiFilm } from './swapi-client/swapi.types';
import { SyncLockService } from './sync-lock.service';
import { MoviesRepository } from '../../movies/repository/movies.repository';

const LOG_CODE_SYNC_STARTED = 'sync_started';
const LOG_CODE_SYNC_COMPLETED = 'sync_completed';
const LOG_CODE_SYNC_LOCK_BUSY = 'sync_lock_busy';

const ERROR_MISSING_TITLE = "missing required field 'title'";
const ERROR_MISSING_DIRECTOR = "missing required field 'director'";
const ERROR_MISSING_PRODUCER = "missing required field 'producer'";
const ERROR_MISSING_RELEASE_DATE = "missing required field 'release_date'";

export interface SyncResult {
  fetched: number;
  created: number;
  updated: number;
  errors: string[];
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly swapiClient: SwapiClientService,
    private readonly syncLock: SyncLockService,
    private readonly moviesRepository: MoviesRepository,
  ) {}

  async syncSwapi(): Promise<SyncResult> {
    try {
      this.syncLock.acquire();
    } catch (error) {
      this.logger.warn(`sync skipped code=${LOG_CODE_SYNC_LOCK_BUSY}`);
      throw error;
    }

    this.logger.log(`sync started code=${LOG_CODE_SYNC_STARTED}`);

    let fetched = 0;
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    try {
      const films = await this.fetchWithErrorMapping();
      fetched = films.length;

      for (const film of films) {
        try {
          const outcome = await this.processFilm(film);
          if (outcome === 'created') created++;
          else if (outcome === 'updated') updated++;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`film uid=${film.uid}: ${message}`);
        }
      }

      this.logger.log(
        `sync completed code=${LOG_CODE_SYNC_COMPLETED} fetched=${fetched} created=${created} updated=${updated} errors=${errors.length}`,
      );

      return { fetched, created, updated, errors };
    } finally {
      this.syncLock.release();
    }
  }

  private async fetchWithErrorMapping(): Promise<SwapiFilm[]> {
    try {
      return await this.swapiClient.fetchAllFilms();
    } catch (error) {
      if (error instanceof SwapiError) {
        throw new ServiceUnavailableException({
          error: 'Service Unavailable',
          message: `SWAPI unavailable: ${error.message}`,
          details: { status: error.status },
        });
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: `SWAPI unreachable: ${message}`,
        details: null,
      });
    }
  }

  private async processFilm(
    film: SwapiFilm,
  ): Promise<'created' | 'updated' | 'skipped-soft-deleted'> {
    const properties = film.properties;
    if (properties.title === undefined || properties.title === '') {
      throw new Error(ERROR_MISSING_TITLE);
    }
    if (properties.director === undefined || properties.director === '') {
      throw new Error(ERROR_MISSING_DIRECTOR);
    }
    if (properties.producer === undefined || properties.producer === '') {
      throw new Error(ERROR_MISSING_PRODUCER);
    }
    if (properties.release_date === undefined || properties.release_date === '') {
      throw new Error(ERROR_MISSING_RELEASE_DATE);
    }

    const input = {
      externalId: film.uid,
      title: properties.title,
      director: properties.director,
      producer: properties.producer,
      releaseDate: properties.release_date,
      episodeId: properties.episode_id ?? null,
      openingCrawl: properties.opening_crawl ?? null,

      attributes: {
        characters: properties.characters ?? [],
        planets: properties.planets ?? [],
        starships: properties.starships ?? [],
        vehicles: properties.vehicles ?? [],
        species: properties.species ?? [],
      },
    };

    const existing = await this.moviesRepository.findOneByProviderAndExternalId('swapi', film.uid);

    if (existing === null || existing === undefined) {
      await this.moviesRepository.createSwapiFilm(input);
      return 'created';
    }

    if (existing.deletedAt !== null) {
      return 'skipped-soft-deleted';
    }

    await this.moviesRepository.updateSwapiFilm(Number(existing.id), {
      title: input.title,
      director: input.director,
      producer: input.producer,
      releaseDate: input.releaseDate,
      episodeId: input.episodeId,
      openingCrawl: input.openingCrawl,
      attributes: input.attributes,
    });

    return 'updated';
  }
}
