import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';

export const DATABASE_UNAVAILABLE_MESSAGE = 'Database connection not available';

// Categoria del fallo de la DB. Vive en este archivo y NO se filtra al cliente:
// el shape del 503 (DOCS/ENDPOINTS.md seccion 6) solo admite `details: array | null`
// y el `HttpExceptionFilter` descarta cualquier campo fuera de `message/error/details`.
// La categoria se loguea server-side para que el operador sepa como clasificar
// el incidente (DNS, connection reset, timeout, etc.) sin filtrar el mensaje
// crudo, que puede contener host:port, usuarios de DB, query strings, etc.
export type DatabaseErrorCategory =
  | 'database_unreachable'
  | 'connection_lost'
  | 'query_timeout'
  | 'unknown';

// Shape del 200 que devuelve `GET /health` (ver DOCS/ENDPOINTS.md seccion 5).
// Vive en el service (no en el controller) para evitar que la capa de
// presentacion defina tipos de la capa de negocio.
export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  uptime: number;
}

// Query liviana que usamos como liveness probe. `SELECT 1` viaja por el mismo
// canal que cualquier otra query, asi que un timeout o un connection lost
// se manifiesta aca, no en operaciones mas costosas.
const LIVENESS_PROBE_QUERY = 'SELECT 1';

// Mapea un error de TypeORM/Postgres a una categoria cerrada. El orden de las
// ramas importa: algunos errores tienen tanto un code de bajo nivel como un
// mensaje descriptivo; la primera rama que matchea gana para mantener la
// taxonomia deterministica.
const categorizeDatabaseError = (error: unknown): DatabaseErrorCategory => {
  if (typeof error !== 'object' || error === null) {
    return 'unknown';
  }

  const candidate = error as { code?: unknown; message?: unknown };

  if (candidate.code === 'ECONNREFUSED' || candidate.code === 'ENOTFOUND') {
    // El servidor rechazo la conexion (puerto cerrado, host no resuelve DNS).
    return 'database_unreachable';
  }

  if (candidate.code === 'ECONNRESET') {
    return 'connection_lost';
  }

  if (
    typeof candidate.message === 'string' &&
    (candidate.message.includes('terminated') ||
      candidate.message.includes('terminating connection'))
  ) {
    // Postgres envia 'terminating connection due to administrator command'
    // cuando un admin mata la sesion (`pg_terminate_backend`); otros
    // caminos pueden llegar como 'Connection terminated' / 'terminated by
    // server'. Cubrimos ambas formas para no perder la categoria cuando
    // el mensaje viene en cualquiera de las dos variantes.
    return 'connection_lost';
  }

  if (candidate.code === 'ETIMEDOUT' || candidate.code === '57014') {
    // `57014` es `statement_timeout` de Postgres; `ETIMEDOUT` es timeout
    // client-side del driver `pg`.
    return 'query_timeout';
  }

  return 'unknown';
};

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Liveness probe de la aplicacion.
   *
   * NO usamos `dataSource.isInitialized` como unico chequeo: esa flag la setea
   * TypeORM una vez al boot y nunca baja a `false` aunque la conexion a la DB
   * se pierda despues (es un snapshot del estado de inicializacion, no de la
   * conexion viva). Eso convertia al endpoint en zombie: el LB veia 200 OK
   * incluso con la DB caida, y `/movies` devolvia 500.
   *
   * La senial correcta es ejecutar `SELECT 1`: si Postgres respondio, el
   * canal funciona; si no, lanzamos 503 para que el orquestador reinicie la
   * instancia y/o el LB la saque de rotacion.
   *
   * El shape del 200 cumple DOCS/ENDPOINTS.md seccion 5: `{ status, timestamp, uptime }`.
   * `uptime` viene de `process.uptime()`, monotono dentro del proceso Node.
   *
   * El shape del 503 cumple DOCS/ENDPOINTS.md seccion 6: `details: null`. El
   * `HttpExceptionFilter` descarta cualquier `details` que no sea `ErrorDetail[]`,
   * asi que pasar `details: { reason: error.message }` haria que el operador
   * pierda la razon en el response (y ademas filtraria host:port, usuarios
   * de DB, etc.). La categoria cerrada va SOLO a logs server-side; el operador
   * correlaciona con el `traceId` que `TraceIdMiddleware` pone en el response
   * y que `HttpExceptionFilter` ya loguea.
   */
  async check(): Promise<HealthCheckResponse> {
    try {
      await this.dataSource.query(LIVENESS_PROBE_QUERY);
    } catch (error) {
      const category = categorizeDatabaseError(error);
      const rawMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(
        `health probe failed category=${category} raw=${rawMessage}`,
      );

      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: DATABASE_UNAVAILABLE_MESSAGE,
        details: null,
      });
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
