import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { MoviesRepository } from '../../movies/repository/movies.repository';
import { SwapiClientService, SwapiError } from './swapi-client/swapi-client.service';
import { SwapiFilm } from './swapi-client/swapi.types';
import { SyncLockService } from './sync-lock.service';
import { SyncService } from './sync.service';

const buildFilm = (uid: string, overrides: Partial<SwapiFilm['properties']> = {}): SwapiFilm => ({
  uid,
  properties: {
    title: 'A New Hope',
    episode_id: 4,
    opening_crawl: 'It is a period of civil war...',
    director: 'George Lucas',
    producer: 'Gary Kurtz',
    release_date: '1977-05-25',
    characters: ['url-char'],
    planets: ['url-planet'],
    starships: ['url-ship'],
    vehicles: [],
    species: ['url-species'],
    ...overrides,
  },
});

describe('SyncService', () => {
  let service: SyncService;
  let swapiClient: jest.Mocked<SwapiClientService>;
  let lock: SyncLockService;
  let repo: jest.Mocked<MoviesRepository>;

  beforeEach(() => {
    swapiClient = {
      fetchAllFilms: jest.fn(),
    } as unknown as jest.Mocked<SwapiClientService>;
    lock = new SyncLockService();
    repo = {
      findOneByProviderAndExternalId: jest.fn(),
      createSwapiFilm: jest.fn().mockImplementation(async (input) => ({
        id: '1',
        ...input,
        provider: 'swapi',
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      updateSwapiFilm: jest.fn().mockImplementation(async (id, partial) => ({
        id: String(id),
        externalId: partial.title ?? 'updated',
        title: partial.title ?? 'X',
        director: partial.director ?? 'X',
        producer: partial.producer ?? 'X',
        releaseDate: partial.releaseDate ?? '1977-05-25',
        episodeId: partial.episodeId ?? null,
        openingCrawl: partial.openingCrawl ?? null,
        provider: 'swapi',
        attributes: partial.attributes ?? {},
        deletedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    } as unknown as jest.Mocked<MoviesRepository>;
    service = new SyncService(swapiClient, lock, repo);
  });

  describe('happy path', () => {
    it('returns summary with all counts and empty errors on first sync', async () => {
      swapiClient.fetchAllFilms.mockResolvedValue([buildFilm('1'), buildFilm('2'), buildFilm('3')]);
      repo.findOneByProviderAndExternalId.mockResolvedValue(null);

      const result = await service.syncSwapi();

      expect(result).toEqual({
        fetched: 3,
        created: 3,
        updated: 0,
        errors: [],
      });
    });

    it('counts updates when films already exist (idempotent re-run)', async () => {
      swapiClient.fetchAllFilms.mockResolvedValue([buildFilm('1')]);
      const existing = {
        id: '1',
        deletedAt: null,
      } as unknown as Awaited<ReturnType<typeof repo.findOneByProviderAndExternalId>>;
      repo.findOneByProviderAndExternalId.mockResolvedValue(existing);

      const result = await service.syncSwapi();

      expect(result).toEqual({
        fetched: 1,
        created: 0,
        updated: 1,
        errors: [],
      });
      expect(repo.updateSwapiFilm).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          title: 'A New Hope',
          director: 'George Lucas',
        }),
      );
    });

    it('skips soft-deleted films (does not reactivate, does not count as error)', async () => {
      swapiClient.fetchAllFilms.mockResolvedValue([buildFilm('1')]);
      const softDeleted = {
        id: '1',
        deletedAt: new Date(),
      } as unknown as Awaited<ReturnType<typeof repo.findOneByProviderAndExternalId>>;
      repo.findOneByProviderAndExternalId.mockResolvedValue(softDeleted);

      const result = await service.syncSwapi();

      expect(result).toEqual({
        fetched: 1,
        created: 0,
        updated: 0,
        errors: [],
      });
      expect(repo.createSwapiFilm).not.toHaveBeenCalled();
      expect(repo.updateSwapiFilm).not.toHaveBeenCalled();
    });
  });

  describe('partial errors', () => {
    it('collects validation errors per film and continues processing', async () => {
      swapiClient.fetchAllFilms.mockResolvedValue([
        buildFilm('1'),
        buildFilm('2', { title: '' }),
        buildFilm('3'),
        buildFilm('4', { director: '' }),
      ]);
      repo.findOneByProviderAndExternalId.mockResolvedValue(null);

      const result = await service.syncSwapi();

      expect(result.fetched).toBe(4);
      expect(result.created).toBe(2);
      expect(result.updated).toBe(0);
      expect(result.errors).toContain(`film uid=2: missing required field 'title'`);
      expect(result.errors).toContain(`film uid=4: missing required field 'director'`);
      expect(result.errors).toHaveLength(2);
    });

    it('reports missing producer and release_date with specific messages', async () => {
      swapiClient.fetchAllFilms.mockResolvedValue([
        buildFilm('1', { producer: '' }),
        buildFilm('2', { release_date: '' }),
      ]);
      repo.findOneByProviderAndExternalId.mockResolvedValue(null);

      const result = await service.syncSwapi();

      expect(result.errors).toContain(`film uid=1: missing required field 'producer'`);
      expect(result.errors).toContain(`film uid=2: missing required field 'release_date'`);
    });
  });

  describe('lock', () => {
    it('throws ConflictException (409) if a sync is already in progress', async () => {
      swapiClient.fetchAllFilms.mockImplementation(async () => {
        await expect(service.syncSwapi()).rejects.toBeInstanceOf(ConflictException);
        return [];
      });

      await service.syncSwapi();
    });

    it('releases the lock even when SWAPI throws', async () => {
      swapiClient.fetchAllFilms.mockRejectedValue(new SwapiError('SWAPI down', 503));

      await expect(service.syncSwapi()).rejects.toBeInstanceOf(ServiceUnavailableException);

      expect(lock.isLocked()).toBe(false);
    });

    it('releases the lock even when processFilm throws an unexpected error', async () => {
      swapiClient.fetchAllFilms.mockResolvedValue([buildFilm('1')]);

      repo.createSwapiFilm.mockRejectedValue(new Error('DB connection lost'));

      const result = await service.syncSwapi();

      expect(result.errors).toContain(`film uid=1: DB connection lost`);
      expect(lock.isLocked()).toBe(false);
    });

    it('treats null OR undefined from findOneByProviderAndExternalId as new film', async () => {
      swapiClient.fetchAllFilms.mockResolvedValue([buildFilm('1')]);
      repo.findOneByProviderAndExternalId.mockResolvedValue(undefined as unknown as null);

      const result = await service.syncSwapi();

      expect(result.created).toBe(1);
      expect(result.errors).toEqual([]);
    });
  });

  describe('SWAPI failures', () => {
    it('throws ServiceUnavailableException (502) when SwapiError', async () => {
      swapiClient.fetchAllFilms.mockRejectedValue(new SwapiError('SWAPI down', 503));

      await expect(service.syncSwapi()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('throws ServiceUnavailableException (502) when generic network error', async () => {
      swapiClient.fetchAllFilms.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.syncSwapi()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('attributes mapping', () => {
    it('persists the 5 SWAPI keys in attributes JSONB', async () => {
      swapiClient.fetchAllFilms.mockResolvedValue([buildFilm('1')]);
      repo.findOneByProviderAndExternalId.mockResolvedValue(null);

      await service.syncSwapi();

      const input = repo.createSwapiFilm.mock.calls[0]?.[0];
      expect(input?.attributes).toEqual({
        characters: ['url-char'],
        planets: ['url-planet'],
        starships: ['url-ship'],
        vehicles: [],
        species: ['url-species'],
      });
    });

    it('defaults missing arrays to empty arrays', async () => {
      swapiClient.fetchAllFilms.mockResolvedValue([
        buildFilm('1', { characters: undefined, planets: undefined }),
      ]);
      repo.findOneByProviderAndExternalId.mockResolvedValue(null);

      await service.syncSwapi();

      const input = repo.createSwapiFilm.mock.calls[0]?.[0];
      expect(input?.attributes).toEqual({
        characters: [],
        planets: [],
        starships: ['url-ship'],
        vehicles: [],
        species: ['url-species'],
      });
    });
  });
});
