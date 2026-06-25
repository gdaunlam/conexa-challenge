import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { DEFAULT_MOVIE_PROVIDER, MovieProvider } from '../enums/movie-provider.enum';

@Entity('movies')
export class Movie extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ name: 'director', type: 'varchar', length: 100 })
  director!: string;

  @Column({ name: 'producer', type: 'varchar', length: 200 })
  producer!: string;

  @Column({ name: 'release_date', type: 'date' })
  releaseDate!: string;

  @Column({ name: 'episode_id', type: 'int', nullable: true })
  episodeId!: number | null;

  @Column({ name: 'opening_crawl', type: 'text', nullable: true })
  openingCrawl!: string | null;

  @Column({ type: 'varchar', length: 50, default: DEFAULT_MOVIE_PROVIDER })
  provider!: MovieProvider;

  @Column({ name: 'external_id', type: 'varchar', length: 100, nullable: true })
  externalId!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  attributes!: Record<string, unknown>;
}
