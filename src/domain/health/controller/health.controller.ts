import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../../auth/decorators/public.decorator';

const SERVICE_STARTED_AT = Date.now();

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Healthcheck',
    description:
      'Devuelve estado del servicio. 200 si todo OK. 503 si la DB no responde a `SELECT 1`. Util para plataformas con healthcheck (Render, Railway, Fly) y smoke test post-deploy.',
  })
  async check(): Promise<{ status: 'ok'; timestamp: string; uptime: number }> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      throw new ServiceUnavailableException({
        error: 'Service Unavailable',
        message: `Database unreachable: ${message}`,
        details: null,
      });
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - SERVICE_STARTED_AT) / 1000),
    };
  }
}
