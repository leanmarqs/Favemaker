-- AlterTable
ALTER TABLE "Owner" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;

-- Eventos de login órfãos (de contas já excluídas) carregam IP/navegador
-- sem necessidade — apagados aqui, já que a nova regra é apagar junto com a conta.
DELETE FROM "AuthEvent" WHERE "ownerId" IS NULL;

-- DropForeignKey
ALTER TABLE "AuthEvent" DROP CONSTRAINT "AuthEvent_ownerId_fkey";

-- AddForeignKey
ALTER TABLE "AuthEvent" ADD CONSTRAINT "AuthEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "AuthEvent_createdAt_idx" ON "AuthEvent"("createdAt");
