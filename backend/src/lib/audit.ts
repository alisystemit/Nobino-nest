import { prisma } from "@/lib/prisma";

interface AuditInput {
  actorId?: string;
  actorPhone?: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

/** ثبت رویداد حسابرسی (اقدامات مدیران/پشتیبانی) */
export async function logAudit(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      actorPhone: input.actorPhone,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before != null ? (input.before as never) : undefined,
      after: input.after != null ? (input.after as never) : undefined,
      ip: input.ip,
    },
  });
}

export async function getAuditLogs(limit = 100) {
  return prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
