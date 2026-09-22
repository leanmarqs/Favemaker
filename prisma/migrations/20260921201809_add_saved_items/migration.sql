-- AlterTable
ALTER TABLE "Bookmark" ADD COLUMN     "savedFromId" TEXT;

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "isSavedItems" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_collectionId_savedFromId_key" ON "Bookmark"("collectionId", "savedFromId");

