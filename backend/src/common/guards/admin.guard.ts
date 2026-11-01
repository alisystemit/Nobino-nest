import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { requireRole } from '@/lib/auth/guards';

@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await requireRole(['ADMIN']);
    return true;
  }
}
