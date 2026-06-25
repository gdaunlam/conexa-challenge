import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { HealthController } from './health.controller';
import { DATABASE_UNAVAILABLE_MESSAGE, HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let dataSource: { query: jest.Mock };

  const buildModule = async (queryImpl: jest.Mock): Promise<void> => {
    dataSource = { query: queryImpl };
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    controller = moduleRef.get<HealthController>(HealthController);
  };

  describe('when the database probe resolves', () => {
    beforeEach(async () => {
      await buildModule(jest.fn().mockResolvedValue([{ '?column?': 1 }]));
    });

    it('returns status ok', async () => {
      const result = await controller.check();

      expect(result.status).toBe('ok');
    });

    it('returns a valid ISO 8601 UTC timestamp', async () => {
      const result = await controller.check();

      expect(typeof result.timestamp).toBe('string');
      expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('exposes the process uptime as a non-negative number', async () => {
      const result = await controller.check();

      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('returns a fresh timestamp on each call', async () => {
      const first = await controller.check();
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await controller.check();

      expect(first.timestamp).not.toBe(second.timestamp);
    });
  });

  describe('when the database probe rejects', () => {
    beforeEach(async () => {
      await buildModule(jest.fn().mockRejectedValue(new Error('Connection terminated')));
    });

    it('throws ServiceUnavailableException with the documented shape', async () => {
      await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);

      try {
        await controller.check();
      } catch (exception) {
        const response = (exception as ServiceUnavailableException).getResponse() as Record<
          string,
          unknown
        >;
        expect(response).toMatchObject({
          error: 'Service Unavailable',
          message: DATABASE_UNAVAILABLE_MESSAGE,
        });
      }
    });
  });
});
