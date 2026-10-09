/**
 * @Roles('admin', 'super_admin') - Restrict a route to specific roles.
 *
 * Requires the RolesGuard to be active. The guard reads req.user.role
 * (set by JwtAuthGuard from the JWT payload) and compares against the
 * allowed list.
 */
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export type AppRole =
  | 'user'
  | 'support'
  | 'moderator'
  | 'admin'
  | 'super_admin';

export const Roles = (...roles: AppRole[]) => SetMetadata(ROLES_KEY, roles);