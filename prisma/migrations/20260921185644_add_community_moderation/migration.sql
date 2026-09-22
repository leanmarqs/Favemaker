-- CreateTable
CREATE TABLE "CommunityCommentReport" (
    "ownerId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityCommentReport_pkey" PRIMARY KEY ("ownerId","commentId")
);

-- CreateTable
CREATE TABLE "CommunityBlock" (
    "ownerId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityBlock_pkey" PRIMARY KEY ("ownerId","authorId")
);

-- CreateIndex
CREATE INDEX "CommunityCommentReport_commentId_idx" ON "CommunityCommentReport"("commentId");

-- AddForeignKey
ALTER TABLE "CommunityCommentReport" ADD CONSTRAINT "CommunityCommentReport_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityBlock" ADD CONSTRAINT "CommunityBlock_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
