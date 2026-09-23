-- AlterTable
ALTER TABLE "BookmarkGroup" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "savedFromCollectionId" TEXT;

-- CreateTable
CREATE TABLE "BookmarkSaveMark" (
    "ownerId" TEXT NOT NULL,
    "bookmarkId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookmarkSaveMark_pkey" PRIMARY KEY ("ownerId","bookmarkId")
);

-- CreateTable
CREATE TABLE "CommunityItemShare" (
    "ownerId" TEXT NOT NULL,
    "bookmarkId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityItemShare_pkey" PRIMARY KEY ("ownerId","bookmarkId")
);

-- CreateTable
CREATE TABLE "CommunityPostShare" (
    "ownerId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityPostShare_pkey" PRIMARY KEY ("ownerId","postId")
);

-- CreateTable
CREATE TABLE "CollectionRelevance" (
    "collectionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionRelevance_pkey" PRIMARY KEY ("collectionId")
);

-- CreateTable
CREATE TABLE "UserRelevance" (
    "ownerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRelevance_pkey" PRIMARY KEY ("ownerId")
);

-- CreateIndex
CREATE INDEX "BookmarkSaveMark_bookmarkId_idx" ON "BookmarkSaveMark"("bookmarkId");

-- CreateIndex
CREATE INDEX "CommunityItemShare_bookmarkId_idx" ON "CommunityItemShare"("bookmarkId");

-- CreateIndex
CREATE INDEX "CommunityPostShare_postId_idx" ON "CommunityPostShare"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_ownerId_savedFromCollectionId_key" ON "Collection"("ownerId", "savedFromCollectionId");

-- AddForeignKey
ALTER TABLE "BookmarkSaveMark" ADD CONSTRAINT "BookmarkSaveMark_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityItemShare" ADD CONSTRAINT "CommunityItemShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityPostShare" ADD CONSTRAINT "CommunityPostShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRelevance" ADD CONSTRAINT "UserRelevance_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

