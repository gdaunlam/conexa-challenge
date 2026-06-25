# Conexa Movies Backend

API REST en NestJS para gestión de películas con sincronización desde SWAPI (Star Wars API). Auth con JWT, persistencia en PostgreSQL con TypeORM, sync bajo demanda con lock en memoria.

## Stack

- **Runtime**: Node.js 20+, TypeScript 5
- **Framework**: NestJS 10
- **DB**: PostgreSQL 16 (vía `docker-compose`)
- **ORM**: TypeORM 0.3 con migraciones versionadas
- **Auth**: JWT (HS256) + bcrypt
- **Tests**: Jest 29 (283 tests, 28 suites)
- **Docs**: Swagger UI en `/api/docs` (OpenAPI 3 autogenerado desde decorators)

## Estructura

```
src/
├── main.ts                  # Bootstrap, global prefix /api/v1, ValidationPipe, HttpExceptionFilter
├── app.module.ts            # Config + Database + Auth + Movies + Sync
├── config/                  # Configuration factory + env validation + Swagger
├── common/                  # HttpExceptionFilter, TraceIdMiddleware, PositiveIntPipe
├── database/                # TypeORM data-source + migraciones
└── domain/
    ├── auth/                # Auth module: controller + service + jwt + bcrypt + guards
    │   ├── controller/      #   /auth/signup, /auth/login
    │   ├── service/         #   auth, jwt-token, bcrypt-password
    │   ├── repository/      #   User entity
    │   ├── guards/          #   JwtAuthGuard, RolesGuard
    │   ├── decorators/      #   @Public, @Roles, @CurrentUser
    │   └── utils/           #   normalizeEmail (trim → NFKC → lowercase)
    └── movies/              # Movies module: controller + service + repository + sync
        ├── controller/      #   /movies/* y /movies/sync
        ├── service/         #   movies service + sync + swapi-client + sync-lock
        ├── repository/      #   Movie entity + MoviesRepository
        ├── entities/        #   Movie entity (TypeORM)
        ├── dto/             #   Request/response DTOs
        └── enums/           #   MovieProvider enum
```

## Quick start

### 1. Instalar dependencias

```bash
pnpm install
```

### 2. Levantar Postgres

```bash
docker compose up -d postgres
```

Espera a que el healthcheck pase (`pg_isready`). Defaults: usuario `postgres`, password `dev-only-db-password`, DB `movies_db`, puerto `5432`. Si querés cambiar las credenciales, sobreescribí las env vars antes de levantar (ver `.env`).

### 3. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env si querés cambiar puertos/credenciales
```

Las env vars del archivo son **solo para dev**. En producción `validateEnv` (en `src/config/env.validation.ts`) rechaza secretos triviales y exige JWT_SECRET de ≥32 chars y DATABASE_PASSWORD de ≥12 chars sin palabras triviales (`postgres`, `password`, `admin`, `changeme`, `secret`).

### 4. Correr migraciones

```bash
pnpm migration:run
```

Las migraciones crean las tablas `users` y `movies`, las constraints UNIQUE, los índices B-tree parciales por `deleted_at`, y los índices GIN con `pg_trgm` para búsqueda fuzzy. **Importante**: la app NO corre migraciones al boot (`migrationsRun: false`). Aplicar migraciones es un step explícito del deploy.

### 5. Levantar el servidor

```bash
pnpm start:dev   # dev con watch
# o
pnpm build && pnpm start:prod   # build + producción
```

El server escucha en `http://localhost:3000` por defecto. Todas las rutas viven bajo el prefix `/api/v1` (ej: `http://localhost:3000/api/v1/auth/signup`).

## Cómo usar la app

### Flujo típico

1. **Signup**: `POST /api/v1/auth/signup` con `{ email, name, password }`. Devuelve `204 No Content`.
2. **Login**: `POST /api/v1/auth/login` con `{ email, password }`. Devuelve `{ "accessToken": "jwt" }` (TTL 1h).
3. **Listar películas**: `GET /api/v1/movies?page=1&limit=20&search=hope` (público, sin auth).
4. **Detalle película**: `GET /api/v1/movies/:id` (requiere Bearer token).
5. **Crear película**: `POST /api/v1/movies` con `Authorization: Bearer <token>` (solo admin).
6. **Actualizar película**: `PATCH /api/v1/movies/:id` (solo admin).
7. **Soft-delete película**: `DELETE /api/v1/movies/:id` (solo admin).
8. **Sincronizar con SWAPI**: `POST /api/v1/movies/sync` (solo admin). Trae las 6 películas de SWAPI y hace UPSERT por `external_id`.

### Ejemplo con curl

```bash
# 1. Signup
curl -X POST http://localhost:3000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","name":"Admin","password":"AdminP4ss!word"}'

# 2. Login (para admin, la cuenta tiene que crearse directo en DB con role='admin')
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"AdminP4ss!word"}'

# 3. Listar películas (público)
curl http://localhost:3000/api/v1/movies

# 4. Sync con SWAPI (requiere admin)
TOKEN="<accessToken del login>"
curl -X POST http://localhost:3000/api/v1/movies/sync \
  -H "Authorization: Bearer $TOKEN"
```

### Shape de errores (consistente en toda la API)

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": [
    { "field": "email", "constraints": { "matches": "email must be a valid email address" } }
  ],
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-06-23T15:30:00.000Z"
}
```

`traceId` se genera por middleware (`X-Trace-Id` header en response), se loguea en cada error, y se incluye en todos los responses de error para correlación cliente↔server.

## Cómo abrir Swagger

Con el server levantado:

```
http://localhost:3000/api/docs
```

Swagger UI expone todos los endpoints con sus schemas, ejemplos, status codes posibles y la opción "Authorize" (botón arriba a la derecha) para pegar el JWT y probar endpoints protegidos.

Swagger se deshabilita automáticamente en producción (`NODE_ENV=production`). En dev está siempre activo.

## Tests

```bash
pnpm test           # corre los 283 tests
pnpm test:watch     # watch mode
pnpm test:cov       # con coverage
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint --max-warnings 0
```

Hay tests unitarios de DTOs (validación de input), services (lógica de negocio con mocks de repository), controllers (delegación), guards, repositories (con mocks de QueryBuilder), y del wiring de los módulos de auth.

## Documentos adjuntos

Toda la documentación vive en `DOCS/`:

- **`REQUIREMENT.md`** — el challenge original tal cual lo recibimos (alcance, requisitos, criterios de aceptación).
- **`ENDPOINTS.md`** — contrato detallado de la API: shapes de request/response, status codes, decisiones de diseño por endpoint (soft delete, UPSERT, etc.). Es la fuente de verdad para entender qué hace cada endpoint y por qué.
- **`DER.md`** — modelo de datos (entidades, columnas, constraints, índices, migraciones).
- **`TODO.md`** — tracking personal de qué se hizo y qué quedó pendiente (Postman collection, e2e con supertest, deploy).

No se incluyó una Postman collection en este repo (decisión de scope: no se priorizó dentro del límite de 4h del challenge). Para probar la API manualmente se recomienda usar Swagger UI o los curl examples de arriba.

## Decisiones y consideraciones especiales

### Decisiones de diseño (acordadas con el spec)

- **Soft delete con `deletedAt` (no DELETE físico)** para `User` y `Movie`. Los registros nunca se borran, se marcan con timestamp. Esto preserva auditoría y permite reactivación.
- **`POST /movies` con `external_id` tiene semántica create-or-reactivate con PUT pura**: si el `external_id` ya existe como soft-deleted, se reactiva y reemplaza los campos (devuelve 200). Si no existe, hace INSERT (201). Si existe activo, devuelve 409. El flujo es `UPDATE ... SET deleted_at = NULL WHERE ... AND deleted_at IS NOT NULL RETURNING *` y si afecta 0 filas, `INSERT` con catch de UNIQUE violation (23505). Esto es **race-safe** (sin SELECT previo).
- **Anti user-enumeration**: signup con email duplicado devuelve `400 Bad Request` con mensaje genérico, **no** `409 Conflict`. Login siempre devuelve el mismo `401 Unauthorized` con mensaje fijo (`"Invalid credentials"`) y timing parejo (se hace bcrypt compare contra un hash dummy cuando el email no existe).
- **Lock en memoria para sync** (`SyncLockService`): dos `POST /movies/sync` concurrentes → el segundo devuelve 409. Single-instance scope. Para N réplicas harían falta `pg_try_advisory_lock` u otro mecanismo distribuido.
- **Sync es idempotente**: ejecutar N veces = ejecutar 1 vez (UPSERT por `(provider, external_id)`). Las películas SWAPI soft-deleted localmente NO se reactivan (decisión de diseño: la DB local es la verdad, SWAPI puede tener transitorios).
- **SWAPI devuelve `attributes` JSONB** con los arrays de URLs (`characters`, `planets`, etc.) sin fetch secundario en esta versión (los detalles se resolverían en una iteración futura si la app los necesita).
- **`search` con `pg_trgm` word_similarity (`<%`)**: matchea palabras similares más allá de un threshold de 0.3. No es búsqueda exacta; es fuzzy. Caracteres `%` y `_` del input no son especiales.
- **Migraciones NO corren automáticamente** (`migrationsRun: false`). El deploy corre `pnpm migration:run` como step explícito antes de levantar la nueva versión de la app. Decisión: disciplina operacional > lock distribuido para single-instance.
- **No hay refresh tokens ni token revocation**: el access token dura 1h y no se puede revocar. Si un usuario necesita logout real antes de 1h, no hay mecanismo (no estaba en scope del challenge).

### Decisiones técnicas (cómo se resolvió el problema, no por qué)

- **`@IsOptional` + `@IsNotEmpty` no rechaza `null`** en class-validator (IsOptional skip null/undefined, IsNotEmpty solo rechaza ""). Para campos NOT NULL que rechazan null explícito, se usa `@ValidateIf((o) => o.field !== undefined)` + validaciones de tipo. Esa es la regla: ausente = no modificar, null/"" = 400.
- **Email format regex vive en el DTO** (`@Matches(EMAIL_REGEX)`) con `@Transform` que normaliza a lowercase antes de validar (la regex es case-sensitive por diseño del spec). El service no duplica la validación.
- **`PositiveIntPipe` custom** para validar `id > 0` en path params (NestJS no trae esto built-in para params, solo para DTOs).
- **JSON casing es camelCase** (`externalId`, `releaseDate`) en lugar de snake_case como muestran los ejemplos del `ENDPOINTS.md`. Decisión pragmática: mantener consistencia interna TS↔JSON. Si el cliente envía `external_id` (snake_case), se rechaza con 400 (whitelist del ValidationPipe). Si el equipo prefiere snake_case en el wire format, hay que agregar `@Expose({ name: '...' })` + `excludeExtraneousValues: true` en el ValidationPipe global.
- **Mock de TypeORM QueryFailedError en tests**: el helper `buildUniqueViolation` construye un error con `driverError.code === '23505'` para que el service detecte el UNIQUE violation de Postgres sin necesitar una DB real.

### Cosas dejadas de lado (no prioritarias en 4h)

 - **Postman collection**: generada en `postman/movies-backend.postman_collection.json` (10 requests: Auth 2, Movies 6, Sync 2) con scripts de smoke test. Documentada también abajo (sección Postman).
- **Tests e2e con supertest**: hay tests unitarios extensivos (337 tests, 29 suites) pero no se armaron e2e contra el server levantado. Para un proyecto más maduro, sumaría tests de integración con `supertest` + DB en memoria.
- **Deploy**: no se deployó. El proyecto está listo para deployarse a Render/Railway/Fly (los 3 soportan Node + Postgres). Falta: Dockerfile, configuración de secrets, script de CI/CD que corra `pnpm test && pnpm lint && pnpm build && pnpm migration:run`.
- **CRON de sync**: el endpoint `POST /movies/sync` está hecho, pero no hay `@nestjs/schedule` con un `@Cron(...)` que lo dispare periódicamente. Se puede agregar sin tocar el service (la lógica está separada del controller).
- **Refresh tokens / logout**: no implementado. La auth actual es stateless con TTL 1h.
- **Endpoint para listar/restaurar películas soft-deleted**: no en scope. Si se necesita para auditoría admin, es agregar 2 endpoints al `movies.controller`.
- **Healthcheck endpoint (`GET /api/v1/health`)**: implementado. Hace `SELECT 1` contra la DB; devuelve 200 con `{ status, timestamp, uptime }` si OK, 503 si la DB no responde. Útil para Render/Railway/Fly healthcheck y smoke test post-deploy. Documentado en `ENDPOINTS.md` §5.
- **Rate limiting**: no implementado. Un endpoint público (`GET /movies`) sin rate limit es vulnerable a scraping/abuse. Para producción sumaría `@nestjs/throttler`.
- **Logging estructurado**: los logs son texto plano con códigos (`movie_created`, `sync_completed`, etc.). Para producción sumaría Winston o Pino con JSON structured logs.

### Decisiones por falta de claridad en el requirement

- **El spec original decía "Solo los Usuarios Regulares deberían tener acceso al detalle"**. Lo amplié a ambos roles (`user` + `admin`) porque de otro modo el admin no puede editar lo que no puede ver. Documentado como decisión en `ENDPOINTS.md` §3.
- **Creación de admins**: el spec dice "no hay endpoint público para crear admins", pero no documenta cómo crearlos. Decisión: admins se crean por seed/CLI o UPDATE directo en DB (`UPDATE users SET role='admin' WHERE email='...'`). Documentado en `ENDPOINTS.md` §2.
- **`name` field en signup**: el spec del challenge original (REQUIREMENT.md) no menciona `name`, solo `email` y `password`. Pero el ENDPOINTS.md (que es la fuente de verdad del contrato) sí lo pide como required 2-100 chars. Implementé según ENDPOINTS.md.
- **`POST /movies` con `external_id`**: el challenge original no menciona el comportamiento de "create or reactivate". El ENDPOINTS.md sí lo define con detalle. Implementé según ENDPOINTS.md (PUT pura, 200 vs 201 vs 409).
- **Movies sin `external_id`**: el challenge no aclara si se permiten películas manuales sin fuente externa. Decisión: sí, son películas con `provider='manual'` y `external_id=NULL`. La constraint UNIQUE compuesta `(provider, external_id) WHERE external_id IS NOT NULL` permite múltiples NULLs.