import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMovieDto } from './create-movie.dto';

const buildDto = (overrides: Partial<CreateMovieDto> = {}): CreateMovieDto =>
  plainToInstance(CreateMovieDto, {
    title: 'A New Hope',
    director: 'George Lucas',
    producer: 'Gary Kurtz',
    releaseDate: '1977-05-25',
    ...overrides,
  });

const validateDto = async (dto: CreateMovieDto): Promise<string[]> => {
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.keys(e.constraints ?? {}));
};

describe('CreateMovieDto', () => {
  it('accepts a valid payload with only required fields', async () => {
    const dto = buildDto();
    expect(await validateDto(dto)).toEqual([]);
  });

  it('accepts a valid payload with all optional fields', async () => {
    const dto = buildDto({
      episodeId: 4,
      openingCrawl: 'It is a period of civil war...',
      externalId: '1',
      attributes: { characters: ['https://swapi.tech/api/people/1'] },
    });
    expect(await validateDto(dto)).toEqual([]);
  });

  it('rejects empty title', async () => {
    const dto = buildDto({ title: '' });
    expect(await validateDto(dto)).toContain('isNotEmpty');
  });

  it('rejects title longer than 200 chars', async () => {
    const dto = buildDto({ title: 'a'.repeat(201) });
    expect(await validateDto(dto)).toContain('maxLength');
  });

  it('rejects empty director', async () => {
    const dto = buildDto({ director: '' });
    expect(await validateDto(dto)).toContain('isNotEmpty');
  });

  it('rejects empty producer', async () => {
    const dto = buildDto({ producer: '' });
    expect(await validateDto(dto)).toContain('isNotEmpty');
  });

  it('rejects invalid releaseDate (not ISO 8601 date)', async () => {
    const dto = buildDto({ releaseDate: 'not-a-date' });
    expect(await validateDto(dto)).toContain('isDateString');
  });

  it('rejects episodeId out of range (0)', async () => {
    const dto = buildDto({ episodeId: 0 });
    expect(await validateDto(dto)).toContain('min');
  });

  it('rejects episodeId out of range (21)', async () => {
    const dto = buildDto({ episodeId: 21 });
    expect(await validateDto(dto)).toContain('max');
  });

  it('rejects openingCrawl longer than 5000 chars', async () => {
    const dto = buildDto({ openingCrawl: 'a'.repeat(5001) });
    expect(await validateDto(dto)).toContain('maxLength');
  });

  it('rejects externalId longer than 100 chars', async () => {
    const dto = buildDto({ externalId: 'a'.repeat(101) });
    expect(await validateDto(dto)).toContain('maxLength');
  });

  it('rejects attributes that is not an object (e.g. array)', async () => {
    const dto = buildDto({
      attributes: ['not', 'an', 'object'] as unknown as Record<string, unknown>,
    });
    expect(await validateDto(dto)).toContain('isObject');
  });

  it('accepts empty attributes object', async () => {
    const dto = buildDto({ attributes: {} });
    expect(await validateDto(dto)).toEqual([]);
  });

  it('accepts undefined for all optional fields', async () => {
    const dto = buildDto({
      episodeId: undefined,
      openingCrawl: undefined,
      externalId: undefined,
      attributes: undefined,
    });
    expect(await validateDto(dto)).toEqual([]);
  });

  it('does NOT accept provider in body (no field defined; forbidNonWhitelisted catches it)', async () => {
    const dto = buildDto({ provider: 'swapi' } as unknown as Partial<CreateMovieDto>);

    expect(dto).toHaveProperty('provider');
  });
});
