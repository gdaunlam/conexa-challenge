# Propuesta de Endpoints — API de Gestión de Películas (SWAPI)

> Documento de diseño. Es la propuesta inicial para revisar antes de codear. Cambiá lo que no cierre y lo iteramos.

---

## 1. Convenciones generales

| Tema | Decisión |
|---|---|
| Base path | `/api/v1` |
| Auth | Bearer JWT en header `Authorization: Bearer <token>` |
| Roles | `user` (regular) · `admin` |
| IDs de entidad | `bigint` autoincremental (PostgreSQL `BIGSERIAL`). No se usa UUID. |
| IDs de request (`traceId`) | UUID v4 |
| Token TTL | Access token: **1 hora**. |
| Email normalization | Toda email recibida se normaliza con este pipeline: `trim` → `NFKC` → `lowercase` → validación de formato. Aplica a `signup` y `login`. |
| `provider` | Origen de la película. Valores: `'manual'` (POST sin `external_id`), `'swapi'` (sync), futuros (`'marvel'`, etc.). Default `'manual'`. **Inmutable** después del POST (mismo criterio que `external_id`). Forma parte de la unicidad compuesta con `external_id`. |
| External ID | Las películas sincronizadas desde una fuente externa tienen un `external_id` (string, nullable) que las identifica de forma estable **dentro de su provider**. Es el id de la fuente (`uid` en SWAPI cuando `provider='swapi'`). Es **opcional y nullable** para películas manuales. La unicidad es **compuesta**: `(provider, external_id) UNIQUE WHERE external_id IS NOT NULL` (índice parcial). Esto permite múltiples NULLs en `external_id` y deja la puerta abierta a múltiples providers con el mismo id local sin colisión. `external_id` es **la identidad única de la película (dentro del provider)**, no `episode_id`. Aplica al matching del sync (`POST /movies/sync`) y al UPSERT de `POST /movies`. |
| Password storage | bcrypt, cost 10. El password nunca se loguea ni se devuelve en responses. |
| Índices de consulta | Toda query de películas debe estar soportada por índices que cubran: filtro de `deletedAt IS NULL`, campos de `sortBy` (`title`, `release_date`, `episode_id`), y búsqueda por `search` (con soporte para `word_similarity`/`pg_trgm` sobre `title` y `director`). El detalle de implementación de cada índice (B-tree, GIN con `pg_trgm`, índice parcial) vive en el código, pero la decisión de performance aplica a todo el módulo `movies`. |
| Content-Type | `application/json` (request y response) |
| Versionado | Prefijo de versión en el path |
| Soft delete | `User` y `Movie` se marcan con `deletedAt` (timestamp nullable), no se borran físicamente. Un usuario soft-deleted no puede hacer login (ver §2 `login`). Una película soft-deleted no aparece en listados ni responde a `GET /:id` (ver §3). |
| Forma de errores | Shape consistente, ver §6 |

> **Sobre 401:** todos los endpoints protegidos devuelven `401 Unauthorized` si el token falta, es inválido o expiró. Ese caso se omite en la lista de respuestas de cada endpoint para no repetir, pero está siempre presente salvo donde se indique "público".

---

## 2. Auth (`/api/v1/auth`)

### `POST /auth/signup` — Registro
- **Acceso:** público
- **Status codes:** `204`, `400`

**Body:**

| Campo | Tipo | Requerido | Longitud | Formato | Notas |
|---|---|---|---|---|---|
| `email` | string | sí | 5–254 chars | validación estricta de formato (ver pipeline abajo) | se normaliza antes de validar (ver convenciones) |
| `password` | string | sí | 8–64 chars | regex `^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])[A-Za-z\d!@#$%^&*]{8,64}$` | exige al menos 1 minúscula, 1 mayúscula, 1 número y 1 carácter especial |
| `name` | string | sí | 2–100 chars | — | |

**204 No Content** → usuario creado. El body del response está vacío.

**400 Bad Request** → cubre dos casos, ambos con el mismo código:
- Validación de formato (email inválido, password débil, name fuera de rango, etc.) → `details` poblado con campos y constraints.
- Conflicto de unicidad en DB → `message` genérico, `details` vacío (no se filtra que el email ya existe). El `details` se omite o se devuelve como `[]`.

> **Decisión — signup no devuelve body:** crear el usuario y autenticarlo son responsabilidades distintas. El signup solo crea. Después de un signup exitoso (204), el cliente que quiera autenticarse llama a `POST /auth/login` con las mismas credenciales.

> **Decisión — UNIQUE constraint en DB:** la unicidad de `User.email` la garantiza la base de datos (constraint `UNIQUE` en la columna). El endpoint **no** hace un `SELECT` previo para chequear si el email existe; intenta el `INSERT` directamente. Si choca con el constraint, Postgres devuelve error `23505` y se transforma en 400 genérico. Esto evita races entre el check y el insert, y simplifica el código.

> **Decisión — email normalization (signup):** el email del body pasa por el pipeline `trim` → `NFKC` → `lowercase` → validación estricta de formato. Esto asegura que:
> - Variaciones Unicode visualmente iguales (`ﬁ` ligadura, acentos compuestos vs descompuestos) colisionan en el UNIQUE constraint.
> - Mayúsculas y espacios al borde no generan duplicados.
> - La validación de formato es **estricta** (no basta con `@IsEmail` laxa): rechaza emails con caracteres de control, comillas, puntos consecutivos, etc. Regex recomendado: `^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$` aplicado **después** del lowercase.
>
> El valor normalizado es el que se persiste y contra el que se comparan logins futuros.

> **Decisión — evitar user enumeration:** el signup **no** devuelve `409 Conflict` cuando el email ya existe. Devuelve `400 Bad Request` con mensaje y `details` genéricos, indistinguible de un error de validación de formato. Un atacante no puede usar este endpoint para enumerar emails registrados. La unicidad la garantiza la DB (constraint), no la respuesta HTTP.

> **Decisión — password strength:** el password se valida con regex que exige complejidad mínima (1 mayúscula, 1 minúscula, 1 número, 1 carácter especial). Esto aplica a `signup` y a cualquier endpoint futuro que cree o cambie passwords. **No** se aplica a `login`: si un usuario legacy tiene un password débil, no se le bloquea el acceso; la strength se exige solo al crear/cambiar.

> **Decisión — creación de admins:** el signup público siempre crea rol `user`. No hay endpoint para crear admins vía API (evita privilege escalation). Los admins se crean por seed/CLI o modificando la DB directamente.

### `POST /auth/login` — Login
- **Acceso:** público
- **Status codes:** `200`, `401`

**Body:**

| Campo | Tipo | Requerido | Longitud | Formato | Notas |
|---|---|---|---|---|---|
| `email` | string | sí | 5–254 chars | email | se normaliza con el mismo pipeline que `signup` antes de buscar en DB |
| `password` | string | sí | 1–64 chars | — | se compara contra el hash bcrypt. No se valida strength acá (solo al crear/cambiar) |

**200 OK:**
```json
{ "accessToken": "jwt" }
```

**401 Unauthorized** → cubre tres casos, todos con el mismo código y mensaje genérico (mismo `message`, mismo `details`, mismo timing):
- Email no existe en DB.
- Password no coincide con el hash.
- La cuenta existe pero está deshabilitada (soft delete, `deletedAt IS NOT NULL`).

> **Decisión — email normalization (login):** el email del body pasa por el mismo pipeline que `signup` (`trim` → `NFKC` → `lowercase`) antes de buscar en DB. Si un usuario se registró con `User@X.com` y en el login escribe `user@x.com`, matchean.

> **Decisión — evitar user enumeration (login):** el response de credenciales inválidas es siempre el mismo 401 con mensaje genérico. No hay distinción temporal (timing attack) ni de mensaje entre "email no existe", "password incorrecto" y "cuenta deshabilitada". Para emparejar timings, se puede comparar contra un hash dummy cuando el email no existe o la cuenta está soft-deleted; queda como decisión de implementación siempre que el response externo sea idéntico. Los tres casos se loguean internamente con códigos distintos (`invalid_credentials` vs `account_disabled`) para auditoría, pero el response HTTP es el mismo.

> **Decisión — cuenta deshabilitada por borrado lógico:** la entidad `User` tiene soft delete mediante `deletedAt` (timestamp nullable). Si el usuario está soft-deleted, el login devuelve 401 con el mismo `message` y `details` que cualquier credencial inválida, sin filtración del estado de la cuenta. No hay código de status distinto ni body diferenciado que un atacante pueda usar para enumerar. El evento se registra en logs con el código `account_disabled` para que el equipo de soporte/admin pueda auditar.

> **Decisión — response minimal:** el login devuelve **solo** el `accessToken`, no datos del usuario. El cliente que necesite el perfil lo pide en otro endpoint (no está en scope de este doc).

---

## 3. Movies (`/api/v1/movies`)

### `GET /movies` — Listado
- **Acceso:** público
- **Status codes:** `200`

**Query params (todos opcionales):**

| Param | Tipo | Default | Rango | Descripción |
|---|---|---|---|---|
| `page` | int | `1` | ≥ 1 | número de página |
| `limit` | int | `20` | 1–100 | items por página |
| `search` | string | — | 1–100 chars | busca en `title` y `director` usando `word_similarity` (no requiere normalización previa). |
| `sortBy` | enum | `episode_id` | `title` \| `release_date` \| `episode_id` | campo de ordenamiento |
| `order` | enum | `asc` | `asc` \| `desc` | dirección del ordenamiento |

**200 OK:**
```json
{
  "items": [
    { "id": 1, "external_id": "1", "title": "A New Hope", "provider": "swapi", "episode_id": 4, "director": "George Lucas", "release_date": "1977-05-25", "createdAt": "2026-06-23T15:30:00.000Z", "updatedAt": "2026-06-23T15:30:00.000Z" }
  ],
  "meta": { "page": 1, "limit": 20, "total": 6, "totalPages": 1 }
}
```
> **Nota — listado no incluye `attributes`:** el JSONB `attributes` con los arrays de URLs de SWAPI (`characters`, `planets`, etc.) solo se expone en el detalle (`GET /movies/:id`). El listado público carga los campos resumen; los arrays van por separado para no inflar cada item.

> **Decisión — listado público:** el endpoint de listado es accesible sin autenticación. Es la "cartelera" de películas disponibles; no expone datos sensibles (los campos son título, episode_id, director, fecha de estreno — todo público vía SWAPI).

> **Decisión — soft delete invisible:** las películas con `deletedAt` no aparecen en el listado, tampoco en el contador de `total`. El filtro `WHERE deletedAt IS NULL` aplica en toda query de este módulo.

> **Decisión — búsqueda (`word_similarity` con `pg_trgm`):** la búsqueda de `search` usa el operador `word_similarity` (`<%`) de la extensión `pg_trgm` sobre `title` y `director`:
> ```
> WHERE title <% :search OR director <% :search
> ```
> El operador `<%` devuelve `true` cuando **alguna palabra** del lado izquierdo es similar al string del lado derecho (más allá del threshold `pg_trgm.similarity_threshold`, default `0.3`). Esto significa:
> - `search="hope"` matchea `title="A New Hope"` porque "Hope" es similar a "hope".
> - `search="empire"` matchea `title="The Empire Strikes Back"` por la palabra "Empire".
> - El matching es **case-insensitive** y robusto a espacios y variaciones Unicode (ligaduras, acentos) sin necesidad de normalización previa.
> - Los caracteres `%` y `_` en el search **no son especiales** (no hay que escaparlos).

> **Decisión — índices del listado:** para que el endpoint no degrade con volumen, se necesitan al menos:
> - Un índice GIN (`pg_trgm`) sobre `title` y otro sobre `director`, ambos parciales `WHERE deletedAt IS NULL`, para soportar la búsqueda con `word_similarity`.
> - Un índice B-tree por cada campo de `sortBy` (`title`, `release_date`, `episode_id`), o el que el motor elija según estadísticas.
> - El filtro `deletedAt IS NULL` debe estar incluido en los índices anteriores (vía índice parcial) para evitar un seq scan filtrado.
>
> El detalle exacto de los `CREATE INDEX` queda en la migración correspondiente; este doc solo fija el contrato de performance.

### `GET /movies/:id` — Detalle
- **Acceso:** autenticado (cualquier rol: `user` o `admin`)
- **Status codes:** `200`, `401`, `404`

**Path params:**

| Param | Tipo | Formato | Notas |
|---|---|---|---|
| `id` | int (bigint) | entero positivo | generado por DB |

**200 OK:** objeto completo de la película con shape:
```json
{
  "id": 1,
  "external_id": "1",
  "title": "A New Hope",
  "provider": "swapi",
  "episode_id": 4,
  "opening_crawl": "It is a period of civil war...",
  "director": "George Lucas",
  "producer": "Gary Kurtz, Rick McCallum",
  "release_date": "1977-05-25",
  "attributes": {
    "characters": ["https://swapi.tech/api/people/1"],
    "planets": ["https://swapi.tech/api/planets/1"],
    "starships": ["https://swapi.tech/api/starships/12"],
    "vehicles": [],
    "species": ["https://swapi.tech/api/species/1"]
  },
  "createdAt": "2026-06-23T15:30:00.000Z",
  "updatedAt": "2026-06-23T15:30:00.000Z"
}
```
El campo `attributes` es un JSONB con shape `{characters: string[], planets: string[], starships: string[], vehicles: string[], species: string[]}`. Para películas manuales (`provider='manual'`), `attributes` es `{}`. Los campos `createdAt`/`updatedAt` se exponen para auditoría del cliente. `deletedAt` **no** se expone (soft delete invisible desde el cliente).
**401 Unauthorized** → no autenticado.
**404 Not Found** → id no existe o la película está soft-deleted.

> **Aclaración — acceso al detalle:** tanto usuarios regulares como admins pueden ver el detalle. El REQUIREMENT original mencionaba "solo usuarios regulares", pero eso impedía al admin editar lo que no puede ver, así que se amplía a ambos roles.

### `POST /movies` — Crear o reactivar por `external_id`
- **Acceso:** solo `admin` (`403` si no lo es)
- **Status codes:** `200`, `201`, `400`, `401`, `403`, `409`

**Body:**

| Campo | Tipo | Requerido | Longitud | Formato | Notas |
|---|---|---|---|---|---|
| `external_id` | string \| null | no | 1–100 chars | string no vacío si viene | id único de la fuente externa (ej. `uid` de SWAPI). |
| `episode_id` | int \| null | no | 1–20 | entero positivo | característica opcional. NO es la identidad. |
| `title` | string | sí | 1–200 chars | — | |
| `opening_crawl` | string | no | 0–5000 chars | — | |
| `director` | string | sí | 1–100 chars | — | |
| `producer` | string | sí | 1–200 chars | — | |
| `release_date` | string | sí | 10 chars | ISO 8601 date (`YYYY-MM-DD`) | se valida con `@IsDateString` o equivalente |

> **Nota — `provider` no se acepta en el body:** el server setea `provider='manual'` por default (POST /movies opera siempre dentro del namespace manual). Para películas con `external_id`, sigue siendo `provider='manual'`. El sync setea `provider='swapi'` explícito en namespace separado (ver §4). Si el cliente envía `provider` en el body, se devuelve `400` con `details` indicando que no es editable vía POST (la unicidad compuesta se garantiza a nivel DB; un provider explícito en body no aporta).

**201 Created** → se creó una fila nueva (no existía ninguna con `provider='manual'` y ese `external_id`, o el body no traía `external_id`). Devuelve la movie completa con `id` server-generated. Shape: el mismo que `GET /movies/:id` (incluye `provider`, `attributes`, `createdAt`, `updatedAt`).
**200 OK** → el body traía un `external_id` que ya existía como soft-deleted **dentro del namespace `provider='manual'`**; el endpoint reactivó la fila (`deletedAt = NULL`) y **reemplazó** los campos editables con los del body (semántica PUT). Devuelve la movie completa con `id` server-generated (mismo `id` que tenía antes).
**409 Conflict** → el body traía un `external_id` que ya existe como película activa. La modificación de películas activas es responsabilidad exclusiva de `PATCH /movies/:id`.
**400 Bad Request** → validación de campos.
**403 Forbidden** → usuario autenticado pero sin rol `admin`.

> **Decisión — unicidad compuesta `(provider, external_id)`:** la constraint UNIQUE es `(provider, external_id) WHERE external_id IS NOT NULL` (índice parcial). Esto significa:
> - Múltiples películas con `external_id=NULL` son válidas (todas manuales sin fuente externa).
> - Una película `('manual', 'abc')` y una película `('swapi', 'abc')` pueden coexistir (diferente provider).
> - El `POST /movies` opera siempre dentro del namespace `provider='manual'`: busca por `('manual', external_id)`.
> - El sync opera dentro del namespace `provider='swapi'`: busca por `('swapi', external_id)` (ver §4).
> - Las dos vías no se pisan entre providers. La reactivación de soft-deleted aplica solo dentro del mismo provider (POST reactiva manuales soft-deleted; sync **no** reactiva SWAPI soft-deleted por design).
>
> `external_id` dentro del provider es la identidad única de la película, **no** `episode_id`. `POST /movies` se comporta como **create or reactivate**, con **semántica PUT**: el body debe traer todos los campos editables (los mismos que acepta un INSERT normal). El cliente no "edita parcialmente" una película vía POST: para eso usa `PATCH /movies/:id`.
> - Si el body trae `external_id` y **no existe** fila `('manual', external_id)` → INSERT → `201`.
> - Si el body trae `external_id` y **existe fila soft-deleted** `('manual', external_id)` → reactivar (`deletedAt = NULL`) y reemplazar los campos editables con los del body → `200`.
> - Si el body trae `external_id` y **existe fila activa** `('manual', external_id)` → `409 Conflict`.
> - Si el body **no trae `external_id`** (o viene `null`) → INSERT directo → `201`. El registro queda con `provider='manual'` y `external_id=NULL`; es una película "manual" sin fuente externa.
>
> Si el body trae `external_id` pero falta cualquier campo requerido, devuelve `400` con las mismas validaciones que un INSERT normal. El body `{}` no es válido en POST (siempre debe traer al menos los campos requeridos). Los campos opcionales (`opening_crawl`, `episode_id`) que el body omite se setean a `null` (semántica PUT pura: el body reemplaza el recurso completo). Si el cliente quiere mantener un campo opcional en una reactivación, debe traerlo explícitamente en el body; si quiere editar parcialmente, usa `PATCH /movies/:id`.
>
> El flujo del endpoint es: primero intenta un `UPDATE ... SET deleted_at = NULL, ... WHERE provider = 'manual' AND external_id = ? AND deleted_at IS NOT NULL RETURNING *`. Si afecta 1 fila, devuelve `200` con la fila reactivada (PUT-like: reemplaza los campos editables). Si afecta 0 filas, intenta `INSERT RETURNING *`. Si el `INSERT` choca con la `UNIQUE` constraint compuesta (`23505`), devuelve `409` (la película existe activa dentro del namespace `provider='manual'`). Si el `INSERT` tiene éxito, devuelve `201` con la fila creada. Este orden evita el `SELECT` adicional y elimina races entre POSTs simultáneos: el `UPDATE` discrimina soft-deleted de activo, y la `UNIQUE` constraint compuesta arbitra entre POSTs concurrentes por el mismo `(provider, external_id)`.

> **Decisión — `external_id` y `provider` son inmutables después del POST:** una vez creada la película con un `external_id` y un `provider`, esos campos no se pueden modificar vía `PATCH`. La motivación es preservar la identidad única (doble clave del recurso): si cualquiera cambiara, sería una película distinta. Para "reasignar" el `external_id` o `provider` de una película hay que hacer `DELETE` + `POST` (manual o vía sync).

> **Decisión — `episode_id` es solo una característica:** `episode_id` es el número de episodio de la saga Star Wars. Es opcional, no identifica la película, y **no tiene constraint UNIQUE**: dos películas pueden compartir `episode_id` (ej. dos registros manuales con `episode_id=4`). El sync desde SWAPI persiste el `episode_id` tal cual viene (4, 5, 6, 1, 2, 3 según orden narrativo), pero la identidad la da `external_id` (= `uid`).

> **Decisión — strings persistidos sin normalización:** los campos `title`, `director` y `producer` se persisten **tal cual** vienen del cliente o de SWAPI, sin pipeline de normalización. El matching posterior en `GET /movies?search=...` usa `word_similarity` (`<%`), que es case-insensitive y robusto a variaciones Unicode por diseño. No hace falta `trim`, `NFKC` ni `lowercase`. El response devuelve el string en su forma original.

### `PATCH /movies/:id` — Actualizar parcial
- **Acceso:** solo `admin`
- **Status codes:** `200`, `400`, `401`, `403`, `404`

**Path params:** `id` (int, bigint).

**Body:** cualquiera de los campos editables de `POST`. **Todos opcionales** en PATCH (no requerido en el body). Si vienen, se validan con las mismas reglas (longitud, formato) que en `POST`. Los strings se persisten tal cual vienen del cliente (sin normalización: `word_similarity` en `GET /movies?search=...` los matchea igual).

**Nota:** `external_id` y `provider` **no se aceptan en PATCH** — son inmutables después del POST (ver decisiones en `POST /movies`). Si el cliente envía cualquiera de los dos en el body de PATCH, se devuelve `400` con `details` indicando que no son editables vía PATCH.

**Semántica del body:**

| Caso | Comportamiento |
|---|---|
| Body `{}` (vacío, sin campos) | Válido. `200 OK` con la película actual sin cambios. |
| Campo **ausente** (no viene en el body) | No se modifica. Se preserva el valor actual. |
| Campo con `null` | Borrar. Si la columna es `NOT NULL` (requerido en DB) → `400`. Si acepta `NULL` → se setea a `NULL`. |
| Campo string `""` en **requerido** | `400` (longitud mínima no se cumple). |
| Campo string `""` en **opcional** | Se persiste como `null` (= borrar). |

| Campo | Tipo | Longitud | Formato | Notas |
|---|---|---|---|---|
| `title` | string \| null | 1–200 chars | — | requerido en DB → `null` y `""` devuelven 400 |
| `episode_id` | int \| null | 1–20 | entero positivo | requerido en DB → `null` devuelve 400. NO es UNIQUE (es característica, no identidad). |
| `opening_crawl` | string \| null | 0–5000 chars | — | opcional. `null` y `""` lo borran (se persiste como `null`). |
| `director` | string \| null | 1–100 chars | — | requerido en DB → `null` y `""` devuelven 400 |
| `producer` | string \| null | 1–200 chars | — | requerido en DB → `null` y `""` devuelven 400 |
| `release_date` | string \| null | 10 chars | ISO 8601 date | requerido en DB → `null` devuelve 400 |

**200 OK:** movie actualizada (o sin cambios si el body era `{}` o no traía campos distintos al estado actual). Shape: el mismo que `GET /movies/:id` (incluye `provider`, `attributes`, `createdAt`, `updatedAt`).
**404 Not Found** → no existe o está soft-deleted (indistinguible desde el exterior).

> **Decisión — semántica del body PATCH:** el PATCH sigue el contrato "ausente = no modificar, `null` = borrar, valor = reemplazar". El body `{}` es válido e idempotente (200 sin cambios). Esto es coherente con JSON Merge Patch (RFC 7396) sin ser una implementación estricta de la spec: la diferencia clave es que `null` en un campo requerido devuelve `400` en vez de borrar y romper la invariante `NOT NULL`.

> **Decisión — implementación sin SELECT previo (soft delete race):** el endpoint hace un `UPDATE` directo con `WHERE id = ? AND deletedAt IS NULL`, sin hacer un `SELECT` previo. Esto:
> - Evita la race condition donde la película se borra entre el `SELECT` y el `UPDATE`.
> - Garantiza atomicidad: la condición `deletedAt IS NULL` se evalúa en la misma sentencia que el `UPDATE`.
> - Devuelve `404` si `0` filas afectadas (id no existe **o** está soft-deleted, indistinguible desde el exterior).
> - Devuelve `200` con la película actualizada si `1` fila afectada.
>
> Si el `UPDATE` afecta `0` filas por soft delete concurrente, no hay forma de distinguirlo de "id nunca existió" desde el response; el cliente recibe `404` igual. Esto es consistente con `GET`, `DELETE` y el resto de los endpoints que filtran por `deletedAt IS NULL`.

### `DELETE /movies/:id` — Eliminar
- **Acceso:** solo `admin`
- **Status codes:** `204`, `401`, `403`, `404`

**Path params:** `id` (int, bigint).

**204 No Content** → soft delete aplicado o ya estaba soft-deleted. Indistinguible desde el response: el estado final ("no disponible para el cliente") es el mismo en ambos casos.
**404 Not Found** → el `id` nunca existió en la tabla. No se aplica a películas que existieron y fueron soft-deleted.

> **Decisión — soft delete:** la película no se borra físicamente. Se setea el campo `deletedAt` (timestamp nullable). Consecuencias:
> - `GET /movies/:id` devuelve 404 para películas soft-deleted.
> - `GET /movies` las excluye del listado.
> - `PATCH /movies/:id` devuelve 404 para películas soft-deleted (no se puede modificar lo que no existe desde el punto de vista del cliente).
> - `DELETE /movies/:id` es idempotente: devuelve 204 tanto para películas recién borradas como para las que ya estaban soft-deleted. Solo devuelve 404 si el id nunca existió.
> - La sync puede decidir qué hacer con SWAPI cuando encuentra películas borradas localmente (ver §4).
>
> No se contempla en este alcance un endpoint para listar/restaurar películas soft-deleted.

> **Decisión — implementación con `COALESCE` (sin SELECT adicional):** el endpoint distingue los casos `204` vs `404` con **una sola query** que preserva el timestamp original del soft-delete:
> ```sql
> UPDATE movies
> SET deleted_at = COALESCE(deleted_at, NOW())
> WHERE id = ?
> RETURNING *, (deleted_at = NOW()) AS just_deleted;
> ```
> - Si afecta 1 fila y `just_deleted = true` → recién borrado (`deleted_at` era NULL, ahora es NOW()) → `204`.
> - Si afecta 1 fila y `just_deleted = false` → ya estaba soft-deleted, **timestamp preservado** (`deleted_at` era X, sigue siendo X) → `204`.
> - Si afecta 0 filas → el `id` nunca existió → `404`.
>
> El `COALESCE(deleted_at, NOW())` evita pisar el timestamp original cuando la película ya estaba borrada (mejor para auditoría). El flag `just_deleted` se calcula en SQL, no requiere un query adicional.

---

## 4. Sync SWAPI (`/api/v1/movies/sync`)

### `POST /movies/sync` — Sincronizar desde SWAPI
- **Acceso:** solo `admin`
- **Status codes:** `200`, `401`, `403`, `409`, `502`

**Body:** vacío.

**200 OK:**
```json
{
  "fetched": 6,
  "created": 0,
  "updated": 6,
  "errors": []
}
```

- `errors`: array de strings. Cada string es el mensaje de error que ocurrió al procesar una película específica de SWAPI (ej. `"film uid=1: missing required field 'title'"`). El sync continúa con las demás películas aunque alguna falle; la respuesta final reporta los errores parciales sin abortar el proceso.

**409 Conflict** → ya hay una sync en curso. Ver decisión de concurrencia abajo.
**502 Bad Gateway** → SWAPI caída o respuesta inválida.
**403 Forbidden** → no es admin.

> **Decisión — endpoint vs cron:** se implementa como endpoint bajo demanda. La lógica vive en `SyncMoviesService`, separada del controller. Si más adelante se quiere ejecución automática, se puede agregar `@nestjs/schedule` con un `@Cron(...)` que invoque el mismo service. La separación service/controller permite ambos entry points sin duplicar lógica.

> **Decisión — concurrencia (lock en memoria):** dos admins que disparan `POST /movies/sync` simultáneamente NO ejecutan en paralelo. Se usa un lock en memoria (mutex) para serializar las ejecuciones. Si llega un segundo request mientras hay uno en curso, devuelve `409 Conflict` con `message: "Sync already in progress"`. Esto evita:
> - Pisar la primera sync con la segunda.
> - Duplicar trabajo de red contra SWAPI.
> - Race conditions en los `UPSERT` de la DB.

> **Decisión — registros desaparecidos en SWAPI:** si SWAPI deja de devolver una película que nosotros tenemos en la DB (porque la sacó de su API, por un error transitorio, o por rate limiting), el sync **NO la soft-deletea ni la modifica**. La lógica del sync es estrictamente UPSERT sobre lo que la fuente devuelve: lo que no viene, no se toca. Razones:
> - SWAPI puede tener errores transitorios; borrar por error es peor que tener datos "viejos".
> - El sync no es una herramienta de auditoría ni de consistencia estricta con la fuente.
> - El admin que quiera sincronizar su DB con SWAPI puede hacerlo manualmente.
>
> Si en el futuro se quiere detectar "películas stale", se agrega una columna `lastSyncedAt` y un job periódico que compare. Hoy no está en scope.

> **Decisión — reejecución idempotente:** la sync es idempotente por construcción: el `UPSERT` por `external_id` hace que ejecutar la sync N veces seguidas dé exactamente el mismo resultado que ejecutarla una vez (mismas filas, mismos valores). No hace falta throttling ni protección extra contra "spamear el botón". El contrato "`POST /movies/sync` ejecutado N veces = ejecutado 1 vez" se cumple.

> **Decisión — comportamiento ante soft-deleted:** al sincronizar, las películas con `deletedAt` no se recrean ni se actualizan (quedan en su estado de baja). El match es por `external_id`: si la película soft-deleted tiene un `external_id` que SWAPI vuelve a traer, el sync la ignora (no la reactiva). Para reactivarla hay que usar `POST /movies` con su `external_id`, no el sync. Si la película soft-deleted NO tiene `external_id` (es manual), el sync tampoco la toca.

> **Decisión — matching por `(provider, external_id)` (no por `episode_id`):** el sync identifica cada película de SWAPI por la clave compuesta `(provider, external_id)`, donde `provider='swapi'` y `external_id` es el `uid` de SWAPI. La unicidad compuesta garantiza que el namespace `'swapi'` está aislado del namespace `'manual'` (ver §3 `POST /movies`). Para cada película devuelta por SWAPI, el sync hace:
> - `SELECT * FROM movies WHERE provider = 'swapi' AND external_id = ?`
> - Si **no existe** → INSERT con `provider='swapi'` (nueva).
> - Si **existe activa** → UPDATE con los datos frescos de SWAPI (los campos provistos, sin normalización).
> - Si **existe soft-deleted** → omitir (no se toca; ver decisión anterior).
>
> `episode_id` NO se usa como clave de matching. SWAPI persiste el `episode_id` como una característica más de la película (4, 5, 6, 1, 2, 3 según orden narrativo), pero la identidad la da `external_id`.

> **Decisión — tolerancia a campos faltantes de SWAPI:** nuestro modelo define qué campos acepta (`title`, `episode_id`, `opening_crawl`, `director`, `producer`, `release_date`). SWAPI puede, en teoría, omitir o cambiar la presencia de estos campos en su response. Si nuestro modelo declara un campo como **requerido** y SWAPI lo devuelve vacío o ausente, eso es un **error nuestro de modelado**, no un error de SWAPI: hay que revisar la API y ajustar nuestro modelo. El sync no se adapta a campos faltantes: si un campo requerido viene ausente o vacío de SWAPI, el sync registra el error en `errors[]` y omite esa película (no la inserta/actualiza parcialmente). Los campos opcionales (`opening_crawl`) sí toleran ausencias y se persisten como `null`.

> **Decisión — strings del sync sin normalización:** los strings traídos de SWAPI (`title`, `director`, `producer`) se persisten tal cual vienen del response, sin pipeline de normalización. El matching posterior usa `word_similarity`, que es case-insensitive y robusto a variaciones Unicode. No hace falta normalizar ni en creación manual, ni en `PATCH`, ni en sync.

> **Decisión — hidratación de relaciones:** SWAPI devuelve `characters`, `planets`, `starships`, `vehicles`, `species` como URLs. Se persisten las URLs tal cual en el **campo JSONB `attributes`** con shape:
> ```json
> {
>   "characters": ["https://swapi.tech/api/people/1"],
>   "planets": ["https://swapi.tech/api/planets/1"],
>   "starships": ["https://swapi.tech/api/starships/12"],
>   "vehicles": [],
>   "species": ["https://swapi.tech/api/species/1"]
> }
> ```
> Arrays vacíos permitidos. La DB no enforza estructura (JSONB sin schema check); la validación de shape se hace en `SyncMoviesService` antes de persistir. No se hace fetch secundario de cada URL en esta primera versión.

---

## 5. Health (`/api/v1/health`)

### `GET /api/v1/health` — Healthcheck
- **Acceso:** público
- **Status codes:** `200`, `503`

**200 OK:**
```json
{ "status": "ok", "timestamp": "2026-06-23T15:30:00.000Z", "uptime": 1234 }
```

**503 Service Unavailable** → DB caída (no responde a `SELECT 1`).

> Útil para deploy en plataformas con healthcheck (Render, Railway, Fly) y para smoke test post-deploy.

---

## 6. Shape de errores (consistente en toda la API)

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "details": [
    { "field": "email", "constraints": { "isEmail": "email must be a valid email" } }
  ],
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-06-23T15:30:00.000Z"
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `statusCode` | int | HTTP status |
| `error` | string | nombre corto del error |
| `message` | string | mensaje humano |
| `details` | array \| null | presente en errores de validación; array de `{ field, constraints }` |
| `traceId` | string | ID de request, UUID v4, generado por middleware y logueado. Distinto de los IDs de entidad (que son `bigint`). |
| `timestamp` | string | ISO 8601 UTC |
