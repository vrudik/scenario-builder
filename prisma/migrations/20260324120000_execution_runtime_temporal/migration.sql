-- AlterTable
ALTER TABLE "Execution" ADD COLUMN "runtimeKind" TEXT NOT NULL DEFAULT 'in_memory';
ALTER TABLE "Execution" ADD COLUMN "temporalRunId" TEXT;
ALTER TABLE "Execution" ADD COLUMN "temporalTaskQueue" TEXT;
ALTER TABLE "Execution" ADD COLUMN "temporalStatusName" TEXT;
ALTER TABLE "Execution" ADD COLUMN "temporalHistoryLength" INTEGER;
