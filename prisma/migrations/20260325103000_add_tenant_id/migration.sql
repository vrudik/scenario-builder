-- AlterTable
ALTER TABLE "Scenario" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default';

-- CreateIndex
CREATE INDEX "Scenario_tenantId_idx" ON "Scenario"("tenantId");

-- CreateIndex
CREATE INDEX "Scenario_tenantId_status_idx" ON "Scenario"("tenantId", "status");

-- AlterTable
ALTER TABLE "Execution" ADD COLUMN "tenantId" TEXT NOT NULL DEFAULT 'default';

-- CreateIndex
CREATE INDEX "Execution_tenantId_idx" ON "Execution"("tenantId");

-- CreateIndex
CREATE INDEX "Execution_tenantId_startedAt_idx" ON "Execution"("tenantId", "startedAt");
