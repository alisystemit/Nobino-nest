import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '@/common/database/prisma.module';
import { AuditService } from './audit.service';
import { AuditController } from '../../controllers/admin/audit.controller';

@Global()
@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET || 'super-secret-key' }), PrismaModule],
  providers: [AuditService],
  exports: [AuditService],
  controllers: [AuditController],
})
export class AuditModule {}
