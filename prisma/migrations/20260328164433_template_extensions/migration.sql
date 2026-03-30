-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "spec" TEXT NOT NULL,
    "scenarioId" TEXT,
    "tags" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "difficulty" TEXT NOT NULL DEFAULT 'beginner',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "mockConfig" TEXT,
    "guide" TEXT,
    "tenantId" TEXT NOT NULL DEFAULT 'default',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Template_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Template" ("category", "createdAt", "description", "id", "name", "scenarioId", "spec", "tags", "tenantId", "updatedAt") SELECT "category", "createdAt", "description", "id", "name", "scenarioId", "spec", "tags", "tenantId", "updatedAt" FROM "Template";
DROP TABLE "Template";
ALTER TABLE "new_Template" RENAME TO "Template";
CREATE INDEX "Template_category_idx" ON "Template"("category");
CREATE INDEX "Template_name_idx" ON "Template"("name");
CREATE INDEX "Template_tenantId_idx" ON "Template"("tenantId");
CREATE INDEX "Template_tenantId_category_idx" ON "Template"("tenantId", "category");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
