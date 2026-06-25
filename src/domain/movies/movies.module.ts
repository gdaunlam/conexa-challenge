import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Movie } from './repository/movie.entity';
import { MoviesController } from './controller/movies.controller';
import { MoviesRepository } from './repository/movies.repository';
import { MoviesService } from './service/movies.service';

@Module({
  imports: [TypeOrmModule.forFeature([Movie]), AuthModule],
  controllers: [MoviesController],
  providers: [MoviesRepository, MoviesService],
  exports: [MoviesRepository, MoviesService],
})
export class MoviesModule {}
