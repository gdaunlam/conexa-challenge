export const PROVIDER_MANUAL = 'manual';
export const PROVIDER_SWAPI = 'swapi';

export type MovieProvider = typeof PROVIDER_MANUAL | typeof PROVIDER_SWAPI;

export const MOVIE_PROVIDERS: readonly MovieProvider[] = [PROVIDER_MANUAL, PROVIDER_SWAPI] as const;

export const DEFAULT_MOVIE_PROVIDER: MovieProvider = PROVIDER_MANUAL;
