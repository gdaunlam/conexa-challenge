import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MoviesModule } from '../movies/movies.module';
import { SwapiClientService } from './service/swapi-client/swapi-client.service';
import { SyncController } from './controller/sync.controller';
import { SyncLockService } from './service/sync-lock.service';
import { SyncService } from './service/sync.service';

@Module({
  imports: [MoviesModule, AuthModule],
  controllers: [SyncController],
  providers: [SyncService, SwapiClientService, SyncLockService],
})
export class SyncModule {}
