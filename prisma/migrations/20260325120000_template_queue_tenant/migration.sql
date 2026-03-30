-- SQLite: tenant для шаблонов и очередей
ALTER TABLE "Template" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default';

CREATE INDEX "Template_tenantId_idx" ON "Template"("tenantId");
CREATE INDEX "Template_tenantId_category_idx" ON "Template"("tenantId", "category");

ALTER TABLE "ScenarioQueue" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default';

CREATE INDEX "ScenarioQueue_tenantId_idx" ON "ScenarioQueue"("tenantId");
CREATE INDEX "ScenarioQueue_tenantId_status_idx" ON "ScenarioQueue"("tenantId", "status");
