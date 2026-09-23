-- AlterTable
ALTER TABLE "BookmarkGroup" ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "BookmarkGroup_parentId_idx" ON "BookmarkGroup"("parentId");

-- AddForeignKey
ALTER TABLE "BookmarkGroup" ADD CONSTRAINT "BookmarkGroup_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "BookmarkGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
