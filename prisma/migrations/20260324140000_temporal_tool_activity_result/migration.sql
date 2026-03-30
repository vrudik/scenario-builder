-- CreateTable
CREATE TABLE "temporal_tool_activity_result" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dedupKey" TEXT NOT NULL,
    "businessExecutionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "activityKind" TEXT NOT NULL DEFAULT 'tool',
    "toolId" TEXT,
    "outputsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "temporal_tool_activity_result_dedupKey_key" ON "temporal_tool_activity_result"("dedupKey");
CREATE INDEX "temporal_tool_activity_result_businessExecutionId_idx" ON "temporal_tool_activity_result"("businessExecutionId");
