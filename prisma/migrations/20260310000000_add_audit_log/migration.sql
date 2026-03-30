-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "resource" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'success',
    "severity" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT,
    "details" TEXT,
    "traceId" TEXT,
    "spanId" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_actor_idx" ON "AuditLog"("actor");
CREATE INDEX "AuditLog_resource_idx" ON "AuditLog"("resource");
CREATE INDEX "AuditLog_outcome_idx" ON "AuditLog"("outcome");
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
