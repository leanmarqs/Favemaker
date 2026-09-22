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
  // Cada botão de curtir/salvar é um único POST que inverte o próprio estado
  // (existe → apaga, não existe → cria) — o cliente decide o rótulo mostrado
  // a partir da resposta, sem precisar de PUT/DELETE separados pra cada ação.
  function toggleRoute(path, param, model, idField) {
    app.post(path, async (req, res) => {
      const ownerId = req.owner.id;
      const id = validId(req.params[param], param);
      const where = { [`ownerId_${idField}`]: { ownerId, [idField]: id } };
      const existing = await prisma[model].findUnique({ where });
      if (existing) {
        await prisma[model].delete({ where });
        return res.json({ active: false });
      }
      await prisma[model].create({ data: { ownerId, [idField]: id } });
      res.json({ active: true });
    });
  }
  toggleRoute("/api/community/posts/:postId/like", "postId", "communityPostLike", "postId");
  toggleRoute("/api/community/posts/:postId/save", "postId", "communityPostSave", "postId");
  toggleRoute("/api/community/items/:bookmarkId/like", "bookmarkId", "communityItemLike", "bookmarkId");
  toggleRoute("/api/community/items/:bookmarkId/save", "bookmarkId", "communityItemSave", "bookmarkId");
  toggleRoute("/api/community/comments/:commentId/like", "commentId", "communityCommentLike", "commentId");
  toggleRoute("/api/community/comments/:commentId/save", "commentId", "communityCommentSave", "commentId");
  toggleRoute("/api/community/users/:authorId/follow", "authorId", "communityFollow", "authorId");
  // Cartão de perfil (hover no nome do autor) e o painel "Sobre esta conta"
  // do menu "⋮" da publicação usam o mesmo endpoint: nº de seguidores é
  // sempre real (ver CommunityFollow); memberSince só existe pra autor com
  // conta de verdade por trás (os autores fictícios do communityMock.ts não
  // têm Owner correspondente, então o cliente mostra um aviso de demonstração
  // nesse caso). Buscado sob demanda (ao abrir o cartão/painel), não numa
  // lista antecipada pra cada publicação do feed.
  app.get("/api/community/users/:authorId", async (req, res) => {
    const authorId = validId(req.params.authorId, "authorId");
    const [followerCount, postCount, owner] = await Promise.all([
      prisma.communityFollow.count({ where: { authorId } }),
      prisma.collection.count({ where: { ownerId: authorId, isPublic: true, isSavedItems: false } }),
      prisma.owner.findUnique({ where: { id: authorId }, select: { createdAt: true } }),
    ]);
    res.json({ followerCount, postCount, memberSince: owner ? owner.createdAt : null });
  });
  // Feed da aba Comunidade: coleções públicas de donos de verdade, mais
  // recentes primeiro por publishedAt (quando a coleção virou pública, não
  // quando foi criada — ver comentário no schema.prisma). O id da própria
  // coleção vira o postId usado em curtir/salvar/comentar/denunciar acima —
  // sem tabela de "posts" separada, a coleção pública JÁ É a publicação.
  // Sem "where: isPublic" nos favoritos: um favorito não tem visibilidade
  // própria (ver comentário no schema.prisma) — todos os da coleção já
  // filtrada acima como pública aparecem, igual a /api/public/:id.
  app.get("/api/community/feed", async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 50);
    const collections = await prisma.collection.findMany({
      where: { isPublic: true, isSavedItems: false, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      take: limit,
      include: {
        owner: { select: { id: true, username: true, displayName: true, avatar: true } },
        bookmarks: {
          where: { groupId: null },
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        },
        groups: {
          include: {
            bookmarks: {
              orderBy: [{ order: "asc" }, { createdAt: "asc" }],
            },
          },
        },
      },
    });
    const postIds = collections.map((c) => c.id);
    // Curtidas de QUALQUER outro dono (exclui o próprio visitante) — o
    // cliente soma +1 por cima quando likedPostIds já inclui esse post (ver
    // toggleLikePost em Community.tsx), então contar a própria curtida aqui
    // também contaria ela duas vezes.
    const likeCounts = postIds.length
      ? await prisma.communityPostLike.groupBy({
          by: ["postId"],
          where: { postId: { in: postIds }, NOT: { ownerId: req.owner.id } },
          _count: { ownerId: true },
        })
      : [];
    const likesByPost = Object.fromEntries(likeCounts.map((r) => [r.postId, r._count.ownerId]));
    res.json({
      posts: collections.map(({ owner, publishedAt, ...collection }) => ({
        id: collection.id,
        user: publicAuthor(owner),
        postedAt: publishedAt,
        likes: likesByPost[collection.id] || 0,
        collection,
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
