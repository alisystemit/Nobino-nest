import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/common/database/prisma.service';

export interface JwtPayload {
  sub: string;
  role: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async getCurrentUser(token?: string) {
    if (!token) return null;

    try {
      const payload = this.jwt.verify(token) as JwtPayload;
      if (!payload) return null;

      const { createHash } = require('crypto');
      const tokenHash = createHash('sha256').update(token).digest('hex');

      const session = await this.prisma.session.findFirst({
        where: {
          userId: payload.sub,
          tokenHash,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });

      if (!session) return null;

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          phone: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
        },
      });

      if (!user || !user.isActive) return null;
      return user;
    } catch {
      return null;
    }
  }

  async requireAuth(token?: string) {
    const user = await this.getCurrentUser(token);
    if (!user) throw new Error('Authentication required');
    return user;
  }

  async requireRole(roles: string[], token?: string) {
    const user = await this.requireAuth(token);
    if (!roles.includes(user.role)) throw new Error('Forbidden');
    return user;
  }

  async requireSalonManage(salonId: string, token?: string) {
    const user = await this.requireAuth(token);
    if (user.role === 'ADMIN') return { ...user, salonId };
    if (user.role !== 'SALON_OWNER') throw new Error('Forbidden');
    const salon = await this.prisma.salon.findFirst({
      where: { id: salonId, ownerId: user.id },
      select: { id: true },
    });
    if (!salon) throw new Error('Forbidden');
    return { ...user, salonId };
  }

  async requireAdmin(token?: string) {
    return this.requireRole(['ADMIN'], token);
  }

  async requireSalonOwner(token?: string) {
    return this.requireRole(['SALON_OWNER'], token);
  }
}
