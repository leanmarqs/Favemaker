-- Favoritos deixam de ter visibilidade própria: sempre herdam isPublic da
-- coleção (ver comentário no schema.prisma, model Bookmark). Os valores
-- antigos desta coluna são descartados de propósito — a partir de agora,
-- "público" ou "privado" é decidido só pela coleção.
ALTER TABLE "Bookmark" DROP COLUMN "isPublic";
