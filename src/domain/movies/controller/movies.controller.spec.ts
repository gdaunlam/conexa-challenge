import { ConflictException, NotFoundException } from '@nestjs/common';
import { MoviesController } from './movies.controller';
import { MoviesService } from '../service/movies.service';
import { SortBy, SortOrder } from './dto/find-movies-query.dto';

const buildServiceMock = (): jest.Mocked<MoviesService> => {
  return {
    findAll: jest.fn().mockResolvedValue({
      items: [],
      meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
    }),
    findOne: jest.fn().mockResolvedValue({
      id: '1',
      title: 'T',
      director: 'D',
      producer: 'P',
      releaseDate: '2025-01-01',
      episodeId: null,
      openingCrawl: null,
      provider: 'manual',
      externalId: null,
      attributes: {},
      createdAt: '2026-06-23T15:30:00.000Z',
      updatedAt: '2026-06-23T15:30:00.000Z',
    }),
    create: jest.fn().mockResolvedValue({
      status: 201,
      movie: {
        id: '1',
        title: 'T',
        director: 'D',
        producer: 'P',
        releaseDate: '2025-01-01',
        episodeId: null,
        openingCrawl: null,
        provider: 'manual',
        externalId: null,
        attributes: {},
        createdAt: '2026-06-23T15:30:00.000Z',
        updatedAt: '2026-06-23T15:30:00.000Z',
      },
    }),
    update: jest.fn().mockResolvedValue({
      id: '1',
      title: 'Updated',
      director: 'D',
      producer: 'P',
      releaseDate: '2025-01-01',
      episodeId: null,
      openingCrawl: null,
      provider: 'manual',
      externalId: null,
      attributes: {},
      createdAt: '2026-06-23T15:30:00.000Z',
      updatedAt: '2026-06-23T15:30:00.000Z',
    }),
    remove: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<MoviesService>;
};

describe('MoviesController', () => {
  let controller: MoviesController;
  let service: jest.Mocked<MoviesService>;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new MoviesController(service);
  });

  describe('findAll', () => {
    it('delegates to service with query', async () => {
      await controller.findAll({
        search: 'hope',
        sortBy: SortBy.Title,
        order: SortOrder.Asc,
        page: 1,
        limit: 20,
      });
      expect(service.findAll).toHaveBeenCalledWith({
        search: 'hope',
        sortBy: SortBy.Title,
        order: SortOrder.Asc,
        page: 1,
        limit: 20,
      });
    });

    it('returns the service result shape', async () => {
      const result = await controller.findAll({
        sortBy: SortBy.EpisodeId,
        order: SortOrder.Asc,
        page: 1,
        limit: 20,
      });
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('meta');
    });
  });

  describe('findOne', () => {
    it('parses id as integer and delegates', async () => {
      await controller.findOne(42);
      expect(service.findOne).toHaveBeenCalledWith(42);
    });

    it('propagates NotFoundException from service', async () => {
      service.findOne.mockRejectedValue(new NotFoundException('Movie 999 not found'));
      await expect(controller.findOne(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('delegates create and returns { status, movie }', async () => {
      const dto = {
        title: 'T',
        director: 'D',
        producer: 'P',
        releaseDate: '2025-01-01',
      };
      const result = await controller.create(dto);
      expect(result.status).toBe(201);
      expect(result.movie.title).toBe('T');
    });

    it('propagates ConflictException from service (externalId activo)', async () => {
      service.create.mockRejectedValue(new ConflictException('ExternalId already exists'));
      const dto = {
        title: 'T',
        director: 'D',
        producer: 'P',
        releaseDate: '2025-01-01',
        externalId: 'abc',
      };
      await expect(controller.create(dto)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('delegates update and returns movie DTO', async () => {
      const result = await controller.update(1, { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });

    it('propagates NotFoundException from service', async () => {
      service.update.mockRejectedValue(new NotFoundException('Movie 999 not found'));
      await expect(controller.update(999, { title: 'X' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('returns void when soft-delete succeeds', async () => {
      await expect(controller.remove(1)).resolves.toBeUndefined();
    });

    it('propagates NotFoundException from service', async () => {
      service.remove.mockRejectedValue(new NotFoundException('Movie 999 not found'));
      await expect(controller.remove(999)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
