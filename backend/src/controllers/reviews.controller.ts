import { Controller, Patch, Body } from '@nestjs/common';
import { requireRole } from '@/lib/auth/guards';
import { ReviewsService } from '@/modules/reviews/reviews.service';
import { json } from '@/lib/utils';

@Controller('api/v2/admin/reviews')
export class ReviewsController {
  constructor(private readonly svc: ReviewsService) {}

  @Patch()
  async reply(@Body() body: { reviewId: string; reply?: string }) {
    const admin = await requireRole(['ADMIN']);
    const review = await this.svc.setReviewReplyForAdmin(body.reviewId, body.reply ?? '', admin.id, admin.phone);
    return json({ success: true, review });
  }
}
