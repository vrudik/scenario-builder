-- CreateTable
CREATE TABLE "ScenarioQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "maxConcurrency" INTEGER NOT NULL DEFAULT 10,
    "retryConfig" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "QueueTrigger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queueId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "filter" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QueueTrigger_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "ScenarioQueue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScenarioJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queueId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "input" TEXT,
    "output" TEXT,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "executionId" TEXT,
    "eventId" TEXT,
    "correlationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queuedAt" DATETIME,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    CONSTRAINT "ScenarioJob_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "ScenarioQueue" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScenarioJob_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ScenarioQueue_status_idx" ON "ScenarioQueue"("status");

-- CreateIndex
CREATE INDEX "ScenarioQueue_priority_idx" ON "ScenarioQueue"("priority");

-- CreateIndex
CREATE INDEX "ScenarioQueue_createdAt_idx" ON "ScenarioQueue"("createdAt");

-- CreateIndex
CREATE INDEX "QueueTrigger_queueId_idx" ON "QueueTrigger"("queueId");

-- CreateIndex
CREATE INDEX "QueueTrigger_eventType_idx" ON "QueueTrigger"("eventType");

-- CreateIndex
CREATE INDEX "QueueTrigger_topic_idx" ON "QueueTrigger"("topic");

-- CreateIndex
CREATE INDEX "QueueTrigger_enabled_idx" ON "QueueTrigger"("enabled");

-- CreateIndex
CREATE INDEX "ScenarioJob_queueId_idx" ON "ScenarioJob"("queueId");

-- CreateIndex
CREATE INDEX "ScenarioJob_scenarioId_idx" ON "ScenarioJob"("scenarioId");

-- CreateIndex
CREATE INDEX "ScenarioJob_status_idx" ON "ScenarioJob"("status");

-- CreateIndex
CREATE INDEX "ScenarioJob_priority_idx" ON "ScenarioJob"("priority");

-- CreateIndex
CREATE INDEX "ScenarioJob_createdAt_idx" ON "ScenarioJob"("createdAt");

-- CreateIndex
CREATE INDEX "ScenarioJob_eventId_idx" ON "ScenarioJob"("eventId");

-- CreateIndex
CREATE INDEX "ScenarioJob_correlationId_idx" ON "ScenarioJob"("correlationId");
