# TESTS.md — Auditoria manual contra ENDPOINTS.md

Auditoria runtime con docker postgres + app levantada via `node dist/main.js`. Cubre `src/domain/` vs `DOCS/ENDPOINTS.md`.

## Categorias cubiertas (segun pedido del user)

- A. Validaciones de negocio (service/repo/DB)
- B. Validaciones de request (body/query/path) + shape de errores
- C. Flujos completos (signup→login→crud→sync)
- D. Extras no documentados / contratos implicitos
- E. class-validator decorators usados

Convenciones: status HTTP esperado vs observado, mensaje del error (claro y consistente), shape §6 (statusCode/error/message/details/traceId/timestamp). Si falla: ciclo de fix → retest.

---

## Setup

- docker compose up -d (postgres:16-alpine, healthcheck `pg_isready`)
- `node dist/main.js` (3000)
- Migrations auto-aplicadas en bootstrap (`migrationsRun: true`)
- BD fresh en cada ciclo de re-test

---

## Resultados

### A. Validaciones de negocio

| # | Endpoint | Caso | Esperado | Observado | OK |
|---|----------|------|----------|-----------|-----|
| A1 | POST /auth/signup | signup nuevo | 204 No Content | 204, body vacio | ✅ |
| A2 | POST /auth/signup | email duplicado (mismo user) | 400 + msg generico | 400 + `message="Validation failed", details=[]` (post-fix) | ✅ (post-fix) |
| A3 | POST /auth/signup | email duplicado con MAYUSCULAS (normalizacion) | 400 + msg generico | 400 + mismo msg generico | ✅ (post-fix) |
| A4 | POST /auth/login | email no registrado | 401 + msg generico | 401 + `"Invalid credentials"`, details=null | ✅ |
| A5 | POST /auth/login | password incorrecto | 401 + msg generico | 401 + mismo msg | ✅ |
| A6 | POST /auth/login | user soft-deleted | 401 + msg generico | 401 + mismo msg | ✅ |
| A7 | POST /auth/login | timing constante (no enumeration) | timing similar | 75-94ms en ambos casos | ✅ |
| A8 | POST /movies | sin externalId, sin token | 401 | 401 | ✅ |
| A9 | POST /movies | con user token (no admin) | 403 | 403 + `"Insufficient permissions"` | ✅ |
| A10 | POST /movies | admin, sin externalId | 201, provider=manual, externalId=null | 201, id string, provider=manual | ✅ |
| A11 | POST /movies | mismo body otra vez (externalId=null) | 201 nueva | 201 id distinto (NULL no es unique) | ✅ |
| A12 | POST /movies | admin, externalId nuevo | 201, id server-gen | 201 | ✅ |
| A13 | POST /movies | admin, externalId ACTIVO duplicado | 409 + mensaje claro | 409 + `"Movie with external_id 'X' already exists"` | ✅ |
| A14 | POST /movies | admin, externalId VACIO `""` | 400 + minLength | 400 + minLength | ✅ |
| A15 | POST /movies | admin, externalId soft-deleted | 200 reactivacion mismo id | 200, mismo id, campos reemplazados (PUT) | ✅ |
| A16 | POST /movies | externalId='1' coexiste con SWAPI | 201 manual coexiste con swapi | 201 id=7 coexiste con id=1 (provider=swapi, ext_id=1) | ✅ |
| A17 | PATCH /movies/:id | title OK | 200, updatedAt cambia | 200 | ✅ |
| A18 | PATCH /movies/:id | externalId en body (inmutable) | 400 | 400 + `"property externalId should not exist"` (whitelist) | ✅ |
| A19 | PATCH /movies/:id | provider en body (inmutable) | 400 | 400 + whitelist | ✅ |
| A20 | PATCH /movies/:id | body `{}` | 200 sin cambios | 200, updatedAt igual | ✅ |
| A21 | PATCH /movies/:id | title=null | 400 (NOT NULL) | 400 | ✅ |
| A22 | PATCH /movies/:id | title=`""` | 400 (NOT NULL) | 400 + isNotEmpty | ✅ |
| A23 | PATCH /movies/:id | releaseDate=null | 400 (NOT NULL) | 400 + isLength + isDateString | ✅ |
| A24 | PATCH /movies/:id | releaseDate formato erroneo | 400 | 400 + isDateString | ✅ |
| A25 | PATCH /movies/:id | openingCrawl=null | 200, setea NULL | 200, openingCrawl=None | ✅ |
| A26 | PATCH /movies/:id | openingCrawl=`""` | 200, setea NULL | 200 | ✅ |
| A27 | PATCH /movies/:id | id nunca existio | 404 | 404 + `"Movie X not found"` | ✅ |
| A28 | PATCH /movies/:id | soft-deleted | 404 | 404 | ✅ |
| A29 | PATCH /movies/:id | user token | 403 | 403 | ✅ |
| A30 | DELETE /movies/:id | admin, id activo | 204 | 204 | ✅ |
| A31 | DELETE /movies/:id | idempotente (segunda vez) | 204, timestamp preservado | 204, deleted_at NO cambia (COALESCE) | ✅ |
| A32 | DELETE /movies/:id | id nunca existio | 404 | 404 | ✅ |
| A33 | DELETE /movies/:id | user token | 403 | 403 | ✅ |
| A34 | DELETE /movies/:id | soft-deleted ya borrado | 204 (idempotente) | 204 | ✅ |
| A35 | POST /movies/sync | sin token | 401 | 401 | ✅ |
| A36 | POST /movies/sync | user token | 403 | 403 | ✅ |
| A37 | POST /movies/sync | admin, primera vez | 200, created=6 | 200, fetched=6, created=6, errors=[] | ✅ |
| A38 | POST /movies/sync | admin, segunda vez (idempotente) | 200, created=0, updated=6 | 200, created=0, updated=6, errors=[] | ✅ |
| A39 | POST /movies/sync | concurrente (2 paralelos) | uno 200, otro 409 | 200 + 409 + `"Sync already in progress"` | ✅ |
| A40 | GET /movies?search=X | word_similarity en title+director | matchear | matchea despues del fix (ver H2) | ✅ (post-fix) |
| A41 | GET /movies | soft-deleted invisible | excluido del listado | excluido | ✅ |
| A42 | GET /movies/:id | soft-deleted | 404 | 404 | ✅ |
| A43 | UNIQUE (provider, external_id) | coexistencia manual vs swapi | coexisten | coexisten (mismo externalId, distintos providers) | ✅ |

### B. Validaciones de request

| # | Endpoint | Caso | Esperado | Observado | OK |
|---|----------|------|----------|-----------|-----|
| B1 | POST /auth/signup | email invalido (no formato) | 400 + matches | 400 + matches | ✅ |
| B2 | POST /auth/signup | email > 254 chars | 400 + maxLength | 400 + maxLength | ✅ |
| B3 | POST /auth/signup | email empty | 400 + matches + minLength | 400 | ✅ |
| B4 | POST /auth/signup | email sin TLD | 400 + matches | 400 | ✅ |
| B5 | POST /auth/signup | password sin mayuscula | 400 | 400 + msg claro | ✅ |
| B6 | POST /auth/signup | password corto (<8) | 400 + minLength | 400 + minLength | ✅ |
| B7 | POST /auth/signup | password > 64 chars | 400 + maxLength | 400 + maxLength | ✅ |
| B8 | POST /auth/signup | name corto (<2) | 400 + minLength | 400 + minLength | ✅ |
| B9 | GET /movies | page negativo | 400 + min | 400 | ✅ |
| B10 | GET /movies | limit > 100 | 400 + max | 400 | ✅ |
| B11 | GET /movies | limit = 0 | 400 + min | 400 | ✅ |
| B12 | GET /movies | sortBy invalido | 400 + isEnum | 400 + listado de valores | ✅ |
| B13 | GET /movies | order invalido | 400 + isEnum | 400 | ✅ |
| B14 | GET /movies | search > 100 chars | 400 + maxLength | 400 | ✅ |
| B15 | GET /movies/:id | path id no numerico | 400 | 400 + `"id must be a positive integer"` (post-auth) | ✅ |
| B16 | GET /movies/:id | path id negativo | 400 | 400 | ✅ |
| B17 | GET /movies/:id | path id cero | 400 | 400 | ✅ |
| B18 | GET /movies/:id | path id no existente | 404 | 404 + `"Movie X not found"` | ✅ |
| B19 | POST /movies | title faltante | 400 + isString + isNotEmpty | 400 (multi-constraint) | ✅ |
| B20 | POST /movies | episodeId > 20 | 400 + max | 400 | ✅ |
| B21 | POST /movies | episodeId 0 | 400 + min | 400 | ✅ |
| B22 | POST /movies | releaseDate formato corto | 400 + isLength | 400 | ✅ |
| B23 | GET /api/v1/health | publico | 200 | 200 + `{status, timestamp, uptime}` | ✅ (post-fix) |

### C. Flujos completos

| # | Flujo | Pasos | Resultado | OK |
|---|-------|-------|-----------|-----|
| C1 | signup→login→crud | signup user, login, GET /movies/:id (sin token? no, con token) | OK | ✅ |
| C2 | CRUD admin basico | crear (201), leer (200), patch (200), delete (204), read (404) | OK | ✅ |
| C3 | Reactivacion | delete + POST mismo externalId | 200 con mismo id, campos reemplazados | ✅ |
| C4 | Sync primera vez | empty DB → sync | 6 created | ✅ |
| C5 | Sync idempotente | sync → sync | 6 created, 0+6 updated | ✅ |
| C6 | Sync no toca soft-deleted swapi | sync n veces | mismas filas, mismos valores | ✅ |
| C7 | Sync concurrente | 2 syncs en paralelo | 1 ok, 1 conflict | ✅ |

### D. Extras / contratos implicitos

| # | Caso | Esperado | Observado | OK |
|---|------|----------|-----------|-----|
| D1 | Shape error §6 | statusCode, error, message, details, traceId, timestamp | todos presentes | ✅ |
| D2 | TraceId en header `X-Trace-Id` | UUID v4 | presente | ✅ |
| D3 | traceId en error body | UUID v4 | presente | ✅ |
| D4 | Soft-delete preserva timestamp | COALESCE(deleted_at, NOW()) | segundo delete no cambia timestamp | ✅ |
| D5 | Decorators @Public | health, signup, login, GET /movies | publicos | ✅ |
| D6 | JWT TTL | 1h | `exp - iat = 3600` | ✅ |
| D7 | MigrationsRun on bootstrap | auto-aplicar | aplicado | ✅ |

### E. class-validator decorators usados

| Decorator | DTO | OK |
|-----------|-----|----|
| @IsString | SignupDto, CreateMovieDto, UpdateMovieDto | ✅ |
| @IsNotEmpty | SignupDto, CreateMovieDto, UpdateMovieDto | ✅ |
| @IsOptional | FindMoviesQueryDto, UpdateMovieDto | ✅ |
| @IsInt | CreateMovieDto (episodeId), UpdateMovieDto (episodeId), FindMoviesQueryDto (page, limit) | ✅ |
| @IsDateString | CreateMovieDto, UpdateMovieDto (releaseDate) | ✅ |
| @IsEnum | FindMoviesQueryDto (sortBy, order) | ✅ |
| @IsObject | CreateMovieDto, UpdateMovieDto (attributes) | ✅ |
| @MinLength | todos | ✅ |
| @MaxLength | todos | ✅ |
| @Length | CreateMovieDto, UpdateMovieDto (releaseDate=10) | ✅ |
| @Min | page/limit/episodeId | ✅ |
| @Max | limit/episodeId | ✅ |
| @Matches | SignupDto (email regex + 4 password constraints) | ✅ |
| @ValidateIf | UpdateMovieDto (rechaza null en NOT NULL manteniendo ausente=ok) | ✅ |
| @Transform | SignupDto/LoginDto (email normalize pipeline) | ✅ |

---

## Hallazgos pre-fix

### H1 — CRITICAL · `POST /auth/signup` con email duplicado filtraba existencia

**Sintoma**: el 400 con message=`"Email already registered"` permite a un atacante enumerar emails registrados.

**Spec violada**: ENDPOINTS.md §2 "el signup **no** devuelve `409 Conflict` cuando el email ya existe. Devuelve `400 Bad Request` con mensaje y `details` genéricos, indistinguible de un error de validación de formato".

**Fix aplicado**: `src/domain/auth/service/auth.service.ts` cambia el handler de unique violation a `message: 'Validation failed', details: []`. Constante `EMAIL_ALREADY_REGISTERED_MESSAGE` eliminada. Test actualizado.

**Verificacion runtime**: signup dup → 400 con `message='Validation failed', details=[]` indistinguible de validación de formato. ✅

### H2 — CRITICAL · `GET /movies?search=...` no matcheaba

**Sintoma**: `word_similarity('A New Hope', 'hope') = 0.4545`, pero `<%` retorna `false` con threshold 0.3 en la mayoría de los pares. La spec decía `WHERE title <% :search OR director <% :search` (no matcheaba).

**Root cause**: pg_trgm `<%` toma la primera cadena como fuente de palabras y la segunda como consulta completa. `'A New Hope' <% 'hope'` calcula word_similarity entre `'A New Hope'` (largo) y `'hope'` (corto) = 0.4545. La inversa `'hope' <% 'A New Hope'` = 1.0 → matchea.

**Fix aplicado**: `src/domain/movies/repository/movies.repository.ts` swappea a `(:search <% movie.title OR :search <% movie.director)`. Spec actualizada con nota explicativa. Test del repository actualizado.

**Verificacion runtime**: search=hope → 1 match ("A New Hope of the rebels"), search=empire → 1, search=jedi → 1, search=Lucas → 3 (por director). ✅

### H3 — CRITICAL · `GET /api/v1/health` no existia

**Sintoma**: 404 Not Found. El endpoint documentado en §5 no se implementó (borrado en iteracion previa como "estetica MVP").

**Fix aplicado**: `src/domain/health/health.module.ts` + `controller/health.controller.ts` + registrado en `app.module.ts`. Marca `@Public()` para que JwtAuthGuard global no lo bloquee. Hace `SELECT 1` contra DB; si falla → 503 con `Database unreachable`. Shape: `{ status: 'ok', timestamp, uptime }` (uptime en segundos desde el bootstrap).

**Verificacion runtime**: `GET /api/v1/health` → 200 con `{ status: "ok", timestamp: "...", uptime: 20 }`. 503 cuando DB cae (`docker compose stop postgres`), 200 cuando vuelve. ✅

---

## Segunda iteracion de pruebas

### N5 — CRITICAL · `PATCH /movies/:id` con `attributes: null` devolvia 500

**Sintoma**:
```json
PATCH /api/v1/movies/1 {"attributes": null}
→ HTTP 500
{"statusCode":500,"error":"Internal Server Error","message":"Internal server error"}
```

**Root cause**: `attributes` es NOT NULL en DB (`default: () => "'{}'::jsonb"`, sin `nullable: true`). El DTO aceptaba `null` con `@IsOptional() @IsObject()` (no rechaza null cuando el valor es null). El `null` llegaba al UPDATE, Postgres rechazaba con `23502 not_null_violation`, el `QueryFailedError` se propagaba como 500.

**Spec violada**: ENDPOINTS.md §3 PATCH "la diferencia clave es que `null` en un campo requerido devuelve `400` en vez de borrar y romper la invariante `NOT NULL`".

**Fix aplicado**: `src/domain/movies/controller/dto/update-movie.dto.ts` cambia a `@ValidateIf((o) => o.attributes !== undefined) @IsObject()`. Mismo patron que `title`/`director`/`releaseDate`/`episodeId` ya existentes.

**Verificacion runtime**:
- `attributes: null` → 400 con `isObject: "attributes must be an object"` ✅
- `attributes` ausente → 200 sin cambios ✅
- `attributes: {}` → 200, attributes={} ✅
- `attributes: {x:1}` → 200, attributes={x:1} ✅
- `attributes: "bad"` → 400 isObject ✅
- `attributes: [1,2,3]` → 400 isObject ✅

---

## Tercera iteracion de pruebas

### E10 — CRITICAL · id > BIGINT max devuelve 500 en GET/PATCH/DELETE

**Sintoma**:
```
GET    /api/v1/movies/99999999999999999999 → 500 Internal Server Error
PATCH  /api/v1/movies/99999999999999999999 → 500 Internal Server Error
DELETE /api/v1/movies/99999999999999999999 → 500 Internal Server Error
```

**Root cause**: el `PositiveIntPipe` solo validaba `parsed <= 0` y `Number.isNaN`. Numeros mayores a `Number.MAX_SAFE_INTEGER` (2^53-1) pasaban el pipe pero Postgres rechazaba el query con overflow (`bigint` out of range) → 23502.

**Fix aplicado**: el pipe valida con regex `/^\d+$/` (solo digitos decimales) + `Number.isSafeInteger`. Ademas, para evitar el footgun del `ValidationPipe` global que transforma params a `Number()` antes que cualquier pipe especifico (convirtiendo "0x1" en 1, "1.5" en 1.5, "1e5" en 100000), el controller lee `@Param('id') rawId: string` y valida manualmente via helper `parsePositiveId`. Asi el string crudo del path se valida sin coercion previa.

### E11+E23 — CRITICAL · PositiveIntPipe bypaseado por ValidationPipe global con transform:true

**Sintoma**: el `ValidationPipe` global (`transform: true`) corre antes que cualquier pipe especifico y aplica `Number(value)` al parametro. Esto convierte:
- `0x1` → 1 (hex)
- `1.5` → 1.5
- `1e5` → 100000 (notacion cientifica)

Con la coercion previa, el `PositiveIntPipe` no puede distinguir "1" (decimal valido) de "0x1" (hex), y el caso `1e5` se acepta como id=100000.

**Fix aplicado**: el controller lee el path param como `string` raw (sin coercion) y valida con `parsePositiveId`:
```ts
if (typeof raw !== 'string' || !/^\d+$/.test(raw)) throw 400;
```

**Verificacion runtime** (post-fix):

| Input | Antes | Despues |
|---|---|---|
| `0x1` | 200 id=1 | **400** ✅ |
| `01` | 200 id=1 | 200 id=1 (decimal valido) |
| `1.0` | 200 id=1 | **400** ✅ |
| `1.5` | 200 id=1 | **400** ✅ |
| `1e5` | 404 id=100000 | **400** ✅ |
| `99999999999999999999` | 500 | **400** ✅ |
| `abc` | 400 | 400 |
| `0` | 400 | 400 |
| `-1` | 400 | 400 |
| `1` (existe) | 200 | 200 |
| `9999` (no existe) | 404 | 404 |

---

## Hallazgos pendientes (no aplicados)

### H4 — WARNING · Email regex acepta puntos consecutivos

`a..b@x.com` pasa la regex `^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$`. Spec §2 dice "rechaza emails con caracteres de control, comillas, **puntos consecutivos**, etc." pero la regex los permite.

**Status**: pendiente (decision user: no aplicar). La regex coincide con la del spec original; la inconsistencia es entre la regex literal del spec y la intencion declarada del spec.

### W15 — User soft-deleted con token activo sigue operando hasta expirar

Confirmado en segunda iteracion: tras soft-delete via DB, un token pre-existente sigue pasando `JwtAuthGuard` (el guard no chequea `deletedAt` contra DB). Un user soft-deleted cuyo token tiene `role=admin` puede seguir haciendo POST/PATCH/DELETE hasta que el JWT expire (1h).

**Status**: documentado, no aplicado. Tradeoff: cada request tendria un SELECT extra contra `users` para validar.

---

## Gap de sequence no reproducible

En una corrida con BD sucia (varias peliculas manuales + soft-delete + reactivaciones) el sync dejó un gap en la sequence (id=5 faltaba entre id=4 y id=6, todos en provider=swapi). En BD limpia el sync asigna ids 1..6 contiguos. El gap fue probablemente un side-effect de las pruebas previas (insert fallido o rolled-back). NO reproducible en BD limpia. No requiere fix.
