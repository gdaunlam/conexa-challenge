import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
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
    const buildRes = (): Response => {
      const res = {
        status: jest.fn().mockReturnThis(),
      } as unknown as Response;
      return res;
    };

    it('sets HTTP 201 when service returns status 201 (new movie)', async () => {
      service.create.mockResolvedValue({
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
      });
      const res = buildRes();
      const dto = {
        title: 'T',
        director: 'D',
        producer: 'P',
        releaseDate: '2025-01-01',
      };
      await controller.create(dto, res);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('sets HTTP 200 when service returns status 200 (reactivated soft-deleted)', async () => {
      service.create.mockResolvedValue({
        status: 200,
        movie: {
          id: '1',
          title: 'T',
          director: 'D',
          producer: 'P',
          releaseDate: '2025-01-01',
          episodeId: null,
          openingCrawl: null,
          provider: 'manual',
          externalId: 'abc',
          attributes: {},
          createdAt: '2026-06-23T15:30:00.000Z',
          updatedAt: '2026-06-23T15:30:00.000Z',
        },
      });
      const res = buildRes();
      const dto = {
        title: 'T',
        director: 'D',
        producer: 'P',
        releaseDate: '2025-01-01',
        externalId: 'abc',
      };
      const movie = await controller.create(dto, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(movie.externalId).toBe('abc');
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
      await expect(controller.create(dto, buildRes())).rejects.toBeInstanceOf(ConflictException);
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
