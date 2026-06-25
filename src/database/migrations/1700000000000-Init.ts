import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration inicial del proyecto.
 *
 * Esta migration es un placeholder explicito: todavia no existe ninguna entity
 * de dominio (`User`, `Movie`), asi que no hay schema que crear. Vive en el
 * historial para que `migrationsRun: true` tenga al menos una entrada, los
 * deployments queden registrados en la tabla `migrations` de TypeORM, y la
 * sucesion temporal de migraciones quede documentada desde el primer deploy.
 *
 * Las migraciones que materialicen el schema (tablas `users`, `movies`, indices
 * `pg_trgm`, etc.) llegan con el pase de dominio. Cuando existan, se insertan
 * nuevas migraciones DESPUES de esta, no se modifica este archivo: cada cambio
 * ya desplegado queda inmutable.
 */
export class Init1700000000000 implements MigrationInterface {
  public async up(_queryRunner: QueryRunner): Promise<void> {
    // No-op: el schema inicial lo crean las migraciones de User/Movie.
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: `up` no creo nada que revertir.
  }
}
