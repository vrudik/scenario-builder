# Образ с полным API (server.cjs + tsx для сценариев/оркестратора).
# Сборка: docker build -t scenario-builder .
# Запуск: см. docs/guides/CONTAINER_RUNBOOK.md

FROM node:20-bookworm-slim AS base

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Зависимости (включая dev: нужен tsx для server.cjs → *.ts API)
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .
RUN npx prisma generate
# CI Linux runners: avoid OOM during tsc on constrained memory
RUN NODE_OPTIONS=--max-old-space-size=6144 npm run build

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
# Переопределите при запуске; в контейнере — отдельный файл в томе
ENV DATABASE_URL=file:/app/data/dev.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=50s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["sh", "-c", "npx prisma migrate deploy && node server.cjs"]
