import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Entidad base abstracta para todas las entidades del proyecto.
 * - `id` bigint (BIGSERIAL) generado por la base de datos.
 * - `createdAt` y `updatedAt` administrados por TypeORM.
 * - `deletedAt` habilita soft-delete nativo: cualquier query con `softDelete` o `restore`
 *   ignora (o restaura) filas segun este timestamp.
 *
 * No lleva `@Entity()` porque es abstracta: debe ser extendida por entidades concretas.
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}