import { getMetadataArgsStorage } from 'typeorm';
import { Movie } from './movie.entity';

describe('Movie entity', () => {
  const storage = getMetadataArgsStorage();

  it('is registered as entity on table movies', () => {
    const movieEntity = storage.tables.find((t) => t.target === Movie);
    expect(movieEntity).toBeDefined();
    expect(movieEntity?.name).toBe('movies');
  });

  it('has the required columns: title, director, producer, releaseDate', () => {
    const movieColumns = storage.columns.filter((c) => c.target === Movie);
    const columnNames = movieColumns.map((c) => c.propertyName);
    expect(columnNames).toContain('title');
    expect(columnNames).toContain('director');
    expect(columnNames).toContain('producer');
    expect(columnNames).toContain('releaseDate');
  });

  it('has the optional columns: episodeId, openingCrawl, externalId, attributes, provider', () => {
    const movieColumns = storage.columns.filter((c) => c.target === Movie);
    const columnNames = movieColumns.map((c) => c.propertyName);
    expect(columnNames).toContain('episodeId');
    expect(columnNames).toContain('openingCrawl');
    expect(columnNames).toContain('externalId');
    expect(columnNames).toContain('attributes');
    expect(columnNames).toContain('provider');
  });

  it('uses snake_case column names (explicit `name:` in @Column)', () => {
    const movieColumns = storage.columns.filter((c) => c.target === Movie);
    const columnNameByProperty = Object.fromEntries(
      movieColumns.map((c) => [c.propertyName, c.options.name ?? c.propertyName]),
    );
    expect(columnNameByProperty['episodeId']).toBe('episode_id');
    expect(columnNameByProperty['openingCrawl']).toBe('opening_crawl');
    expect(columnNameByProperty['releaseDate']).toBe('release_date');
    expect(columnNameByProperty['externalId']).toBe('external_id');
  });

  it('extends BaseEntity (inherits id, createdAt, updatedAt, deletedAt)', () => {
    const allColumnNames = storage.columns.map((c) => c.propertyName);
    expect(allColumnNames).toContain('id');
    expect(allColumnNames).toContain('createdAt');
    expect(allColumnNames).toContain('updatedAt');
    expect(allColumnNames).toContain('deletedAt');
  });
});
