-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '#b9ee78',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "favicon" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT '#b9ee78',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Owner_tokenHash_key" ON "Owner"("tokenHash");

-- CreateIndex
CREATE INDEX "Collection_ownerId_idx" ON "Collection"("ownerId");

-- CreateIndex
CREATE INDEX "Bookmark_collectionId_idx" ON "Bookmark"("collectionId");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
