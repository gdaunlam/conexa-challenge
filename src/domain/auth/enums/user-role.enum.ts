export type UserRole = 'admin' | 'user';

export const DEFAULT_USER_ROLE: UserRole = 'user';

export const USER_ROLES: readonly UserRole[] = ['admin', 'user'] as const;
