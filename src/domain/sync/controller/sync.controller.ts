import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { SyncResult, SyncService } from '../service/sync.service';

@ApiTags('movies')
@Controller('movies/sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Roles('admin')
  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sincronizar peliculas desde SWAPI (admin).',
    description:
      'Trae todas las peliculas de SWAPI y hace UPSERT en la tabla `movies` ' +
      "con `provider='swapi'` y `external_id=uid`. Idempotente: ejecutar N " +
      'veces = ejecutar 1 vez. Errores por pelicula se reportan en `errors[]` ' +
      'sin abortar el sync.',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Sync completado (puede haber errores parciales en `errors[]`).',
    schema: {
      type: 'object',
      properties: {
        fetched: { type: 'number', description: 'Cantidad de peliculas devueltas por SWAPI.' },
        created: { type: 'number', description: 'INSERTs nuevos.' },
        updated: { type: 'number', description: 'UPDATEs (peliculas que ya existian).' },
        errors: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'No es admin.' })
  @ApiResponse({ status: 409, description: 'Sync ya en curso.' })
  @ApiResponse({ status: 502, description: 'SWAPI caida o respuesta invalida.' })
  sync(): Promise<SyncResult> {
    return this.syncService.syncSwapi();
  }
}
