import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class SyncLockService {
  private locked = false;

  acquire(): void {
    if (this.locked) {
      throw new ConflictException({
        error: 'Conflict',
        message: 'Sync already in progress',
        details: null,
      });
    }
    this.locked = true;
  }

  release(): void {
    this.locked = false;
  }

  isLocked(): boolean {
    return this.locked;
  }
}
