-- AlterTable
ALTER TABLE "ProjectSpec" ADD COLUMN "canvasSnapshotUrl" TEXT;
ALTER TABLE "ProjectSpec" ADD COLUMN "version" INTEGER;

-- Backfill version numbers based on creation order per project
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt" ASC) AS rn
  FROM "ProjectSpec"
)
UPDATE "ProjectSpec" p
SET "version" = ranked.rn
FROM ranked
WHERE p.id = ranked.id;

ALTER TABLE "ProjectSpec" ALTER COLUMN "version" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSpec_projectId_version_key" ON "ProjectSpec"("projectId", "version");
