-- Rebranding para Like My Links: a cor padrão de coleções/grupos/favoritos passa
-- do verde antigo (#b9ee78) para o roxo da nova identidade visual (#8b5cf6).
-- Só afeta o DEFAULT usado em novas linhas sem cor explícita; linhas existentes
-- não são alteradas.
ALTER TABLE "Collection" ALTER COLUMN "color" SET DEFAULT '#8b5cf6';
ALTER TABLE "BookmarkGroup" ALTER COLUMN "color" SET DEFAULT '#8b5cf6';
ALTER TABLE "Bookmark" ALTER COLUMN "color" SET DEFAULT '#8b5cf6';
