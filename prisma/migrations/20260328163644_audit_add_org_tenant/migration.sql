-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "orgId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "tenantId" TEXT;

-- CreateIndex
CREATE INDEX "AuditLog_orgId_timestamp_idx" ON "AuditLog"("orgId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_timestamp_idx" ON "AuditLog"("tenantId", "timestamp");
