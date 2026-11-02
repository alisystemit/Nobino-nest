/**
 * پیوند حساب پیام‌رسان ↔ کاربر نوبینو.
 *
 * برای پرهیز از تغییر اسکیما، پیوندها در همان جدول تنظیمات (Setting) با کلید
 * `miniapps.link.<platform>.<externalUserId>` ذخیره می‌شوند و مقدارشان JSON
 * `{ userId, username, linkedAt }` است. این کلیدها در پنل سوپرادمین دیده نمی‌شوند
 * (گروه `miniapps` در کاتالوگ فقط فیلدهای معلوم را نمایش می‌دهد).
 */
import { getSetting, updateSetting } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { linkKey } from "./webapp-data";

type LinkPayload = { userId: string; username?: string; name?: string; linkedAt?: string };

function parse(raw: string | undefined): LinkPayload | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as LinkPayload;
    return value?.userId ? value : null;
  } catch {
    // مقدار قدیمی/دستی (فقط شناسهٔ کاربر)
    return /^[a-z0-9]{6,40}$/i.test(raw.trim()) ? { userId: raw.trim() } : null;
  }
}

/** شناسهٔ کاربر نوبینوی متصل به این حساب پیام‌رسان (یا null) */
export async function findLinkedUserId(platform: string, externalId: string): Promise<string | null> {
  let key: string;
  try {
    key = linkKey(platform, externalId);
  } catch {
    return null;
  }
  const row = parse(await getSetting(key));
  if (!row?.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { id: true, isActive: true } });
  return user?.isActive ? user.id : null;
}

/** نوشتن/به‌روزرسانی پیوند (آخرین اتصال معتبر ملاک است) */
export async function linkMessengerUser(input: {
  platform: string;
  externalId: string;
  userId: string;
  username?: string;
  name?: string;
}): Promise<void> {
  const key = linkKey(input.platform, input.externalId);
  const payload: LinkPayload = {
    userId: input.userId,
    username: input.username,
    name: input.name,
    linkedAt: new Date().toISOString(),
  };
  await updateSetting(key, JSON.stringify(payload), { group: "miniapps", type: "string" });
}

/** شمارش پیوندها برای گزارشِ پنل (بدون فهرست کردن مقادیر) */
export async function linkedCount(): Promise<number> {
  const rows = await prisma.setting.findMany({ where: { key: { startsWith: "miniapps.link." } }, select: { id: true } });
  return rows.length;
}
