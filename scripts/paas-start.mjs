#!/usr/bin/env node
/**
 * استقرار روی PaaS (Vercel, Railway, Render, ایران)
 * نسخه NestJS با اسکریپت شروع اختصاصی
 */
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log("🚀 شروع پروژه Nobino (نسخه NestJS)");

try {
  console.log("📝 تولید Prisma Client...");
  const prismaCli = path.join(ROOT, "node_modules", "prisma", "build", "index.js");
  if (require("fs").existsSync(prismaCli)) {
    execSync(`node ${prismaCli} generate`, { stdio: "inherit", cwd: ROOT });
  }

  console.log("🔨 ساخت پروژه...");
  execSync("npm run build:backend", { stdio: "inherit", cwd: ROOT });

  console.log("⚡ شروع سرور...");
  execSync("npm run start:backend", { stdio: "inherit", cwd: ROOT });
} catch (err) {
  console.error("❌ خطا در شروع:", err.message);
  process.exit(1);
}
