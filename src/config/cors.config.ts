import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { TRACE_ID_HEADER } from '../common/middleware/trace-id.middleware';
import { NodeEnv } from './env.validation';

// Constante con los headers custom que la API expone al browser. Sin esto, los
// navegadores NO exponen headers de response a JS (regla CORS del browser), asi
// que un cliente browser no podria leer `X-Trace-Id` desde el response aunque el
// header este presente. El valor de `TRACE_ID_HEADER` es la unica source-of-truth
// del nombre del header para que no haya drift entre el middleware y la config.
const EXPOSED_HEADERS: readonly string[] = [TRACE_ID_HEADER];

// Wrapper para que el paquete `cors` acepte `*` como boolean (no como array).
// `cors@2.8.5` con `origin: ['*']` no funciona bien: el browser ignora
// silenciosamente el header. Pasamos boolean `true` para que `cors` lo mapee
// al header `Access-Control-Allow-Origin: *` correcto.
const isWildcardOriginList = (origins: readonly string[]): boolean =>
  origins.length > 0 && origins.every((origin) => origin === '*');

/**
 * Configura CORS para la aplicacion segun `nodeEnv` y `cors.origins`.
 *
 * Tres ramas:
 * 1. `production` sin origins -> throw. CORS abierto en prod es un riesgo de
 *    seguridad y la aplicacion debe fail-fast.
 * 2. Con origins -> `enableCors` con la lista explicita, `credentials: false`
 *    y `exposedHeaders: ['X-Trace-Id']` para que los browsers puedan leer el
 *    traceId desde el response.
 * 3. `development` sin origins -> warning + `*` (como boolean) para no
 *    spamear logs en dev. La CLI de TypeORM no llama a este bootstrap, asi
 *    que este path solo aplica al runtime HTTP.
 *
 * Se exporta como funcion pura (recibe `app` y `configService`, no llama a
 * `NestFactory`) para poder testear las tres ramas sin levantar la app.
 *
 * B3 (defense-in-depth): `validateEnv` ya garantiza que `nodeEnv` es un
 * `NodeEnum` valido, pero si un caller futuro invoca `bootstrapCors` antes
 * del pipeline de validacion (test, script, refactor), preferimos throw loud
 * a caer silenciosamente en `'development'` y abrir CORS por accidente.
 */
export function bootstrapCors(app: INestApplication, configService: ConfigService): void {
  const logger = new Logger('Bootstrap');
  const nodeEnv = configService.get<string>('nodeEnv');
  if (nodeEnv === undefined) {
    throw new Error('nodeEnv is not set in ConfigService; cannot configure CORS safely');
  }

  const corsOrigins = configService.get<string[]>('cors.origins') ?? [];

  if (nodeEnv === NodeEnv.Production && corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must be set in production. Refusing to start with open CORS.');
  }

  if (corsOrigins.length === 0) {
    logger.warn(
      'CORS_ORIGINS is not set: enabling open CORS (`*`) for development only. Set CORS_ORIGINS before deploying to production.',
    );
    const options: CorsOptions = buildCorsOptions(true);
    app.enableCors(options);
    return;
  }

  // Caso dev/test con origins explicitas (ej. `*` como unica entrada): el
  // paquete `cors` no soporta bien `origin: ['*']`, asi que normalizamos a
  // boolean `true` para que el header CORS se emita correctamente.
  const origin = isWildcardOriginList(corsOrigins) ? true : corsOrigins;
  const options: CorsOptions = buildCorsOptions(origin);
  app.enableCors(options);
}

// B4: helper unico para construir `CorsOptions`. Evita que las dos ramas
// (dev sin origins / dev o prod con origins) se desincronicen en
// `credentials` o `exposedHeaders`. `origin` es `string | string[] | boolean`
// que es exactamente el tipo que `CorsOptions.origin` acepta.
function buildCorsOptions(origin: string[] | boolean): CorsOptions {
  return {
    origin,
    credentials: false,
    exposedHeaders: [...EXPOSED_HEADERS],
  };
}
