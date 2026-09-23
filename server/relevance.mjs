// Relevância global de links, coleções e usuários (ver models LinkRelevance,
// CollectionRelevance, UserRelevance no schema.prisma) — pontuação interna
// que nunca é devolvida em nenhuma resposta da API. Só alimenta decisões
// futuras do próprio sistema (recomendação, destaque na aba Descobrir), por
// isso fica isolada em tabelas próprias em vez de virar mais um campo
// serializado junto do favorito/coleção/conta.
//
// Pesos: uma cópia de verdade (link ou coleção) pro "Itens Salvos"/"Suas
// coleções" de outro dono é o sinal mais forte de interesse — o visitante
// decidiu manter aquilo na própria conta. Comentar é o segundo mais forte
// (exige esforço de verdade). Curtir/salvar um item dentro do feed da
// Comunidade é mais leve, um clique só. Compartilhar (copiar link) é o mais
// leve de todos: nenhuma garantia de que o link foi de fato repassado.
// Seguir usa o mesmo peso de curtir pra relevância do USUÁRIO (não existe
// "curtir uma conta").
export const RELEVANCE_WEIGHT = {
  copy: 3,
  comment: 2,
  communityLike: 1,
  communitySave: 2,
  share: 1,
  follow: 1,
};

async function bump(prisma, model, idField, id, weight) {
  if (!id || !weight) return;
  await prisma[model].upsert({
    where: { [idField]: id },
    update: { score: { increment: weight } },
    create: { [idField]: id, score: Math.max(weight, 0) },
  });
}

// bookmarkId/collectionId podem não corresponder a nenhuma linha real (ex:
// ids fixos de publicação/favorito fictício do communityMock.ts) — upsert
// sem depender de o original existir, igual ao precedente de
// CommunityItemLike/Save, que também não têm chave estrangeira pra
// Bookmark/Collection.
export const bumpRelevance = (prisma, bookmarkId, weight) =>
  bump(prisma, "linkRelevance", "bookmarkId", bookmarkId, weight);
export const bumpCollectionRelevance = (prisma, collectionId, weight) =>
  bump(prisma, "collectionRelevance", "collectionId", collectionId, weight);
// Diferente das duas acima, ownerId aqui sempre corresponde a uma conta de
// verdade (ver comentário no schema.prisma) — ainda assim upsert, porque
// nem todo dono tem uma linha em UserRelevance até a primeira interação
// alheia com algo dele.
export const bumpUserRelevance = (prisma, ownerId, weight) =>
  bump(prisma, "userRelevance", "ownerId", ownerId, weight);

// Donos de verdade por trás de um link/coleção/conta — usados pra (1) nunca
// deixar o próprio dono inflar a relevância do próprio conteúdo (comparado
// contra req.owner.id em cada rota que bumpa relevância) e (2) creditar a
// relevância do USUÁRIO dono do conteúdo afetado, não de quem clicou. Todas
// devolvem null quando o alvo não corresponde a nada real (ex: mock do
// communityMock.ts) — nesse caso não há dono real pra proteger nem creditar,
// então as rotas simplesmente pulam as duas coisas.
export async function resolveBookmarkOwner(prisma, bookmarkId) {
  const bookmark = await prisma.bookmark.findUnique({
    where: { id: bookmarkId },
    select: { collection: { select: { ownerId: true } } },
  });
  return bookmark?.collection?.ownerId ?? null;
}
export async function resolveCollectionOwner(prisma, collectionId) {
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { ownerId: true },
  });
  return collection?.ownerId ?? null;
}
export async function realOwnerId(prisma, ownerId) {
  const owner = await prisma.owner.findUnique({ where: { id: ownerId }, select: { id: true } });
  return owner ? owner.id : null;
}

// Credita relevância do link/coleção e do dono dele de uma vez, só quando
// quem agiu (actingOwnerId) não é o próprio dono do alvo (targetOwnerId) —
// o coração/o "Salvar"/o comentário/o compartilhamento da própria pessoa em
// cima do próprio conteúdo nunca deve inflar nada, mesmo que a interação em
// si (curtir/salvar) continue sendo registrada normalmente pro filtro
// pessoal de "itens curtidos"/"itens salvos" de quem clicou.
export async function creditRelevance(prisma, { actingOwnerId, targetOwnerId, bumpTarget, targetId, weight }) {
  if (!targetOwnerId || targetOwnerId === actingOwnerId) return;
  if (bumpTarget) await bumpTarget(prisma, targetId, weight);
  await bumpUserRelevance(prisma, targetOwnerId, weight);
}
