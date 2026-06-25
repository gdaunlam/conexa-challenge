import { Repository } from 'typeorm';
import { Movie } from './movie.entity';
import { DEFAULT_MOVIE_PROVIDER } from '../enums/movie-provider.enum';
import { SortBy, SortOrder } from '../controller/dto/find-movies-query.dto';
import { MoviesRepository } from './movies.repository';

const buildRepoMock = (): jest.Mocked<Repository<Movie>> => {
  return {
    createQueryBuilder: jest.fn().mockImplementation(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
    })),
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockImplementation(async (movie) => movie as Movie),
    create: jest.fn().mockImplementation((input) => input as Movie),
  } as unknown as jest.Mocked<Repository<Movie>>;
};

describe('MoviesRepository', () => {
  let repository: MoviesRepository;
  let repoMock: jest.Mocked<Repository<Movie>>;

  beforeEach(() => {
    repoMock = buildRepoMock();
    repository = new MoviesRepository(repoMock);
  });

  describe('findAll', () => {
    it('filters by deleted_at IS NULL by default', async () => {
      await repository.findAll({
        sortBy: SortBy.EpisodeId,
        order: SortOrder.Asc,
        page: 1,
        limit: 20,
      });

      const qb = repoMock.createQueryBuilder.mock.results[0]!.value;
      expect(qb.where).toHaveBeenCalledWith('movie.deleted_at IS NULL');
    });

    it('adds word_similarity filter when search is provided', async () => {
      await repository.findAll({
        search: 'hope',
        sortBy: SortBy.EpisodeId,
        order: SortOrder.Asc,
        page: 1,
        limit: 20,
      });

      const qb = repoMock.createQueryBuilder.mock.results[0]!.value;
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(movie.title <% :search OR movie.director <% :search)',
        { search: 'hope' },
      );
    });

    it('does NOT add search filter when search is empty string', async () => {
      await repository.findAll({
        search: '',
        sortBy: SortBy.EpisodeId,
        order: SortOrder.Asc,
        page: 1,
        limit: 20,
      });

      const qb = repoMock.createQueryBuilder.mock.results[0]!.value;
      const andWhereCalls = qb.andWhere.mock.calls as Array<[unknown, unknown?]>;
      const searchCall = andWhereCalls.find((c) => String(c[0]).includes('<%'));
      expect(searchCall).toBeUndefined();
    });

    it('maps sortBy enum to column name correctly', async () => {
      await repository.findAll({
        sortBy: SortBy.ReleaseDate,
        order: SortOrder.Desc,
        page: 1,
        limit: 20,
      });

      const qb = repoMock.createQueryBuilder.mock.results[0]!.value;
      expect(qb.orderBy).toHaveBeenCalledWith('movie.release_date', 'DESC');
    });

    it('maps sortBy.EpisodeId to movie.episode_id', async () => {
      await repository.findAll({
        sortBy: SortBy.EpisodeId,
        order: SortOrder.Asc,
        page: 1,
        limit: 20,
      });

      const qb = repoMock.createQueryBuilder.mock.results[0]!.value;
      expect(qb.orderBy).toHaveBeenCalledWith('movie.episode_id', 'ASC');
    });

    it('calculates skip from page and limit', async () => {
      await repository.findAll({
        sortBy: SortBy.EpisodeId,
        order: SortOrder.Asc,
        page: 3,
        limit: 10,
      });

      const qb = repoMock.createQueryBuilder.mock.results[0]!.value;
      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(10);
    });

    it('returns { data, total } from getManyAndCount', async () => {
      const result = await repository.findAll({
        sortBy: SortBy.EpisodeId,
        order: SortOrder.Asc,
        page: 1,
        limit: 20,
      });
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
    });
  });

  describe('findOneActiveById', () => {
    it('queries with deleted_at IS NULL filter', async () => {
      await repository.findOneActiveById(42);

      const qb = repoMock.createQueryBuilder.mock.results[0]!.value;
      expect(qb.where).toHaveBeenCalledWith('movie.id = :id', { id: 42 });
      expect(qb.andWhere).toHaveBeenCalledWith('movie.deleted_at IS NULL');
    });
  });

  describe('findOneByProviderAndExternalId', () => {
    it('includes soft-deleted (uses withDeleted)', async () => {
      await repository.findOneByProviderAndExternalId(DEFAULT_MOVIE_PROVIDER, 'abc');

      const qb = repoMock.createQueryBuilder.mock.results[0]!.value;
      expect(qb.withDeleted).toHaveBeenCalled();
    });

    it('queries by provider AND external_id', async () => {
      await repository.findOneByProviderAndExternalId(DEFAULT_MOVIE_PROVIDER, 'abc');

      const qb = repoMock.createQueryBuilder.mock.results[0]!.value;
      expect(qb.where).toHaveBeenCalledWith('movie.provider = :provider', { provider: 'manual' });
      expect(qb.andWhere).toHaveBeenCalledWith('movie.external_id = :externalId', {
        externalId: 'abc',
      });
    });
  });

  describe('createManual', () => {
    it('always sets provider to manual', async () => {
      await repository.createManual({
        title: 'A New Hope',
        director: 'George Lucas',
        producer: 'Gary Kurtz',
        releaseDate: '1977-05-25',
      });

      const created = repoMock.create.mock.calls[0]?.[0];
      expect((created as Movie).provider).toBe('manual');
    });

    it('defaults externalId to null when not provided', async () => {
      await repository.createManual({
        title: 'A New Hope',
        director: 'George Lucas',
        producer: 'Gary Kurtz',
        releaseDate: '1977-05-25',
      });

      const created = repoMock.create.mock.calls[0]?.[0];
      expect((created as Movie).externalId).toBeNull();
    });

    it('defaults attributes to {} when not provided', async () => {
      await repository.createManual({
        title: 'A New Hope',
        director: 'George Lucas',
        producer: 'Gary Kurtz',
        releaseDate: '1977-05-25',
      });

      const created = repoMock.create.mock.calls[0]?.[0];
      expect((created as Movie).attributes).toEqual({});
    });
  });

  describe('softDelete', () => {
    const buildUpdateQb = (affected: number) => ({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected, raw: [] }),
    });

    const buildCheckQb = (existing: Movie | null) => ({
      where: jest.fn().mockReturnThis(),
      withDeleted: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(existing),
    });

    it('returns exists=true when UPDATE affects 1 row (active -> deleted)', async () => {
      repoMock.createQueryBuilder
        .mockReturnValueOnce(
          buildUpdateQb(1) as unknown as ReturnType<typeof repoMock.createQueryBuilder>,
        )
        .mockReturnValueOnce(
          buildCheckQb(null) as unknown as ReturnType<typeof repoMock.createQueryBuilder>,
        );

      const result = await repository.softDelete(1);
      expect(result).toEqual({ exists: true });
    });

    it('returns exists=true when UPDATE affects 0 rows but row exists (already soft-deleted)', async () => {
      const existingMovie = { id: 1, deletedAt: new Date() } as unknown as Movie;
      repoMock.createQueryBuilder
        .mockReturnValueOnce(
          buildUpdateQb(0) as unknown as ReturnType<typeof repoMock.createQueryBuilder>,
        )
        .mockReturnValueOnce(
          buildCheckQb(existingMovie) as unknown as ReturnType<typeof repoMock.createQueryBuilder>,
        );

      const result = await repository.softDelete(1);
      expect(result).toEqual({ exists: true });
    });

    it('returns exists=false when row never existed', async () => {
      repoMock.createQueryBuilder
        .mockReturnValueOnce(
          buildUpdateQb(0) as unknown as ReturnType<typeof repoMock.createQueryBuilder>,
        )
        .mockReturnValueOnce(
          buildCheckQb(null) as unknown as ReturnType<typeof repoMock.createQueryBuilder>,
        );

      const result = await repository.softDelete(999);
      expect(result).toEqual({ exists: false });
    });
  });

  describe('createSwapiFilm', () => {
    it('always sets provider to swapi', async () => {
      await repository.createSwapiFilm({
        externalId: '1',
        title: 'A New Hope',
        director: 'George Lucas',
        producer: 'Gary Kurtz',
        releaseDate: '1977-05-25',
      });

      const created = repoMock.create.mock.calls[0]?.[0];
      expect((created as Movie).provider).toBe('swapi');
    });

    it('uses the supplied externalId (NOT a default)', async () => {
      await repository.createSwapiFilm({
        externalId: '42',
        title: 'A New Hope',
        director: 'George Lucas',
        producer: 'Gary Kurtz',
        releaseDate: '1977-05-25',
      });

      const created = repoMock.create.mock.calls[0]?.[0];
      expect((created as Movie).externalId).toBe('42');
    });

    it('defaults attributes to {} when not provided', async () => {
      await repository.createSwapiFilm({
        externalId: '1',
        title: 'A New Hope',
        director: 'George Lucas',
        producer: 'Gary Kurtz',
        releaseDate: '1977-05-25',
      });

      const created = repoMock.create.mock.calls[0]?.[0];
      expect((created as Movie).attributes).toEqual({});
    });
  });

  describe('updateSwapiFilm', () => {
    const buildUpdateSwapiQb = (affected: number) => ({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected, raw: [] }),
    });

    const buildFindOneActiveQb = (movie: Movie | null) => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(movie),
    });

    it('returns the movie when update affects 1 row', async () => {
      repoMock.createQueryBuilder
        .mockReturnValueOnce(
          buildUpdateSwapiQb(1) as unknown as ReturnType<typeof repoMock.createQueryBuilder>,
        )
        .mockReturnValueOnce(
          buildFindOneActiveQb({ id: 1 } as unknown as Movie) as unknown as ReturnType<
            typeof repoMock.createQueryBuilder
          >,
        );

      const result = await repository.updateSwapiFilm(1, { title: 'Updated' });
      expect(result).toEqual({ id: 1 });
    });

    it('returns null when update affects 0 rows (not found or soft-deleted)', async () => {
      repoMock.createQueryBuilder.mockReturnValueOnce(
        buildUpdateSwapiQb(0) as unknown as ReturnType<typeof repoMock.createQueryBuilder>,
      );

      const result = await repository.updateSwapiFilm(999, { title: 'X' });
      expect(result).toBeNull();
    });

    it('filters by deleted_at IS NULL (does not update soft-deleted movies)', async () => {
      const updateQb = buildUpdateSwapiQb(0);
      repoMock.createQueryBuilder.mockReturnValueOnce(
        updateQb as unknown as ReturnType<typeof repoMock.createQueryBuilder>,
      );

      await repository.updateSwapiFilm(1, { title: 'X' });

      expect(updateQb.andWhere).toHaveBeenCalledWith('deleted_at IS NULL');
    });

    it('short-circuits to findOneActiveById when partial has no fields', async () => {
      const findQb = buildFindOneActiveQb(null);
      repoMock.createQueryBuilder.mockReturnValueOnce(
        findQb as unknown as ReturnType<typeof repoMock.createQueryBuilder>,
      );

      await repository.updateSwapiFilm(1, {});

      expect(repoMock.createQueryBuilder).toHaveBeenCalledTimes(1);
      expect(findQb.where).toHaveBeenCalledWith('movie.id = :id', { id: 1 });
    });
  });
});
