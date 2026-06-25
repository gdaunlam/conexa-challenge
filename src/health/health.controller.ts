import { Controller, Get } from '@nestjs/common';
import { HealthCheckResponse, HealthService } from './health.service';

/**
 * Healthcheck de la aplicacion.
 * Endpoint publico, sin auth. Devuelve 200 con el shape de DOCS/ENDPOINTS.md
 * seccion 5 (`{ status, timestamp, uptime }`) o 503 si la conexion a la DB
 * no responde al probe.
 * La logica de negocio vive en `HealthService`; este controller solo delega.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): Promise<HealthCheckResponse> {
    return this.healthService.check();
  }
}
