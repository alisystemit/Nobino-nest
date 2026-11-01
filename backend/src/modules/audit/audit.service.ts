import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';

export interface AuditLogInput {
  actorId?: string;
  actorPhone?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(log: AuditLogInput) {
    await this.prisma.auditLog.create({
      data: {
        actorId: log.actorId ?? undefined,
        actorPhone: log.actorPhone ?? undefined,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId ?? undefined,
        before: (log.before ?? null) as any,
        after: (log.after ?? null) as any,
        ip: log.ip ?? undefined,
      },
    });
  }
}
