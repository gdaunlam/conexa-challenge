import { SwapiClientService, SwapiError } from './swapi-client.service';
import { SwapiFilm } from './swapi.types';

const buildFilm = (uid: string, overrides: Partial<SwapiFilm['properties']> = {}): SwapiFilm => ({
  uid,
  properties: {
    title: 'A New Hope',
    episode_id: 4,
    opening_crawl: 'It is a period of civil war...',
    director: 'George Lucas',
    producer: 'Gary Kurtz',
    release_date: '1977-05-25',
    characters: ['https://www.swapi.tech/api/people/1'],
    planets: ['https://www.swapi.tech/api/planets/1'],
    starships: ['https://www.swapi.tech/api/starships/12'],
    vehicles: [],
    species: ['https://www.swapi.tech/api/species/1'],
    ...overrides,
  },
});

const buildFilmsResponse = (films: SwapiFilm[]) => ({
  message: 'ok',
  result: films,
});

const mockFetch = (response: {
  ok: boolean;
  status?: number;
  statusText?: string;
  json?: () => Promise<unknown>;
}) => {
  global.fetch = jest.fn().mockResolvedValue(response as unknown as Response);
};

describe('SwapiClientService', () => {
  let service: SwapiClientService;
  const originalFetch = global.fetch;

  beforeEach(() => {
    service = new SwapiClientService();
    delete process.env['SWAPI_BASE_URL'];
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('fetchAllFilms', () => {
    it('returns the films array when SWAPI responds OK with expected shape', async () => {
      const films = [buildFilm('1'), buildFilm('2')];
      mockFetch({
        ok: true,
        status: 200,
        json: async () => buildFilmsResponse(films),
      });

      const result = await service.fetchAllFilms();

      expect(result).toEqual(films);
    });

    it('uses the default SWAPI base URL when SWAPI_BASE_URL is not set', async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: async () => buildFilmsResponse([]),
      });

      await service.fetchAllFilms();

      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.swapi.tech/api/films',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('honors SWAPI_BASE_URL when set', async () => {
      process.env['SWAPI_BASE_URL'] = 'http://localhost:9999';
      service = new SwapiClientService();
      mockFetch({
        ok: true,
        status: 200,
        json: async () => buildFilmsResponse([]),
      });

      await service.fetchAllFilms();

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:9999/films',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('throws SwapiError when SWAPI responds with non-2xx status', async () => {
      mockFetch({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      await expect(service.fetchAllFilms()).rejects.toBeInstanceOf(SwapiError);
      await expect(service.fetchAllFilms()).rejects.toMatchObject({ status: 503 });
    });

    it('throws SwapiError when SWAPI returns unexpected shape (message != ok)', async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: async () => ({ message: 'error', description: 'something went wrong' }),
      });

      await expect(service.fetchAllFilms()).rejects.toBeInstanceOf(SwapiError);
    });

    it('throws SwapiError when SWAPI returns body without result array', async () => {
      mockFetch({
        ok: true,
        status: 200,
        json: async () => ({ message: 'ok', result: 'not-an-array' }),
      });

      await expect(service.fetchAllFilms()).rejects.toBeInstanceOf(SwapiError);
    });
  });
});
