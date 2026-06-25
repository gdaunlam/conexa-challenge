import { MigrationInterface, QueryRunner } from 'typeorm';

export const MOVIES_TABLE = 'movies';
export const MOVIES_PROVIDER_EXTERNAL_ID_INDEX = 'uq_movies_provider_external_id';

export class CreateMoviesTable1700000002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(
      `CREATE TABLE "${MOVIES_TABLE}" (
        "id" BIGSERIAL PRIMARY KEY,
        "title" VARCHAR(200) NOT NULL,
        "episode_id" INT NULL,
        "opening_crawl" TEXT NULL,
        "director" VARCHAR(100) NOT NULL,
        "producer" VARCHAR(200) NOT NULL,
        "release_date" DATE NOT NULL,
        "provider" VARCHAR(50) NOT NULL DEFAULT 'manual',
        "external_id" VARCHAR(100) NULL,
        "attributes" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ NULL
      )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "${MOVIES_PROVIDER_EXTERNAL_ID_INDEX}" ON "${MOVIES_TABLE}" ("provider", "external_id") WHERE "external_id" IS NOT NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_movies_title_trgm" ON "${MOVIES_TABLE}" USING GIN ("title" gin_trgm_ops) WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_movies_director_trgm" ON "${MOVIES_TABLE}" USING GIN ("director" gin_trgm_ops) WHERE "deleted_at" IS NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_movies_release_date" ON "${MOVIES_TABLE}" ("release_date") WHERE "deleted_at" IS NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_movies_episode_id" ON "${MOVIES_TABLE}" ("episode_id") WHERE "deleted_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "${MOVIES_TABLE}"`);
  }
}
