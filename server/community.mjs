// Rotas da aba Comunidade — ver comentário no schema.prisma (models
// CommunityPostLike, CommunityComment, etc.). As publicações continuam fixas
// no frontend (communityMock.ts); só as interações de cada dono real (curtir,
// salvar, comentar) precisam de banco, pra sobreviver a troca de navegador ou
// dispositivo — instalada depois de installAuth em index.mjs, então toda
// rota aqui já exige sessão válida (req.owner) e passa pelo rate limit geral.
//
// A caixa de comentário em si tem suas próprias defesas, além do rate limit
// geral da API e da checagem de Origin (CSRF) já aplicados a todo /api:
// - sanitização de texto (remove caracteres de controle/largura-zero usados
//   pra burlar filtros ou pra phishing visual, e "achata" espaço/linha em
//   excesso usados pra inundar o feed visualmente);
// - bloqueio de padrão de spam (link em excesso, caractere repetido em flood);
// - limite de comentários por minuto por dono (bem mais apertado que o limite
//   geral da API, que existe pra outra coisa);
// - bloqueio de comentário duplicado (o mesmo texto, no mesmo post, em
//   sequência rápida — double-post/bot simples);
// - denúncia com ocultação automática após algumas denúncias de donos
//   distintos, sem precisar de fila de moderação humana;
// - bloquear autor (os comentários dele somem só pra quem bloqueou);
// - exclusão restrita ao próprio autor.
// Já a renderização em si (texto do comentário como nó de texto do React, não
// como HTML) e a validação de entrada de usuário (Prisma parametrizado) já
// fecham XSS/SQL injection sem precisar de nada extra aqui.
//
// O menu "⋮" da PUBLICAÇÃO (cartão de perfil ao passar o mouse no nome do
// autor, ou o menu do post — ver Community.tsx) reaproveita o mesmo bloqueio
// de autor acima (agora também escondendo a publicação, não só os
// comentários dele) e ganha sua própria denúncia com ocultação automática
// (CommunityPostReport), além de "seguir" (puramente informativo, alimenta a
// contagem de seguidores do cartão) e "sobre esta conta" (data de criação da
// conta de verdade por trás, quando existe).
import {
  bumpRelevance,
  bumpCollectionRelevance,
  resolveBookmarkOwner,
  resolveCollectionOwner,
  realOwnerId,
  creditRelevance,
  RELEVANCE_WEIGHT,
} from "./relevance.mjs";
const MAX_COMMENT_LENGTH = 500;
const MAX_URLS_PER_COMMENT = 2;
const COMMENT_RATE_LIMIT = 5;
const COMMENT_RATE_WINDOW = 60000;
const DUPLICATE_COOLDOWN = 30000;
const COMMENT_REPORT_HIDE_THRESHOLD = 3;
const POST_REPORT_HIDE_THRESHOLD = 3;
function validId(value, label) {
  if (typeof value !== "string" || !value.trim() || value.length > 80)
    throw Object.assign(new Error(`${label} inválido.`), { status: 400 });
  return value;
}
// Caracteres de controle e "largura zero"/formatação bidirecional (usados pra
// burlar filtro de palavras ou pra ataques de phishing visual, ex: RTL
// override disfarçando uma extensão de arquivo) somem por completo; sequências
// longas de espaço/quebra de linha "achatam" — sem isso, um comentário dentro
// do limite de caracteres ainda podia inundar o feed visualmente (ex: 50
// linhas em branco antes do texto de verdade).
function sanitizeCommentText(raw) {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F​-‏‪-‮﻿]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{3,}/g, "  ")
    .trim();
}
// Padrões comuns de spam: link em excesso (a maioria dos bots de comentário
// existe pra isso) e um único caractere repetido dezenas de vezes (flood
// visual que passa despercebido por um limite de tamanho normal).
function hasSpamPattern(text) {
  const urlCount = (text.match(/https?:\/\//gi) || []).length;
  if (urlCount > MAX_URLS_PER_COMMENT) return true;
  if (/(.)\1{29,}/.test(text)) return true;
  return false;
}
const publicAuthor = (owner) => ({
  id: owner.id,
  name: owner.displayName || owner.username || "Usuário",
  username: owner.username || "",
  avatar: owner.avatar || "",
});
const asComment = (comment) => ({
  id: comment.id,
  postId: comment.postId,
  author: publicAuthor(comment.owner),
  text: comment.text,
  createdAt: comment.createdAt,
});
// Filtro de grupos visíveis fora da conta do dono (perfil público, feed da
// Comunidade, itens salvos): o próprio grupo precisa ser público e, se for
// um agrupamento dentro de uma seção (parentId), a seção também — senão uma
// seção privada vazaria pelos agrupamentos de dentro dela.
export const publicGroupWhere = {
  isPublic: true,
  OR: [{ parentId: null }, { parent: { isPublic: true } }],
};
export function installCommunity(app, prisma) {
  // Limite de comentários por minuto por dono — bem mais apertado que o
  // limite geral de 300 req/min da API (ver apiLimits em index.mjs), que
  // cobre abuso genérico, não spam de comentário especificamente.
  const commentRate = new Map();
  const rateCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of commentRate)
      if (now - entry.start > COMMENT_RATE_WINDOW) commentRate.delete(key);
  }, COMMENT_RATE_WINDOW);
  rateCleanup.unref();
  function withinCommentRate(ownerId) {
    const now = Date.now();
    const entry = commentRate.get(ownerId) || { start: now, count: 0 };
    if (now - entry.start > COMMENT_RATE_WINDOW) {
      entry.start = now;
      entry.count = 0;
    }
    entry.count++;
    commentRate.set(ownerId, entry);
    return entry.count <= COMMENT_RATE_LIMIT;
  }
  app.get("/api/community/state", async (req, res) => {
    const ownerId = req.owner.id;
    const [
      postLikes,
      postSaves,
      itemLikes,
      itemSaves,
      commentLikes,
      commentSaves,
      comments,
      myCommentReports,
      myPostReports,
      myBlocks,
      myFollows,
      hiddenCommentGroups,
      hiddenPostGroups,
    ] = await Promise.all([
      prisma.communityPostLike.findMany({ where: { ownerId }, select: { postId: true } }),
      prisma.communityPostSave.findMany({ where: { ownerId }, select: { postId: true } }),
      prisma.communityItemLike.findMany({ where: { ownerId }, select: { bookmarkId: true } }),
      prisma.communityItemSave.findMany({ where: { ownerId }, select: { bookmarkId: true } }),
      prisma.communityCommentLike.findMany({ where: { ownerId }, select: { commentId: true } }),
      prisma.communityCommentSave.findMany({ where: { ownerId }, select: { commentId: true } }),
      prisma.communityComment.findMany({
        orderBy: { createdAt: "asc" },
        include: { owner: true },
      }),
      prisma.communityCommentReport.findMany({ where: { ownerId }, select: { commentId: true } }),
      prisma.communityPostReport.findMany({ where: { ownerId }, select: { postId: true } }),
      prisma.communityBlock.findMany({ where: { ownerId }, select: { authorId: true } }),
      prisma.communityFollow.findMany({ where: { ownerId }, select: { authorId: true } }),
      prisma.communityCommentReport.groupBy({
        by: ["commentId"],
        _count: { ownerId: true },
        having: { ownerId: { _count: { gte: COMMENT_REPORT_HIDE_THRESHOLD } } },
      }),
      prisma.communityPostReport.groupBy({
        by: ["postId"],
        _count: { ownerId: true },
        having: { ownerId: { _count: { gte: POST_REPORT_HIDE_THRESHOLD } } },
      }),
    ]);
    const commentsByPost = {};
    for (const comment of comments)
      (commentsByPost[comment.postId] ??= []).push(asComment(comment));
    res.json({
      likedPostIds: postLikes.map((r) => r.postId),
      savedPostIds: postSaves.map((r) => r.postId),
      likedItemIds: itemLikes.map((r) => r.bookmarkId),
      savedItemIds: itemSaves.map((r) => r.bookmarkId),
      likedCommentIds: commentLikes.map((r) => r.commentId),
      savedCommentIds: commentSaves.map((r) => r.commentId),
      comments: commentsByPost,
      reportedCommentIds: myCommentReports.map((r) => r.commentId),
      reportedPostIds: myPostReports.map((r) => r.postId),
      blockedAuthorIds: myBlocks.map((b) => b.authorId),
      followedAuthorIds: myFollows.map((f) => f.authorId),
      // Ocultação vale pra qualquer dono, inclusive o próprio autor do
      // conteúdo e quem já denunciou — simplifica bastante, e conteúdo que
      // recebeu denúncia de gente distinta o suficiente não é o tipo de coisa
      // que precisa de exceção pro autor ver "como os outros veem".
      hiddenCommentIds: hiddenCommentGroups.map((g) => g.commentId),
      hiddenPostIds: hiddenPostGroups.map((g) => g.postId),
    });
  });
  // Dados completos dos favoritos ALHEIOS que o dono curtiu (CommunityItemLike),
  // pro filtro "Com gostei" de "Suas coleções" conseguir mostrá-los mesmo sem
  // uma cópia própria — curtir nunca copia nada (diferente de favoritar, que
  // sempre cria a cópia em "Itens Salvos"), então sem esta rota o filtro só
  // via os curtidos que por acaso já eram (ou vieram a ser) do próprio dono.
  // Exclui bookmarks do PRÓPRIO dono (já aparecem via "Suas coleções" direto,
  // sem precisar duplicar aqui) e qualquer um que tenha deixado de ser
  // público nesse meio-tempo (a curtida continua registrada, só some do
  // filtro até o autor publicar de novo).
  app.get("/api/community/items/liked", async (req, res) => {
    const ownerId = req.owner.id;
    const likes = await prisma.communityItemLike.findMany({
      where: { ownerId },
      select: { bookmarkId: true },
    });
    const ids = likes.map((l) => l.bookmarkId);
    if (!ids.length) return res.json({ items: [] });
    const bookmarks = await prisma.bookmark.findMany({
      where: {
        id: { in: ids },
        collection: { isPublic: true, ownerId: { not: ownerId } },
        OR: [{ groupId: null }, { group: { isPublic: true } }],
      },
      include: { collection: { select: { isPublic: true } } },
    });
    res.json({
      items: bookmarks.map(({ collection, ...b }) => ({ ...b, isPublic: collection.isPublic })),
    });
  });
  // Todos os favoritos (com ou sem grupo) de uma coleção de verdade — usada
  // tanto pra "curtir a publicação inteira marca todos os itens como
  // curtidos" quanto pra copiar uma coleção alheia inteira ao salvá-la (ver
  // rotas de like/save de publicação abaixo). null quando postId não
  // corresponde a nenhuma Collection real (publicação fictícia do
  // communityMock.ts) — nesse caso não há o que espalhar.
  async function collectionWithItems(postId) {
    return prisma.collection.findUnique({
      where: { id: postId },
      include: { bookmarks: true, groups: true },
    });
  }
  // Cada botão de curtir/salvar é um único POST que inverte o próprio estado
  // (existe → apaga, não existe → cria) — o cliente decide o rótulo mostrado
  // a partir da resposta, sem precisar de PUT/DELETE separados pra cada ação.
  // A interação em si (existir ou não a linha) é sempre registrada, mesmo
  // sobre o próprio conteúdo do dono — é o que alimenta o filtro pessoal de
  // "itens curtidos"/"itens salvos" dele. relevance (opcional) é só quem
  // decide se isso também deve virar pontos de relevância: resolveOwner acha
  // o dono de verdade do alvo (ou do próprio alvo, no caso de "seguir"), e
  // creditRelevance() recusa o crédito quando esse dono é quem clicou —
  // ninguém aumenta a própria relevância curtindo/salvando/seguindo o próprio
  // conteúdo (ver server/relevance.mjs).
  function toggleRoute(path, param, model, idField, relevance) {
    app.post(path, async (req, res) => {
      const ownerId = req.owner.id;
      const id = validId(req.params[param], param);
      const where = { [`ownerId_${idField}`]: { ownerId, [idField]: id } };
      const existing = await prisma[model].findUnique({ where });
      const sign = existing ? -1 : 1;
      if (existing) await prisma[model].delete({ where });
      else await prisma[model].create({ data: { ownerId, [idField]: id } });
      if (relevance) {
        const targetOwnerId = await relevance.resolveOwner(prisma, id);
        await creditRelevance(prisma, {
          actingOwnerId: ownerId,
          targetOwnerId,
          bumpTarget: relevance.bumpTarget,
          targetId: id,
          weight: sign * relevance.weight,
        });
      }
      res.json({ active: sign === 1 });
    });
  }
  toggleRoute("/api/community/items/:bookmarkId/like", "bookmarkId", "communityItemLike", "bookmarkId", {
    weight: RELEVANCE_WEIGHT.communityLike,
    resolveOwner: resolveBookmarkOwner,
    bumpTarget: bumpRelevance,
  });
  toggleRoute("/api/community/items/:bookmarkId/save", "bookmarkId", "communityItemSave", "bookmarkId", {
    weight: RELEVANCE_WEIGHT.communitySave,
    resolveOwner: resolveBookmarkOwner,
    bumpTarget: bumpRelevance,
  });
  toggleRoute("/api/community/comments/:commentId/like", "commentId", "communityCommentLike", "commentId");
  toggleRoute("/api/community/comments/:commentId/save", "commentId", "communityCommentSave", "commentId");
  toggleRoute("/api/community/users/:authorId/follow", "authorId", "communityFollow", "authorId", {
    weight: RELEVANCE_WEIGHT.follow,
    resolveOwner: realOwnerId,
    bumpTarget: null,
  });
  // Curtir a PUBLICAÇÃO inteira marca todos os favoritos dela como curtidos
  // também (ver CommunityItemLike acima) — descurtir desfaz os dois ao mesmo
  // tempo. Vale pra coleção própria ou alheia (só a relevância distingue os
  // dois casos, via creditRelevance). Não usa toggleRoute genérico porque
  // precisa desse espalhamento extra pros itens.
  app.post("/api/community/posts/:postId/like", async (req, res) => {
    const ownerId = req.owner.id;
    const postId = validId(req.params.postId, "postId");
    const where = { ownerId_postId: { ownerId, postId } };
    const existing = await prisma.communityPostLike.findUnique({ where });
    const sign = existing ? -1 : 1;
    if (existing) await prisma.communityPostLike.delete({ where });
    else await prisma.communityPostLike.create({ data: { ownerId, postId } });
    const targetOwnerId = await resolveCollectionOwner(prisma, postId);
    await creditRelevance(prisma, {
      actingOwnerId: ownerId,
      targetOwnerId,
      bumpTarget: bumpCollectionRelevance,
      targetId: postId,
      weight: sign * RELEVANCE_WEIGHT.communityLike,
    });
    const collection = await collectionWithItems(postId);
    if (collection) {
      for (const bookmark of collection.bookmarks) {
        const itemWhere = { ownerId_bookmarkId: { ownerId, bookmarkId: bookmark.id } };
        if (sign === 1) {
          await prisma.communityItemLike.upsert({ where: itemWhere, update: {}, create: { ownerId, bookmarkId: bookmark.id } });
        } else {
          await prisma.communityItemLike.deleteMany({ where: { ownerId, bookmarkId: bookmark.id } });
        }
        await creditRelevance(prisma, {
          actingOwnerId: ownerId,
          targetOwnerId,
          bumpTarget: bumpRelevance,
          targetId: bookmark.id,
          weight: sign * RELEVANCE_WEIGHT.communityLike,
        });
      }
    }
    res.json({ active: sign === 1 });
  });
  // Salva a PUBLICAÇÃO (coleção) inteira:
  // - coleção ALHEIA: liga/desliga uma REFERÊNCIA "cheia" (SavedCollection.full
  //   = true) pra ela na aba "Itens Salvos" do visitante (ver GET
  //   /api/saved-collections em server/index.mjs) — nunca uma cópia, então os
  //   dados mostrados lá sempre acompanham a coleção original ao vivo, e o
  //   visitante não pode editá-la. Desfazer o "Salvar" da publicação inteira
  //   rebaixa a referência de volta pra parcial (full = false) em vez de
  //   apagá-la, quando ainda sobra algum link salvo avulso dela (ver POST
  //   /api/saved-items/:sourceId) — só apaga de vez se não sobrar nenhum.
  // - coleção PRÓPRIA (o dono vendo sua própria publicação no feed): não cria
  //   referência nenhuma, só marca cada favorito dela como salvo (mesmo
  //   mecanismo de BookmarkSaveMark usado por "favoritar o próprio link" —
  //   ver POST /api/saved-items/:sourceId), pra aparecer na filtragem de
  //   itens salvos.
  // Sem referência possível pra publicação fictícia (postId não corresponde a
  // nenhuma Collection real): a interação ainda fica registrada (pro
  // coração acender), só não há o que referenciar.
  app.post("/api/community/posts/:postId/save", async (req, res) => {
    const ownerId = req.owner.id;
    const postId = validId(req.params.postId, "postId");
    const where = { ownerId_postId: { ownerId, postId } };
    const existing = await prisma.communityPostSave.findUnique({ where });
    const sign = existing ? -1 : 1;
    if (existing) await prisma.communityPostSave.delete({ where });
    else await prisma.communityPostSave.create({ data: { ownerId, postId } });
    const targetOwnerId = await resolveCollectionOwner(prisma, postId);
    await creditRelevance(prisma, {
      actingOwnerId: ownerId,
      targetOwnerId,
      bumpTarget: bumpCollectionRelevance,
      targetId: postId,
      weight: sign * RELEVANCE_WEIGHT.communitySave,
    });
    if (targetOwnerId === ownerId) {
      // Coleção própria: marca/desmarca cada favorito como salvo, sem copiar.
      const collection = await collectionWithItems(postId);
      if (collection) {
        if (sign === 1) {
          await prisma.bookmarkSaveMark.createMany({
            data: collection.bookmarks.map((b) => ({ ownerId, bookmarkId: b.id })),
            skipDuplicates: true,
          });
        } else {
          await prisma.bookmarkSaveMark.deleteMany({
            where: { ownerId, bookmarkId: { in: collection.bookmarks.map((b) => b.id) } },
          });
        }
      }
      return res.status(sign === 1 ? 201 : 200).json({ active: sign === 1 });
    }
    if (sign === -1) {
      const saved = await prisma.savedCollection.findUnique({
        where: { ownerId_collectionId: { ownerId, collectionId: postId } },
      });
      if (saved) {
        const itemCount = await prisma.savedCollectionItem.count({
          where: { savedCollectionId: saved.id },
        });
        if (itemCount) await prisma.savedCollection.update({ where: { id: saved.id }, data: { full: false } });
        else await prisma.savedCollection.delete({ where: { id: saved.id } });
      }
      return res.json({ active: false });
    }
    const source = await prisma.collection.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (source) {
      await prisma.savedCollection.upsert({
        where: { ownerId_collectionId: { ownerId, collectionId: postId } },
        update: { full: true },
        create: { ownerId, collectionId: postId, full: true },
      });
    }
    res.status(201).json({ active: true });
  });
  // Compartilhar (copiar link) uma publicação ou um item específico — no
  // máximo um registro por dono (ver CommunityPostShare/CommunityItemShare
  // no schema.prisma), só pra contar quantas pessoas distintas
  // compartilharam e alimentar a relevância uma única vez por dono; cliques
  // repetidos continuam copiando o link normalmente, só não pontuam de novo.
  app.post("/api/community/posts/:postId/share", async (req, res) => {
    const ownerId = req.owner.id;
    const postId = validId(req.params.postId, "postId");
    let created = true;
    try {
      await prisma.communityPostShare.create({ data: { ownerId, postId } });
    } catch (e) {
      if (e.code !== "P2002") throw e;
      created = false;
    }
    if (created) {
      const targetOwnerId = await resolveCollectionOwner(prisma, postId);
      await creditRelevance(prisma, {
        actingOwnerId: ownerId,
        targetOwnerId,
        bumpTarget: bumpCollectionRelevance,
        targetId: postId,
        weight: RELEVANCE_WEIGHT.share,
      });
    }
    const shareCount = await prisma.communityPostShare.count({ where: { postId } });
    res.json({ shared: true, shareCount });
  });
  app.post("/api/community/items/:bookmarkId/share", async (req, res) => {
    const ownerId = req.owner.id;
    const bookmarkId = validId(req.params.bookmarkId, "bookmarkId");
    let created = true;
    try {
      await prisma.communityItemShare.create({ data: { ownerId, bookmarkId } });
    } catch (e) {
      if (e.code !== "P2002") throw e;
      created = false;
    }
    if (created) {
      const targetOwnerId = await resolveBookmarkOwner(prisma, bookmarkId);
      await creditRelevance(prisma, {
        actingOwnerId: ownerId,
        targetOwnerId,
        bumpTarget: bumpRelevance,
        targetId: bookmarkId,
        weight: RELEVANCE_WEIGHT.share,
      });
    }
    const shareCount = await prisma.communityItemShare.count({ where: { bookmarkId } });
    res.json({ shared: true, shareCount });
  });
  // Cartão de perfil (hover no nome do autor) e o painel "Sobre esta conta"
  // do menu "⋮" da publicação usam o mesmo endpoint: nº de seguidores/seguindo
  // é sempre real (ver CommunityFollow); memberSince só existe pra autor com
  // conta de verdade por trás (os autores fictícios do communityMock.ts não
  // têm Owner correspondente, então o cliente mostra um aviso de demonstração
  // nesse caso). Buscado sob demanda (ao abrir o cartão/painel), não numa
  // lista antecipada pra cada publicação do feed.
  app.get("/api/community/users/:authorId", async (req, res) => {
    const authorId = validId(req.params.authorId, "authorId");
    const [followerCount, followingCount, postCount, owner] = await Promise.all([
      prisma.communityFollow.count({ where: { authorId } }),
      prisma.communityFollow.count({ where: { ownerId: authorId } }),
      prisma.collection.count({ where: { ownerId: authorId, isPublic: true } }),
      prisma.owner.findUnique({ where: { id: authorId }, select: { createdAt: true } }),
    ]);
    res.json({ followerCount, followingCount, postCount, memberSince: owner ? owner.createdAt : null });
  });
  // Feed da aba Comunidade: coleções públicas de donos de verdade, mais
  // recentes primeiro por publishedAt (quando a coleção virou pública, não
  // quando foi criada — ver comentário no schema.prisma). O id da própria
  // coleção vira o postId usado em curtir/salvar/comentar/denunciar acima —
  // sem tabela de "posts" separada, a coleção pública JÁ É a publicação.
  // Sem "where: isPublic" nos favoritos SEM grupo: um favorito solto não tem
  // visibilidade própria (ver comentário no schema.prisma) — herda direto da
  // coleção já filtrada acima como pública. Já os GRUPOS (seções e
  // agrupamentos) têm seu próprio isPublic (ver comentário em BookmarkGroup
  // no schema.prisma) — "where: isPublic" neles é o que permite uma coleção
  // pública conter seções/agrupamentos privados: eles (e os favoritos lá
  // dentro, que só existem aninhados no include abaixo) simplesmente não
  // entram na resposta, igual a /api/public/:id.
  app.get("/api/community/feed", async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 50);
    const collections = await prisma.collection.findMany({
      where: { isPublic: true, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      take: limit,
      include: {
        owner: { select: { id: true, username: true, displayName: true, avatar: true } },
        bookmarks: {
          where: { groupId: null },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        },
        groups: {
          where: publicGroupWhere,
          include: {
            bookmarks: {
              orderBy: [{ order: "asc" }, { createdAt: "asc" }],
            },
          },
        },
      },
    });
    const postIds = collections.map((c) => c.id);
    // Todo bookmarkId da resposta (soltos + dentro de grupo) — pro cartão de
    // cada favorito no feed poder mostrar contagem de curtida/favoritado/
    // compartilhamento própria, igual ao que já existe por publicação
    // inteira logo abaixo (mesmo padrão de groupBy, só que por bookmarkId).
    const itemIds = collections.flatMap((c) => [
      ...c.bookmarks.map((b) => b.id),
      ...c.groups.flatMap((g) => g.bookmarks.map((b) => b.id)),
    ]);
    // Curtidas/salvamentos de QUALQUER outro dono (exclui o próprio
    // visitante) — o cliente soma +1 por cima quando likedPostIds/
    // savedPostIds já inclui esse post (ver toggleLikePost/toggleSavePost em
    // Community.tsx), então contar a própria interação aqui também contaria
    // ela duas vezes. Compartilhamento não tem esse "+1 otimista" (não existe
    // "descompartilhar" — ver POST .../share acima, que já devolve a
    // contagem TOTAL depois de cada clique), por isso conta todo mundo
    // direto, sem excluir o visitante.
    const [likeCounts, saveCounts, shareCounts, itemLikeCounts, itemSaveCounts, itemShareCounts] =
      postIds.length
        ? await Promise.all([
            prisma.communityPostLike.groupBy({
              by: ["postId"],
              where: { postId: { in: postIds }, NOT: { ownerId: req.owner.id } },
              _count: { ownerId: true },
            }),
            prisma.communityPostSave.groupBy({
              by: ["postId"],
              where: { postId: { in: postIds }, NOT: { ownerId: req.owner.id } },
              _count: { ownerId: true },
            }),
            prisma.communityPostShare.groupBy({
              by: ["postId"],
              where: { postId: { in: postIds } },
              _count: { ownerId: true },
            }),
            prisma.communityItemLike.groupBy({
              by: ["bookmarkId"],
              where: { bookmarkId: { in: itemIds }, NOT: { ownerId: req.owner.id } },
              _count: { ownerId: true },
            }),
            prisma.communityItemSave.groupBy({
              by: ["bookmarkId"],
              where: { bookmarkId: { in: itemIds }, NOT: { ownerId: req.owner.id } },
              _count: { ownerId: true },
            }),
            prisma.communityItemShare.groupBy({
              by: ["bookmarkId"],
              where: { bookmarkId: { in: itemIds } },
              _count: { ownerId: true },
            }),
          ])
        : [[], [], [], [], [], []];
    const likesByPost = Object.fromEntries(likeCounts.map((r) => [r.postId, r._count.ownerId]));
    const savesByPost = Object.fromEntries(saveCounts.map((r) => [r.postId, r._count.ownerId]));
    const sharesByPost = Object.fromEntries(shareCounts.map((r) => [r.postId, r._count.ownerId]));
    const likesByItem = Object.fromEntries(itemLikeCounts.map((r) => [r.bookmarkId, r._count.ownerId]));
    const savesByItem = Object.fromEntries(itemSaveCounts.map((r) => [r.bookmarkId, r._count.ownerId]));
    const sharesByItem = Object.fromEntries(itemShareCounts.map((r) => [r.bookmarkId, r._count.ownerId]));
    const withItemCounts = (bookmark) => ({
      ...bookmark,
      likes: likesByItem[bookmark.id] || 0,
      saves: savesByItem[bookmark.id] || 0,
      shares: sharesByItem[bookmark.id] || 0,
    });
    res.json({
      posts: collections.map(({ owner, publishedAt, bookmarks, groups, ...collection }) => ({
        id: collection.id,
        user: publicAuthor(owner),
        postedAt: publishedAt,
        likes: likesByPost[collection.id] || 0,
        saves: savesByPost[collection.id] || 0,
        shares: sharesByPost[collection.id] || 0,
        collection: {
          ...collection,
          bookmarks: bookmarks.map(withItemCounts),
          groups: groups.map((group) => ({
            ...group,
            bookmarks: group.bookmarks.map(withItemCounts),
          })),
        },
      })),
    });
  });
  app.post("/api/community/posts/:postId/comments", async (req, res) => {
    const postId = validId(req.params.postId, "postId");
    const raw = typeof req.body.text === "string" ? req.body.text : "";
    const text = sanitizeCommentText(raw);
    if (!text || text.length > MAX_COMMENT_LENGTH)
      throw Object.assign(new Error(`O comentário deve ter até ${MAX_COMMENT_LENGTH} caracteres.`), {
        status: 400,
      });
    if (hasSpamPattern(text))
      throw Object.assign(new Error("Esse comentário parece spam. Revise o texto e tente de novo."), {
        status: 400,
      });
    if (!withinCommentRate(req.owner.id))
      throw Object.assign(
        new Error("Você está comentando rápido demais. Aguarde um minuto e tente de novo."),
        { status: 429 },
      );
    const last = await prisma.communityComment.findFirst({
      where: { postId, ownerId: req.owner.id },
      orderBy: { createdAt: "desc" },
    });
    if (last && last.text === text && Date.now() - last.createdAt.getTime() < DUPLICATE_COOLDOWN)
      throw Object.assign(
        new Error("Você já enviou esse comentário. Aguarde um pouco antes de repetir."),
        { status: 429 },
      );
    const comment = await prisma.communityComment.create({
      data: { postId, ownerId: req.owner.id, text },
      include: { owner: true },
    });
    const targetOwnerId = await resolveCollectionOwner(prisma, postId);
    await creditRelevance(prisma, {
      actingOwnerId: req.owner.id,
      targetOwnerId,
      bumpTarget: bumpCollectionRelevance,
      targetId: postId,
      weight: RELEVANCE_WEIGHT.comment,
    });
    res.status(201).json(asComment(comment));
  });
  app.delete("/api/community/comments/:commentId", async (req, res) => {
    const commentId = validId(req.params.commentId, "commentId");
    const comment = await prisma.communityComment.findUnique({ where: { id: commentId } });
    if (!comment || comment.ownerId !== req.owner.id)
      return res.status(404).json({ error: "Comentário não encontrado." });
    await prisma.communityComment.delete({ where: { id: commentId } });
    res.sendStatus(204);
  });
  app.post("/api/community/comments/:commentId/report", async (req, res) => {
    const commentId = validId(req.params.commentId, "commentId");
    const comment = await prisma.communityComment.findUnique({
      where: { id: commentId },
      select: { ownerId: true },
    });
    if (comment && comment.ownerId === req.owner.id)
      throw Object.assign(new Error("Você não pode denunciar seu próprio comentário."), {
        status: 400,
      });
    await prisma.communityCommentReport.upsert({
      where: { ownerId_commentId: { ownerId: req.owner.id, commentId } },
      update: {},
      create: { ownerId: req.owner.id, commentId },
    });
    res.json({ reported: true });
  });
  app.post("/api/community/posts/:postId/report", async (req, res) => {
    const postId = validId(req.params.postId, "postId");
    await prisma.communityPostReport.upsert({
      where: { ownerId_postId: { ownerId: req.owner.id, postId } },
      update: {},
      create: { ownerId: req.owner.id, postId },
    });
    res.json({ reported: true });
  });
  app.post("/api/community/users/:authorId/block", async (req, res) => {
    const authorId = validId(req.params.authorId, "authorId");
    if (authorId === req.owner.id)
      throw Object.assign(new Error("Você não pode bloquear a si mesmo."), { status: 400 });
    const where = { ownerId_authorId: { ownerId: req.owner.id, authorId } };
    const existing = await prisma.communityBlock.findUnique({ where });
    if (existing) {
      await prisma.communityBlock.delete({ where });
      return res.json({ blocked: false });
    }
    await prisma.communityBlock.create({ data: { ownerId: req.owner.id, authorId } });
    res.json({ blocked: true });
  });
}
