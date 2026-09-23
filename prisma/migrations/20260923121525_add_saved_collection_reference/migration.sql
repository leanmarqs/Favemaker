-- CreateTable
CREATE TABLE "SavedCollection" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "full" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedCollectionItem" (
    "savedCollectionId" TEXT NOT NULL,
    "bookmarkId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedCollectionItem_pkey" PRIMARY KEY ("savedCollectionId","bookmarkId")
);

-- CreateIndex
CREATE INDEX "SavedCollection_collectionId_idx" ON "SavedCollection"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedCollection_ownerId_collectionId_key" ON "SavedCollection"("ownerId", "collectionId");

-- CreateIndex
CREATE INDEX "SavedCollectionItem_bookmarkId_idx" ON "SavedCollectionItem"("bookmarkId");

-- AddForeignKey
ALTER TABLE "SavedCollection" ADD CONSTRAINT "SavedCollection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedCollection" ADD CONSTRAINT "SavedCollection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedCollectionItem" ADD CONSTRAINT "SavedCollectionItem_savedCollectionId_fkey" FOREIGN KEY ("savedCollectionId") REFERENCES "SavedCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedCollectionItem" ADD CONSTRAINT "SavedCollectionItem_bookmarkId_fkey" FOREIGN KEY ("bookmarkId") REFERENCES "Bookmark"("id") ON DELETE CASCADE ON UPDATE CASCADE;
