import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { DEFAULT_USER_ROLE, UserRole } from '../enums/user-role.enum';

@Entity('users')
export class User extends BaseEntity {
  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 20, default: DEFAULT_USER_ROLE })
  role!: UserRole;

  toJSON(): Record<string, unknown> {
    const { passwordHash: _ignored, ...safe } = this;
    return safe;
  }
}
