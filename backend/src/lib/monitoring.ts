/**
 * پایش خطا بدون وابستگی سمت کلاینت. در آینده می‌توان پل Sentry اینجا اضافه شد.
 */
export async function reportError(error: unknown, context?: Record<string, unknown>) {
  try {
    console.error("[error]", error, context ?? {});
  } catch {
    // ignore
  }
}