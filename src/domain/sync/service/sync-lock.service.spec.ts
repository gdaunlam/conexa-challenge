import { ConflictException } from '@nestjs/common';
import { SyncLockService } from './sync-lock.service';

describe('SyncLockService', () => {
  let lock: SyncLockService;

  beforeEach(() => {
    lock = new SyncLockService();
  });

  it('starts unlocked', () => {
    expect(lock.isLocked()).toBe(false);
  });

  it('acquire sets the lock to locked', () => {
    lock.acquire();
    expect(lock.isLocked()).toBe(true);
  });

  it('second acquire while locked throws ConflictException (409)', () => {
    lock.acquire();
    expect(() => lock.acquire()).toThrow(ConflictException);
  });

  it('release sets the lock back to unlocked', () => {
    lock.acquire();
    lock.release();
    expect(lock.isLocked()).toBe(false);
  });

  it('after release, acquire works again', () => {
    lock.acquire();
    lock.release();
    expect(() => lock.acquire()).not.toThrow();
    expect(lock.isLocked()).toBe(true);
  });

  it('release is idempotent (calling twice does not break)', () => {
    lock.acquire();
    lock.release();
    expect(() => lock.release()).not.toThrow();
    expect(lock.isLocked()).toBe(false);
  });

  it('conflict response has shape { error, message, details: null }', () => {
    lock.acquire();
    try {
      lock.acquire();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      const response = (error as ConflictException).getResponse() as Record<string, unknown>;
      expect(response['error']).toBe('Conflict');
      expect(response['message']).toBe('Sync already in progress');
      expect(response['details']).toBeNull();
    }
  });
});
