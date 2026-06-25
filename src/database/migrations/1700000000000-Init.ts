import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1700000000000 implements MigrationInterface {
  public async up(_queryRunner: QueryRunner): Promise<void> {}

  public async down(_queryRunner: QueryRunner): Promise<void> {}
}
