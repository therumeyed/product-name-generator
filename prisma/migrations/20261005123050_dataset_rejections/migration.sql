-- DropIndex
DROP INDEX "Keyword_trgm_idx";

-- CreateTable
CREATE TABLE "DatasetRejection" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "keyword" TEXT,
    "reason" TEXT NOT NULL,
    "raw" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "DatasetRejection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DatasetRejection_datasetId_idx" ON "DatasetRejection"("datasetId");

-- AddForeignKey
ALTER TABLE "DatasetRejection" ADD CONSTRAINT "DatasetRejection_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "KeywordDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
