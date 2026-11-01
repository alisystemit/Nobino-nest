/**
 * نگه‌دارنده‌های Nest.js برای احراز هویت
 */

import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@/common/types/user';

export function RequireRole(roles: UserRole[]) {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const ctx = args[0] as any;
      if (!ctx || !ctx.switchToHttp) return originalMethod.apply(this, args);

      const user = ctx.switchToHttp().getRequest().user;
      if (!user || !roles.includes(user.role as UserRole)) {
        throw new ForbiddenException('دسترسی غیرمجاز');
      }

      return originalMethod.apply(this, args);
    };
    return descriptor;
  };
}

export function RequireSalonManage(salonId?: string) {
  return (target: any, key: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    descriptor.value = async function (...args: any[]) {
      const ctx = args[0] as any;
      if (!ctx || !ctx.switchToHttp) return originalMethod.apply(this, args);

      const req = ctx.switchToHttp().getRequest();
      const user = req.user;

      if (!user || user.role !== 'SALON_OWNER') {
        throw new ForbiddenException('دسترسی غیرمجاز');
      }

      if (salonId && user.salonId && user.salonId !== salonId) {
        throw new ForbiddenException('دسترسی به این سالن مجاز نیست');
      }

      return originalMethod.apply(this, args);
    };
    return descriptor;
  };
}

export function RequireAdmin() {
  return RequireRole(['ADMIN']);
}

export function RequireSalonOwner() {
  return RequireRole(['SALON_OWNER']);
}
