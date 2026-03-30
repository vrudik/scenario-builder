-- AlterTable: Add scenarioId column to QueueTrigger
ALTER TABLE "QueueTrigger" ADD COLUMN "scenarioId" TEXT;

-- CreateIndex: Add index for scenarioId
CREATE INDEX "QueueTrigger_scenarioId_idx" ON "QueueTrigger"("scenarioId");

-- AddForeignKey: Add foreign key constraint for scenarioId
-- SQLite doesn't support adding foreign keys to existing tables, so we recreate the table
CREATE TABLE "new_QueueTrigger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queueId" TEXT NOT NULL,
    "scenarioId" TEXT,
    "eventType" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "filter" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QueueTrigger_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "ScenarioQueue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QueueTrigger_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Copy existing data
INSERT INTO "new_QueueTrigger" ("id", "queueId", "eventType", "topic", "filter", "enabled", "createdAt", "updatedAt")
SELECT "id", "queueId", "eventType", "topic", "filter", "enabled", "createdAt", "updatedAt" FROM "QueueTrigger";

-- Drop old table
DROP TABLE "QueueTrigger";

-- Rename new table
ALTER TABLE "new_QueueTrigger" RENAME TO "QueueTrigger";

-- Recreate indexes
CREATE INDEX "QueueTrigger_queueId_idx" ON "QueueTrigger"("queueId");
CREATE INDEX "QueueTrigger_scenarioId_idx" ON "QueueTrigger"("scenarioId");
CREATE INDEX "QueueTrigger_eventType_idx" ON "QueueTrigger"("eventType");
CREATE INDEX "QueueTrigger_topic_idx" ON "QueueTrigger"("topic");
CREATE INDEX "QueueTrigger_enabled_idx" ON "QueueTrigger"("enabled");
