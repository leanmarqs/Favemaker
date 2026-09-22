-- Garante no máximo UMA coleção "Itens Salvos" por dono, mesmo sob corrida
-- (duplo clique / retry) — índice parcial, não dá pra expressar isso com
-- @@unique do Prisma sem restringir também as coleções normais (que podem
-- ser várias por dono).
CREATE UNIQUE INDEX "Collection_ownerId_isSavedItems_unique"
  ON "Collection"("ownerId")
  WHERE "isSavedItems" = true;
