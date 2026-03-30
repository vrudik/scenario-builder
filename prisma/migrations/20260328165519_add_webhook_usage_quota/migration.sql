-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "period" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "QuotaConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orgId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "limitVal" INTEGER NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'monthly',
    "action" TEXT NOT NULL DEFAULT 'warn',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "WebhookEndpoint_orgId_idx" ON "WebhookEndpoint"("orgId");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_active_idx" ON "WebhookEndpoint"("active");

-- CreateIndex
CREATE INDEX "UsageRecord_orgId_idx" ON "UsageRecord"("orgId");

-- CreateIndex
CREATE INDEX "UsageRecord_tenantId_idx" ON "UsageRecord"("tenantId");

-- CreateIndex
CREATE INDEX "UsageRecord_period_idx" ON "UsageRecord"("period");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_orgId_tenantId_period_metric_key" ON "UsageRecord"("orgId", "tenantId", "period", "metric");

-- CreateIndex
CREATE INDEX "QuotaConfig_orgId_idx" ON "QuotaConfig"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "QuotaConfig_orgId_metric_period_key" ON "QuotaConfig"("orgId", "metric", "period");
