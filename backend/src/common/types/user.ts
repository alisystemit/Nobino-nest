/** نقش‌های کاربری — هماهنگ با enum Role در Prisma. */
export type UserRole = "CUSTOMER" | "SALON_OWNER" | "AGENT" | "ADMIN";

export interface AuthUser {
  id: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
}
