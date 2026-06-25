import { ConflictException, NotFoundException } from '@nestjs/common';
import { Movie } from '../repository/movie.entity';
import { FindMoviesQueryDto, SortBy, SortOrder } from '../controller/dto/find-movies-query.dto';
import { MoviesRepository } from '../repository/movies.repository';
import { MoviesService } from './movies.service';

const buildMovie = (overrides: Partial<Movie> = {}): Movie =>
  ({
    id: 1,
    title: 'A New Hope',
    director: 'George Lucas',
    producer: 'Gary Kurtz',
    releaseDate: '1977-05-25',
    episodeId: 4,
    openingCrawl: null,
    provider: 'manual',
    externalId: null,
    attributes: {},
    createdAt: new Date('2026-06-23T15:30:00.000Z'),
    updatedAt: new Date('2026-06-23T15:30:00.000Z'),
    deletedAt: null,
    ...overrides,
  }) as Movie;

const buildRepoMock = (): jest.Mocked<MoviesRepository> => {
  return {
    findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    findOneActiveById: jest.fn().mockResolvedValue(null),
    findOneByProviderAndExternalId: jest.fn().mockResolvedValue(null),
    createManual: jest.fn().mockImplementation(async (input) => buildMovie({ ...input })),
    reactivateAndReplace: jest.fn().mockResolvedValue(null),
    updateActive: jest.fn().mockResolvedValue(null),
    softDelete: jest.fn().mockResolvedValue({ exists: false }),
  } as unknown as jest.Mocked<MoviesRepository>;
};

describe('MoviesService', () => {
  let service: MoviesService;
  let repo: jest.Mocked<MoviesRepository>;

  beforeEach(() => {
    repo = buildRepoMock();
    service = new MoviesService(repo);
  });

  describe('findAll', () => {
    it('returns paginated shape with items and meta (no attributes)', async () => {
      const movie = buildMovie();
      repo.findAll.mockResolvedValue({ data: [movie], total: 1 });

      const query: FindMoviesQueryDto = {
        search: undefined,
        sortBy: SortBy.EpisodeId,
        order: SortOrder.Asc,
        page: 1,
        limit: 20,
      };

      const result = await service.findAll(query);

      expect(result.items).toHaveLength(1);

      expect(result.items[0]?.attributes).toBeUndefined();
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    });

    it('calculates totalPages correctly with ceil', async () => {
      repo.findAll.mockResolvedValue({ data: [], total: 25 });

      const query: FindMoviesQueryDto = {
        page: 1,
        limit: 10,
        sortBy: SortBy.Title,
        order: SortOrder.Asc,
      };
      const result = await service.findAll(query);
      expect(result.meta.totalPages).toBe(3);
    });

    it('falls back to totalPages=1 when total is 0', async () => {
      repo.findAll.mockResolvedValue({ data: [], total: 0 });
      const query: FindMoviesQueryDto = {
        page: 1,
        limit: 20,
        sortBy: SortBy.Title,
        order: SortOrder.Asc,
      };
      const result = await service.findAll(query);
      expect(result.meta.totalPages).toBe(1);
    });
  });

  describe('findOne', () => {
    it('returns the movie DTO with attributes', async () => {
      const movie = buildMovie({ attributes: { characters: ['url1'] } });
      repo.findOneActiveById.mockResolvedValue(movie);

      const result = await service.findOne(1);

      expect(result.id).toBe('1');
      expect(result.attributes).toEqual({ characters: ['url1'] });
    });

    it('throws NotFoundException when movie does not exist', async () => {
      repo.findOneActiveById.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when movie is soft-deleted', async () => {
      repo.findOneActiveById.mockResolvedValue(null);
      await expect(service.findOne(1)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('inserts a new movie when no externalId is provided (201)', async () => {
      const dto = {
        title: 'New Movie',
        director: 'D',
        producer: 'P',
        releaseDate: '2025-01-01',
      };
      const created = buildMovie({ title: 'New Movie' });
      repo.createManual.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(result.status).toBe(201);
      expect(result.movie.title).toBe('New Movie');
      expect(repo.findOneByProviderAndExternalId).not.toHaveBeenCalled();
    });

    it('inserts when externalId is provided but not found (201)', async () => {
      const dto = {
        title: 'New Movie',
        director: 'D',
        producer: 'P',
        releaseDate: '2025-01-01',
        externalId: 'abc',
      };
      repo.findOneByProviderAndExternalId.mockResolvedValue(null);
      const created = buildMovie({ externalId: 'abc' });
      repo.createManual.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(result.status).toBe(201);
    });

    it('throws 409 when externalId matches an active movie', async () => {
      const existing = buildMovie({ externalId: 'abc', deletedAt: null });
      repo.findOneByProviderAndExternalId.mockResolvedValue(existing);

      const dto = {
        title: 'T',
        director: 'D',
        producer: 'P',
        releaseDate: '2025-01-01',
        externalId: 'abc',
      };
      await expect(service.create(dto)).rejects.toBeInstanceOf(ConflictException);
      expect(repo.createManual).not.toHaveBeenCalled();
    });

    it('reactivates when externalId matches a soft-deleted movie (200)', async () => {
      const softDeleted = buildMovie({ externalId: 'abc', deletedAt: new Date() });
      repo.findOneByProviderAndExternalId.mockResolvedValue(softDeleted);

      const reactivated = buildMovie({ externalId: 'abc', deletedAt: null });
      repo.reactivateAndReplace.mockResolvedValue(reactivated);

      const dto = {
        title: 'Updated',
        director: 'D',
        producer: 'P',
        releaseDate: '2025-01-01',
        externalId: 'abc',
      };

      const result = await service.create(dto);

      expect(result.status).toBe(200);
      expect(result.movie.externalId).toBe('abc');
      expect(repo.createManual).not.toHaveBeenCalled();
    });

    it('normalizes undefined optional fields to null (PUT pura)', async () => {
      const dto = {
        title: 'T',
        director: 'D',
        producer: 'P',
        releaseDate: '2025-01-01',
      };

      await service.create(dto);

      const input = repo.createManual.mock.calls[0]?.[0];
      expect(input?.episodeId).toBeNull();
      expect(input?.openingCrawl).toBeNull();
      expect(input?.externalId).toBeNull();
      expect(input?.attributes).toEqual({});
    });
  });

  describe('update', () => {
    it('updates and returns the movie', async () => {
      const updated = buildMovie({ title: 'Updated' });
      repo.updateActive.mockResolvedValue(updated);

      const result = await service.update(1, { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });

    it('throws NotFoundException when movie does not exist', async () => {
      repo.updateActive.mockResolvedValue(null);
      await expect(service.update(999, { title: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('returns void when soft-delete affects existing row', async () => {
      repo.softDelete.mockResolvedValue({ exists: true });
      await expect(service.remove(1)).resolves.toBeUndefined();
    });

    it('throws NotFoundException when id never existed', async () => {
      repo.softDelete.mockResolvedValue({ exists: false });
      await expect(service.remove(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('id serialization', () => {
    it('serializes movie.id as string', async () => {
      const movie = buildMovie({ id: '12345' });
      repo.findOneActiveById.mockResolvedValue(movie);

      const result = await service.findOne(12345);
      expect(result.id).toBe('12345');
      expect(typeof result.id).toBe('string');
    });

    it('preserves a large id as string (verifies toString path)', async () => {
      const movie = buildMovie({ id: '9007199254740993' });
      repo.findOneActiveById.mockResolvedValue(movie);

      const largeId = Number.parseInt('9007199254740993', 10);
      const result = await service.findOne(largeId);
      expect(result.id).toBe('9007199254740993');
      expect(typeof result.id).toBe('string');
    });
  });
});
