ALTER TABLE "Collection" ADD COLUMN "shape" TEXT NOT NULL DEFAULT 'circle';
ALTER TABLE "Bookmark" DROP COLUMN "shape";
