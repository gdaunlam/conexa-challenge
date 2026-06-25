import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMovieDto } from './update-movie.dto';

const validateDto = async (dto: UpdateMovieDto): Promise<string[]> => {
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.keys(e.constraints ?? {}));
};

describe('UpdateMovieDto', () => {
  it('accepts an empty body (idempotent no-op)', async () => {
    const dto = plainToInstance(UpdateMovieDto, {});
    expect(await validateDto(dto)).toEqual([]);
  });

  it('accepts a single optional field', async () => {
    const dto = plainToInstance(UpdateMovieDto, { title: 'New Title' });
    expect(await validateDto(dto)).toEqual([]);
  });

  it('accepts all optional fields with values', async () => {
    const dto = plainToInstance(UpdateMovieDto, {
      title: 'Updated',
      director: 'New Director',
      producer: 'New Producer',
      releaseDate: '2025-01-01',
      episodeId: 5,
      openingCrawl: 'New crawl',
      attributes: { characters: [] },
    });
    expect(await validateDto(dto)).toEqual([]);
  });

  it('rejects empty string for required fields (IsNotEmpty catches them)', async () => {
    const dto = plainToInstance(UpdateMovieDto, { title: '' });
    expect(await validateDto(dto)).toContain('isNotEmpty');
  });

  it('rejects invalid releaseDate', async () => {
    const dto = plainToInstance(UpdateMovieDto, { releaseDate: 'yesterday' });
    expect(await validateDto(dto)).toContain('isDateString');
  });

  it('rejects episodeId out of range', async () => {
    const dto = plainToInstance(UpdateMovieDto, { episodeId: 100 });
    expect(await validateDto(dto)).toContain('max');
  });

  it('openingCrawl accepts null (nullable column, se persiste como null)', async () => {
    const dtoNull = plainToInstance(UpdateMovieDto, { openingCrawl: null });
    expect(await validateDto(dtoNull)).toEqual([]);
  });

  it('openingCrawl accepts empty string (service decides DB persistence)', async () => {
    const dtoEmpty = plainToInstance(UpdateMovieDto, { openingCrawl: '' });
    expect(await validateDto(dtoEmpty)).toEqual([]);
  });
});
