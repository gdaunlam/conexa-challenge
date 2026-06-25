import { Column, getMetadataArgsStorage } from 'typeorm';
import { BaseEntity } from './base.entity';

class TestEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name!: string;
}

describe('BaseEntity', () => {
  it('can be extended by a concrete entity', () => {
    const entity = new TestEntity();

    expect(entity).toBeInstanceOf(BaseEntity);
    expect(entity).toBeInstanceOf(TestEntity);
  });

  it('does not set id or timestamps until TypeORM persists the row', () => {
    const entity = new TestEntity();

    expect(entity.id).toBeUndefined();
    expect(entity.createdAt).toBeUndefined();
    expect(entity.updatedAt).toBeUndefined();
    expect(entity.deletedAt).toBeUndefined();
  });

  it('registers deletedAt as a nullable delete-date column', () => {
    // El campo `deletedAt` admite `null` (fila activa) o `Date` (fila soft-deleted).
    // La invariante se valida contra los argumentos de metadata de TypeORM:
    // el decorador `@DeleteDateColumn({ nullable: true })` registra la columna
    // con `mode === 'deleteDate'` y `options.nullable === true`.
    // Como la declaracion vive en `BaseEntity`, `target` es la propia clase
    // abstracta (TypeORM no re-registra la columna en cada subclase).
    const deletedAtColumn = getMetadataArgsStorage().columns.find(
      (column) => column.propertyName === 'deletedAt' && column.mode === 'deleteDate',
    );

    expect(deletedAtColumn).toBeDefined();
    expect(deletedAtColumn?.options.nullable).toBe(true);
  });

  it('registers createdAt and updatedAt as timestamp columns managed by TypeORM', () => {
    // `createdAt` y `updatedAt` son columnas de timestamp que TypeORM mantiene
    // automaticamente: `@CreateDateColumn` y `@UpdateDateColumn` registran
    // metadata con `mode` igual a `'createDate'` y `'updateDate'`.
    const createdAtColumn = getMetadataArgsStorage().columns.find(
      (column) => column.propertyName === 'createdAt' && column.mode === 'createDate',
    );
    const updatedAtColumn = getMetadataArgsStorage().columns.find(
      (column) => column.propertyName === 'updatedAt' && column.mode === 'updateDate',
    );

    expect(createdAtColumn).toBeDefined();
    expect(updatedAtColumn).toBeDefined();
  });
});
