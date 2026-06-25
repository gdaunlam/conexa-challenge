import { Injectable, Logger } from '@nestjs/common';
import { SwapiFilm, SwapiFilmsResponse } from './swapi.types';

const DEFAULT_SWAPI_BASE_URL = 'https://www.swapi.tech/api';

@Injectable()
export class SwapiClientService {
  private readonly logger = new Logger(SwapiClientService.name);
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env['SWAPI_BASE_URL'] ?? DEFAULT_SWAPI_BASE_URL;
  }

  async fetchAllFilms(): Promise<SwapiFilm[]> {
    const url = `${this.baseUrl}/films`;
    this.logger.log(`fetching films from SWAPI: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new SwapiError(
        `SWAPI responded with status ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    const body = (await response.json()) as SwapiFilmsResponse;
    if (body.message !== 'ok' || !Array.isArray(body.result)) {
      throw new SwapiError(
        `SWAPI returned unexpected shape: ${JSON.stringify(body).slice(0, 200)}`,
        502,
      );
    }

    return body.result;
  }
}

export class SwapiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'SwapiError';
  }
}
