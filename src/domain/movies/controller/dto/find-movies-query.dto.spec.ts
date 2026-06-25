import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FindMoviesQueryDto, SortBy, SortOrder } from './find-movies-query.dto';

const validateDto = async (dto: FindMoviesQueryDto): Promise<string[]> => {
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.keys(e.constraints ?? {}));
};

describe('FindMoviesQueryDto', () => {
  it('accepts an empty object (all defaults)', async () => {
    const dto = plainToInstance(FindMoviesQueryDto, {});
    expect(await validateDto(dto)).toEqual([]);
    expect(dto.sortBy).toBe(SortBy.EpisodeId);
    expect(dto.order).toBe(SortOrder.Asc);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('accepts all valid fields', async () => {
    const dto = plainToInstance(FindMoviesQueryDto, {
      search: 'hope',
      sortBy: SortBy.Title,
      order: SortOrder.Desc,
      page: 2,
      limit: 50,
    });
    expect(await validateDto(dto)).toEqual([]);
    expect(dto.search).toBe('hope');
    expect(dto.sortBy).toBe(SortBy.Title);
    expect(dto.order).toBe(SortOrder.Desc);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(50);
  });

  it('rejects invalid sortBy (not in enum)', async () => {
    const dto = plainToInstance(FindMoviesQueryDto, { sortBy: 'invalid' });
    expect(await validateDto(dto)).toContain('isEnum');
  });

  it('rejects invalid order (not in enum)', async () => {
    const dto = plainToInstance(FindMoviesQueryDto, { order: 'sideways' });
    expect(await validateDto(dto)).toContain('isEnum');
  });

  it('rejects page < 1', async () => {
    const dto = plainToInstance(FindMoviesQueryDto, { page: 0 });
    expect(await validateDto(dto)).toContain('min');
  });

  it('rejects limit > 100', async () => {
    const dto = plainToInstance(FindMoviesQueryDto, { limit: 200 });
    expect(await validateDto(dto)).toContain('max');
  });

  it('rejects limit < 1', async () => {
    const dto = plainToInstance(FindMoviesQueryDto, { limit: 0 });
    expect(await validateDto(dto)).toContain('min');
  });

  it('coerces numeric strings to numbers (Transform @Type(Number))', async () => {
    const dto = plainToInstance(FindMoviesQueryDto, {
      page: '3' as unknown as number,
      limit: '10' as unknown as number,
    });
    expect(await validateDto(dto)).toEqual([]);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(10);
  });
});
