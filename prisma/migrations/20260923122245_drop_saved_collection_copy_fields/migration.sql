-- DropIndex
DROP INDEX "Bookmark_collectionId_savedFromId_key";

-- DropIndex
DROP INDEX "Collection_ownerId_savedFromCollectionId_key";

-- AlterTable
ALTER TABLE "Bookmark" DROP COLUMN "savedFromId";

-- AlterTable
ALTER TABLE "Collection" DROP COLUMN "isSavedItems",
DROP COLUMN "savedFromAuthorId",
DROP COLUMN "savedFromAuthorName",
DROP COLUMN "savedFromCollectionId";

