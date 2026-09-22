-- Preenche publishedAt pras coleções que já eram públicas ANTES da migration
-- anterior (add_collection_published_at) existir — sem isso, elas ficariam
-- com isPublic=true e publishedAt=null pra sempre, e por isso invisíveis pro
-- feed da Comunidade (GET /api/community/feed exige publishedAt IS NOT NULL).
-- createdAt é o melhor palpite disponível pra quando cada uma "deveria" ter
-- entrado no feed, já que não existe histórico de quando isPublic virou true.
UPDATE "Collection" SET "publishedAt" = "createdAt" WHERE "isPublic" = true AND "publishedAt" IS NULL;
