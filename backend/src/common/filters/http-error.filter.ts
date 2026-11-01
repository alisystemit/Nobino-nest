import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';

/**
 * فیلتر سراسری خطا — خطاهای HTTP داخلی (`httpError` با خاصیت status) را
 * به پاسخ JSON با کد وضعیت درست تبدیل می‌کند تا به‌جای 500 عمومی،
 * 400/401/403/404 واقعی برگردد.
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    if (res.headersSent) return;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : String((body as any)?.message ?? body);
    } else if (exception && typeof exception === 'object') {
      const e = exception as { status?: unknown; statusCode?: unknown; message?: unknown };
      if (typeof e.status === 'number') status = e.status;
      else if (typeof e.statusCode === 'number') status = e.statusCode;
      if (typeof e.message === 'string') message = e.message;
    }

    res.status(status).json({ success: false, error: message, statusCode: status });
  }
}
