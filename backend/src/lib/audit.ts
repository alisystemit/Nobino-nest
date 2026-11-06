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

// کلیدهای حساس که نباید در لاگ ذخیره شوند
const SENSITIVE_KEYS = [
  "password", "passwordHash", "password_hash",
  "apiKey", "api_key", "apikey",
  "secret", "token", "jwt", "auth",
  "salt", "privateKey", "private_key",
  "access_token", "refresh_token",
  "databaseUrl", "database_url", "DATABASE_URL",
];

/**
 * حذف مقادیر حساس از داده‌هایی که در لاگ ذخیره می‌شوند
 */
function sanitizeAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    // کوتاه کردن رشته‌های طولانی
    if (value.length > 500) return value.substring(0, 500) + " ... (truncated)";
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeAuditValue);
  }
  if (typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      // اگر کلید حساس است، مقدار را مخفی کن
      if (SENSITIVE_KEYS.some(k => lowerKey.includes(k))) {
        sanitized[key] = "***REDACTED***";
      } else {
        sanitized[key] = sanitizeAuditValue(val);
      }
    }
    return sanitized;
  }
  return value;
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
      before: input.before != null ? sanitizeAuditValue(input.before) : undefined,
      after: input.after != null ? sanitizeAuditValue(input.after) : undefined,
      ip: input.ip,
    },
  });
}

export async function getAuditLogs(limit = 100) {
  return prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}
