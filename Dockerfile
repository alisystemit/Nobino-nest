# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────
# Nobino (نسخهٔ NestJS) — ایمیج تک‌پروسه: API + SPA در یک پورت
#
# ── راه پیشنهادی: docker compose (اپ + PostgreSQL) ──
#   cp deploy/env.production.example .env      # مقادیر را پر کنید
#   docker compose up -d --build               # compose خودش DATABASE_URL داخلی را می‌سازد
#
# ── یا ایمیج خالی با دیتابیس بیرون از کانتینر ──
#   docker build --build-arg SITE_URL=https://nobino.ir \
#                --build-arg VITE_ROOT_DOMAIN=nobino.ir -t nobino .
#   docker run -p 3100:3100 --env-file deploy/env.docker.env nobino
#   ⚠️ قالب env.production.example مقادیر را «گیومه‌دار» می‌نویسد؛ `docker run
#   --env-file` برخلاف compose گیومه را حذف نمی‌کند و آن بخشی از مقدار می‌شود
#   (مoby#46773). برای این حالت فایل بدون گیومه بسازید:
#     sed -E 's/^([A-Z0-9_]+)="?([^"]*)"?\s*$/\1=\2/' deploy/env.production.example \
#       | grep -E '^[A-Z0-9_]+=' > deploy/env.docker.env
#   و پکیج‌های پیامک/درگاه را در همان فایل پر کنید.
# ─────────────────────────────────────────────────────────────────────

FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV npm_config_update_notifier=false

# فقط manifestها و lockfileها — تا لایهٔ نصب با تغییر کد دوباره ساخته نشود
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY backend/package.json backend/package-lock.json ./backend/
COPY frontend/package.json frontend/package-lock.json ./frontend/

# devDependencies هم نصب می‌شوند (prisma CLI، tsc، vite برای لایهٔ build لازم‌اند)
RUN npm ci --no-audit --no-fund \
 && cd backend && npm ci --no-audit --no-fund \
 && cd ../frontend && npm ci --no-audit --no-fund

FROM deps AS build
WORKDIR /app
# دامنهٔ بیلد: Vite از envDir ریشه می‌خواند و `.dockerignore` فایل‌های .env را
# بیرون می‌گذارد، پس این ARGها تنها راه رساندن VITE_* به بیلد SPA هستند (B5).
ARG SITE_URL=""
ARG VITE_ROOT_DOMAIN=""
ARG VITE_SITE_URL=""
ARG VITE_APP_URL=""
ENV SITE_URL=$SITE_URL \
    VITE_ROOT_DOMAIN=$VITE_ROOT_DOMAIN \
    VITE_SITE_URL=${VITE_SITE_URL:-$SITE_URL} \
    VITE_APP_URL=${VITE_APP_URL:-$SITE_URL}
# PRERENDER_API عمداً در این لایه ست نمی‌شود: بیلد باید مستقل از شبکه بماند. اگر آن
# را روی SITE_URL بگذاریم، `build-release --no-smoke` سایتِ زندهٔ قدیمی را صدا می‌زند و
# صفحات SEO با دادهٔ کهنه داخل ایمیج تازه می‌سوزد. prerender در لایهٔ runtime و بعد از
# بوت انجام می‌شود (PRERENDER_ON_BOOT=1) و از همان .env زنده دامنه را می‌گیرد.
COPY . .
# Prisma Client + بیلد بک‌اند و SPA (بدون smoke-test؛ دیتابیس در این مرحله نیست)
RUN node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma \
 && node scripts/build-release.mjs --skip-install --no-smoke \
 && npm prune --omit=dev --no-audit --no-fund --prefix backend

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3100 \
    HOST=0.0.0.0 \
    SERVE_FRONTEND=1 \
    DB_SETUP=auto \
    PRERENDER_ON_BOOT=1

# وابستگی‌های ریشه (Prisma Client/CLI) + بک‌اند؛ node_modules فرانت لازم نیست
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/package.json ./backend/
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./frontend/dist
# prerender.mjs در بوت (PRERENDER_ON_BOOT=1) لازم است؛ بدون آن paas-start
# ENOENT می‌گیرد و هیچ صفحهٔ سئویی ساخته نمی‌شود (B4)
COPY --from=build /app/frontend/prerender.mjs ./frontend/
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
# آپلودهای محلی (اگر BLOB_READ_WRITE_TOKEN نباشد اینجا نوشته می‌شوند)
COPY --from=build /app/public ./public

# کاربر غیرریشه + دسترسی نوشتن روی public/uploads
RUN groupadd --system --gid 1001 nobino \
 && useradd --system --uid 1001 --gid 1001 --home-dir /app --shell /usr/sbin/nologin nobino \
 && mkdir -p /app/public/uploads /app/public/voice \
 && chown -R nobino:nobino /app
USER nobino

EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=8s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# paas-start: آماده‌سازی دیتابیس + سرو API و SPA + prerender خلفی
CMD ["node", "scripts/paas-start.mjs"]
