-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "spec" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "spec" TEXT NOT NULL,
    "scenarioId" TEXT,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Template_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "userId" TEXT,
    "userRoles" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentNodeId" TEXT,
    "traceId" TEXT,
    "spanId" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "errorMessage" TEXT,
    "errorCode" TEXT,
    CONSTRAINT "Execution_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExecutionEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "nodeId" TEXT,
    "data" TEXT,
    "metadata" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutionEvent_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NodeExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "input" TEXT,
    "output" TEXT,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "duration" INTEGER,
    CONSTRAINT "NodeExecution_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Compensation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "executedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Compensation_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tool" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "toolId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inputSchema" TEXT,
    "outputSchema" TEXT,
    "riskClass" TEXT NOT NULL DEFAULT 'safe',
    "sla" TEXT,
    "rateLimit" TEXT,
    "authRequired" BOOLEAN NOT NULL DEFAULT false,
    "authScopes" TEXT,
    "idempotent" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgentMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memoryType" TEXT NOT NULL,
    "executionId" TEXT,
    "scenarioId" TEXT,
    "content" TEXT NOT NULL,
    "embedding" TEXT,
    "metadata" TEXT,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Configuration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT
);

-- CreateTable
CREATE TABLE "Metric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "labels" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Scenario_status_idx" ON "Scenario"("status");

-- CreateIndex
CREATE INDEX "Scenario_createdAt_idx" ON "Scenario"("createdAt");

-- CreateIndex
CREATE INDEX "Template_category_idx" ON "Template"("category");

-- CreateIndex
CREATE INDEX "Template_name_idx" ON "Template"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Execution_executionId_key" ON "Execution"("executionId");

-- CreateIndex
CREATE INDEX "Execution_scenarioId_idx" ON "Execution"("scenarioId");

-- CreateIndex
CREATE INDEX "Execution_executionId_idx" ON "Execution"("executionId");

-- CreateIndex
CREATE INDEX "Execution_status_idx" ON "Execution"("status");

-- CreateIndex
CREATE INDEX "Execution_startedAt_idx" ON "Execution"("startedAt");

-- CreateIndex
CREATE INDEX "Execution_userId_idx" ON "Execution"("userId");

-- CreateIndex
CREATE INDEX "ExecutionEvent_executionId_idx" ON "ExecutionEvent"("executionId");

-- CreateIndex
CREATE INDEX "ExecutionEvent_type_idx" ON "ExecutionEvent"("type");

-- CreateIndex
CREATE INDEX "ExecutionEvent_timestamp_idx" ON "ExecutionEvent"("timestamp");

-- CreateIndex
CREATE INDEX "NodeExecution_executionId_idx" ON "NodeExecution"("executionId");

-- CreateIndex
CREATE INDEX "NodeExecution_nodeId_idx" ON "NodeExecution"("nodeId");

-- CreateIndex
CREATE INDEX "NodeExecution_state_idx" ON "NodeExecution"("state");

-- CreateIndex
CREATE UNIQUE INDEX "NodeExecution_executionId_nodeId_key" ON "NodeExecution"("executionId", "nodeId");

-- CreateIndex
CREATE INDEX "Compensation_executionId_idx" ON "Compensation"("executionId");

-- CreateIndex
CREATE INDEX "Compensation_status_idx" ON "Compensation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Tool_toolId_key" ON "Tool"("toolId");

-- CreateIndex
CREATE INDEX "Tool_toolId_idx" ON "Tool"("toolId");

-- CreateIndex
CREATE INDEX "Tool_riskClass_idx" ON "Tool"("riskClass");

-- CreateIndex
CREATE INDEX "AgentMemory_memoryType_idx" ON "AgentMemory"("memoryType");

-- CreateIndex
CREATE INDEX "AgentMemory_executionId_idx" ON "AgentMemory"("executionId");

-- CreateIndex
CREATE INDEX "AgentMemory_scenarioId_idx" ON "AgentMemory"("scenarioId");

-- CreateIndex
CREATE INDEX "AgentMemory_createdAt_idx" ON "AgentMemory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Configuration_key_key" ON "Configuration"("key");

-- CreateIndex
CREATE INDEX "Configuration_category_idx" ON "Configuration"("category");

-- CreateIndex
CREATE INDEX "Configuration_key_idx" ON "Configuration"("key");

-- CreateIndex
CREATE INDEX "Metric_name_idx" ON "Metric"("name");

-- CreateIndex
CREATE INDEX "Metric_timestamp_idx" ON "Metric"("timestamp");
