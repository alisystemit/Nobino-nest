import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type UserRole = 'CUSTOMER' | 'SALON_OWNER' | 'AGENT' | 'ADMIN';

export interface AuthUser {
  id: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  salonId?: string | null;
}

/** استخراج کاربر جاری از درخواست (پس از گذر از guard/strategy) */
export const AuthUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return (req.user as AuthUser | undefined) ?? null;
});
