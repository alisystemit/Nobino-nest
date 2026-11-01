import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * هش و بررسی رمز عبور با scrypt داخلی Node (بدون وابستگی).
 * قالب ذخیره‌سازی: `scrypt:<salt-hex>:<hash-hex>`
 * این ماژول بدون وابستگی به Prisma است تا در تست‌های Node خام قابل اجرا باشد.
 */

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number
) => Promise<Buffer>;

const KEYLEN = 64;
export const PASSWORD_MIN = 8;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, KEYLEN);
  return `scrypt:${salt}:${buf.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, salt, hex] = stored.split(":");
    if (scheme !== "scrypt" || !salt || !hex) return false;
    const expected = Buffer.from(hex, "hex");
    const actual = await scryptAsync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** بررسی قدرت رمز عبور — پیام خطای فارسی یا null در صورت صحت */
export function passwordIssue(password: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `رمز عبور باید حداقل ${PASSWORD_MIN} کاراکتر باشد.`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "رمز عبور باید ترکیبی از حروف انگلیسی و عدد باشد.";
  }
  return null;
}
