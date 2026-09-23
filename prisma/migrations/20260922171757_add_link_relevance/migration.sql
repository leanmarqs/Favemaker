-- CreateTable
CREATE TABLE "LinkRelevance" (
    "bookmarkId" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkRelevance_pkey" PRIMARY KEY ("bookmarkId")
);
