import { SyncController } from './sync.controller';
import { SyncService } from '../service/sync.service';

describe('SyncController', () => {
  let controller: SyncController;
  let service: jest.Mocked<SyncService>;

  beforeEach(() => {
    service = {
      syncSwapi: jest.fn().mockResolvedValue({
        fetched: 6,
        created: 0,
        updated: 6,
        errors: [],
      }),
    } as unknown as jest.Mocked<SyncService>;
    controller = new SyncController(service);
  });

  it('delegates sync() to SyncService.syncSwapi', async () => {
    const result = await controller.sync();
    expect(service.syncSwapi).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      fetched: 6,
      created: 0,
      updated: 6,
      errors: [],
    });
  });

  it('propagates ConflictException from service (409 lock busy)', async () => {
    const { ConflictException } = await import('@nestjs/common');
    service.syncSwapi.mockRejectedValue(new ConflictException('Sync already in progress'));
    await expect(controller.sync()).rejects.toBeInstanceOf(ConflictException);
  });

  it('propagates ServiceUnavailableException from service (502 SWAPI down)', async () => {
    const { ServiceUnavailableException } = await import('@nestjs/common');
    service.syncSwapi.mockRejectedValue(new ServiceUnavailableException('SWAPI down'));
    await expect(controller.sync()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
