export interface SwapiFilmProperties {
  title?: string;
  episode_id?: number;
  opening_crawl?: string;
  director?: string;
  producer?: string;
  release_date?: string;
  characters?: string[];
  planets?: string[];
  starships?: string[];
  vehicles?: string[];
  species?: string[];
}

export interface SwapiFilm {
  uid: string;
  properties: SwapiFilmProperties;
}

export interface SwapiFilmsResponse {
  message: string;

  result: SwapiFilm[];
}

export interface SwapiSingleFilmResponse {
  message: string;
  result: SwapiFilm;
}
