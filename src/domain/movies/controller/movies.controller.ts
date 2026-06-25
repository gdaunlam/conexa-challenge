import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateMovieDto } from './dto/create-movie.dto';
import { FindMoviesQueryDto, SortBy, SortOrder } from './dto/find-movies-query.dto';
import { MovieResponseDto } from './dto/movie-response.dto';
import { UpdateMovieDto } from './dto/update-movie.dto';
import { MoviesService } from '../service/movies.service';

const DIGITS_ONLY = /^\d+$/;

function parsePositiveId(raw: unknown): number {
  // El ValidationPipe global corre ANTES de cualquier param pipe especifico y,
  // con `transform: true`, aplica Number(raw) al parametro. Eso convierte
  // "0x1" en 1, "1.5" en 1.5, "1e5" en 100000, "+1" en 1, etc. Para bypassear
  // esa coercion (que no distingue entre "1" y "0x1") leemos el string crudo
  // del request y validamos nosotros. Esto aplica tanto al caso global-
  // transformed (donde llega un number) como al path crudo (string).
  if (typeof raw !== 'string' || !DIGITS_ONLY.test(raw)) {
    throw new BadRequestException({
      error: 'Bad Request',
      message: 'id must be a positive integer',
      details: null,
    });
  }
  const parsed = Number.parseInt(raw, 10);
  if (parsed <= 0 || !Number.isSafeInteger(parsed)) {
    throw new BadRequestException({
      error: 'Bad Request',
      message: 'id must be a positive integer',
      details: null,
    });
  }
  return parsed;
}

@ApiTags('movies')
@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Listado publico paginado con search y sort.',
  })
  @ApiQuery({ name: 'search', required: false, type: String, minLength: 1, maxLength: 100 })
  @ApiQuery({ name: 'sortBy', required: false, enum: SortBy })
  @ApiQuery({ name: 'order', required: false, enum: SortOrder })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiResponse({
    status: 200,
    description: 'Listado de peliculas (sin attributes).',
    schema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { $ref: '#/components/schemas/MovieResponseDto' } },
        meta: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            total: { type: 'number' },
            totalPages: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'Validacion fallida (search > 100 chars, page < 1, limit > 100, sortBy/order invalido).',
  })
  findAll(@Query() query: FindMoviesQueryDto): Promise<{
    items: MovieResponseDto[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    return this.moviesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de una pelicula (autenticado). Incluye attributes.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Pelicula encontrada.', type: MovieResponseDto })
  @ApiResponse({ status: 400, description: 'id invalido (debe ser entero positivo).' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 404, description: 'Pelicula no existe o esta soft-deleted.' })
  findOne(@Param('id') rawId: string): Promise<MovieResponseDto> {
    const id = parsePositiveId(rawId);
    return this.moviesService.findOne(id);
  }

  @Roles('admin')
  @Post()
  @ApiOperation({
    summary: 'Crear o reactivar pelicula por external_id (admin). Semantica PUT pura.',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Pelicula reactivada (soft-deleted -> activa).',
    type: MovieResponseDto,
  })
  @ApiResponse({ status: 201, description: 'Pelicula creada.', type: MovieResponseDto })
  @ApiResponse({ status: 400, description: 'Validacion fallida o externalId no editable.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'No es admin.' })
  @ApiResponse({ status: 409, description: 'externalId ya existe activo.' })
  async create(
    @Body() dto: CreateMovieDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MovieResponseDto> {
    const result = await this.moviesService.create(dto);
    res.status(result.status);
    return result.movie;
  }

  @Roles('admin')
  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar parcial de una pelicula (admin). NO acepta externalId ni provider.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Pelicula actualizada.', type: MovieResponseDto })
  @ApiResponse({ status: 400, description: 'Validacion fallida o externalId/provider enviados.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'No es admin.' })
  @ApiResponse({ status: 404, description: 'Pelicula no existe o esta soft-deleted.' })
  update(
    @Param('id') rawId: string,
    @Body() dto: UpdateMovieDto,
  ): Promise<MovieResponseDto> {
    const id = parsePositiveId(rawId);
    return this.moviesService.update(id, dto);
  }

  @Roles('admin')
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Soft-delete idempotente (admin). COALESCE preserva timestamp original.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 204, description: 'Pelicula borrada o ya estaba borrada.' })
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 403, description: 'No es admin.' })
  @ApiResponse({ status: 404, description: 'id nunca existio.' })
  async remove(@Param('id') rawId: string): Promise<void> {
    const id = parsePositiveId(rawId);
    await this.moviesService.remove(id);
  }
}
