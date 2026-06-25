import { MigrationInterface, QueryRunner } from 'typeorm';

export const USERS_TABLE = 'users';
export const USERS_EMAIL_UNIQUE_CONSTRAINT = 'UQ_users_email';
export const USERS_ROLE_CHECK_CONSTRAINT = 'CHK_users_role';

export class CreateUsersTable1700000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "${USERS_TABLE}" (
        "id" BIGSERIAL PRIMARY KEY,
        "email" VARCHAR(255) NOT NULL,
        "password_hash" VARCHAR(255) NOT NULL,
        "role" VARCHAR(20) NOT NULL DEFAULT 'user',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "deleted_at" TIMESTAMPTZ NULL,
        CONSTRAINT "${USERS_EMAIL_UNIQUE_CONSTRAINT}" UNIQUE ("email"),
        CONSTRAINT "${USERS_ROLE_CHECK_CONSTRAINT}" CHECK ("role" IN ('admin', 'user'))
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "${USERS_TABLE}"`);
  }
}
