import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppRole, ROLES_KEY } from './roles.decorator';

interface RequestWithUser {
  user?: { sub: string; role?: AppRole; scope?: string };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AppRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const role = req.user?.role;
    if (!role) {
      throw new ForbiddenException('No role assigned');
    }
    if (role === 'super_admin') return true;
    if (!required.includes(role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}