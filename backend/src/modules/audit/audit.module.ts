import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '@/common/database/prisma.module';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET || "dev-secret-change-me" }), PrismaModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
