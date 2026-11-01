import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/common/database/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async setReviewReplyForAdmin(reviewId: string, reply: string, adminId: string, adminPhone: string) {
    const before = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        reply: true,
        salonId: true,
        salon: { select: { name: true } },
      },
    });
    if (!before) throw new Error('نظر یافت نشد');
    return this.applyReply(before, reply, adminId, adminPhone);
  }

  async setReviewReplyForSalon(salonId: string, reviewId: string, reply: string, userId: string, userPhone: string) {
    const before = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        reply: true,
        salonId: true,
        salon: { select: { name: true } },
      },
    });
    if (!before || before.salonId !== salonId) throw new Error('نظر یافت نشد');
    return this.applyReply(before, reply, userId, userPhone);
  }

  async applyReply(before: any, reply: string, actorId: string, actorPhone: string) {
    const trimmed = reply?.trim();
    const nextReply = trimmed && trimmed.length > 0 ? trimmed : null;

    const review = await this.prisma.review.update({
      where: { id: before.id },
      data: { reply: nextReply, repliedAt: nextReply ? new Date() : null },
      select: { id: true, reply: true, repliedAt: true },
    });

    await this.audit.log({
      actorId,
      actorPhone,
      action: nextReply ? 'reply_review' : 'delete_review_reply',
      entityType: 'Review',
      entityId: before.id,
      before: { reply: before.reply, salonId: before.salonId, salonName: before.salon?.name ?? null },
      after: { reply: review.reply, repliedAt: review.repliedAt },
    });

    return review;
  }

  async listSalonReviewsForOwner(salonId: string) {
    const reviews = await this.prisma.review.findMany({
      where: { salonId },
      include: {
        customer: { select: { name: true, phone: true } },
        staff: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      customerName: r.customer.name ?? r.customer.phone,
      staff: r.staff?.name ?? null,
      reply: r.reply,
      repliedAt: r.repliedAt,
      createdAt: r.createdAt,
    }));
  }
}
