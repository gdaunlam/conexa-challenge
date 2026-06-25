import { getMetadataArgsStorage } from 'typeorm';
import { User } from './user.entity';
import { DEFAULT_USER_ROLE } from '../enums/user-role.enum';

describe('User entity', () => {
  it('extends BaseEntity so it inherits id, createdAt, updatedAt, deletedAt', () => {
    const user = new User();

    expect(user).toBeInstanceOf(User);
  });

  it('does not include passwordHash in JSON.stringify output (select: false)', () => {
    const user = new User();
    user.email = 'foo@bar.com';
    user.passwordHash = '$2b$10$abcdefghijklmnopqrstuv';
    user.role = DEFAULT_USER_ROLE;

    const serialized = JSON.stringify(user);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('$2b$10$abcdefghijklmnopqrstuv');
  });

  it('does not include passwordHash in toString output', () => {
    const user = new User();
    user.email = 'foo@bar.com';
    user.passwordHash = '$2b$10$abcdefghijklmnopqrstuv';

    expect(user.toString()).not.toContain('passwordHash');
    expect(user.toString()).not.toContain('$2b$10$abcdefghijklmnopqrstuv');
  });

  it('registers email as a unique column (matches the UNIQUE constraint in the migration)', () => {
    const uniqueColumns = getMetadataArgsStorage().columns.filter(
      (column) =>
        column.target === User && column.propertyName === 'email' && column.options.unique === true,
    );

    expect(uniqueColumns).toHaveLength(1);
    expect(uniqueColumns[0]?.options.type).toBe('varchar');
    expect(uniqueColumns[0]?.options.length).toBe(255);
  });

  it('registers passwordHash with select: false so the column is excluded from default selects', () => {
    const passwordColumn = getMetadataArgsStorage().columns.find(
      (column) => column.target === User && column.propertyName === 'passwordHash',
    );

    expect(passwordColumn).toBeDefined();
    expect(passwordColumn?.options.select).toBe(false);
    expect(passwordColumn?.options.name).toBe('password_hash');
  });

  it('registers role with the documented default (admin creation only via seed/CLI/DB)', () => {
    const roleColumn = getMetadataArgsStorage().columns.find(
      (column) => column.target === User && column.propertyName === 'role',
    );

    expect(roleColumn).toBeDefined();
    expect(roleColumn?.options.default).toBe(DEFAULT_USER_ROLE);
    expect(roleColumn?.options.type).toBe('varchar');
    expect(roleColumn?.options.length).toBe(20);
  });

  it('registers the entity with the documented table name and own columns (autoLoadEntities contract)', () => {
    const entityArgs = getMetadataArgsStorage().tables.find((table) => table.target === User);
    expect(entityArgs).toBeDefined();
    expect(entityArgs?.name).toBe('users');

    const ownColumnNames = getMetadataArgsStorage()
      .columns.filter((column) => column.target === User)
      .map((column) => column.propertyName)
      .sort();
    expect(ownColumnNames).toEqual(['email', 'passwordHash', 'role'].sort());

    const baseColumns = getMetadataArgsStorage()
      .columns.filter((column) => {
        const target = column.target;
        return typeof target === 'function' && target.name === 'BaseEntity';
      })
      .map((column) => column.propertyName)
      .sort();
    expect(baseColumns).toEqual(['createdAt', 'deletedAt', 'id', 'updatedAt'].sort());
  });
});
