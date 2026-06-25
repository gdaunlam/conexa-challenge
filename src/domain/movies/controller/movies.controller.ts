import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CreateMovieDto } from './dto/create-movie.dto';
import { FindMoviesQueryDto, SortBy, SortOrder } from './dto/find-movies-query.dto';
import { MovieResponseDto } from './dto/movie-response.dto';
import { UpdateMovieDto } from './dto/update-movie.dto';
import { CreateMovieResult, MoviesService } from '../service/movies.service';

@ApiTags('movies')
@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Listado publico paginado con search y sort.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
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
  @ApiResponse({ status: 401, description: 'No autenticado.' })
  @ApiResponse({ status: 404, description: 'Pelicula no existe o esta soft-deleted.' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<MovieResponseDto> {
    return this.moviesService.findOne(id);
  }

  @Roles('admin')
  @Post()
  @HttpCode(201)
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
  create(@Body() dto: CreateMovieDto): Promise<CreateMovieResult> {
    return this.moviesService.create(dto);
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
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMovieDto,
  ): Promise<MovieResponseDto> {
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
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.moviesService.remove(id);
  }
}
