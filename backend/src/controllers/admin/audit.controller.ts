import { Controller, Get } from '@nestjs/common';
import { requireRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { json } from '@/lib/utils';

@Controller('api/v2/admin/audit')
export class AuditController {
  @Get()
  async list() {
    await requireRole(['ADMIN']);
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return json({ success: true, logs });
  }
}
