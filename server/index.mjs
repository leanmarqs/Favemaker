import "dotenv/config";
import express from "express";
import helmet from "helmet";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import { installAuth, resolveOwner } from "./auth.mjs";
import { installCommunity, publicGroupWhere } from "./community.mjs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { metadata, normalizeUrl, resolveImage } from "./metadata.mjs";
import { parseBookmarksHtml, buildBookmarksHtml } from "./bookmarksFile.mjs";
import { scheduleLinkChecks } from "./linkCheck.mjs";
import { scheduleRetention } from "./retention.mjs";
import { buildInfo } from "./buildInfo.mjs";
import { bugReportEmailConfigured, sendBugReportEmail } from "./email.mjs";
import { bumpRelevance, creditRelevance, RELEVANCE_WEIGHT } from "./relevance.mjs";

const prisma = new PrismaClient();
// Índice funcional (GIN) pra buscar favoritos por nome/descrição/URL sem
// precisar de uma coluna tsvector armazenada nem de migração — o Postgres já
// casa esse índice com a mesma expressão usada em WHERE/ORDER BY na busca
// (ver /api/search). "simple" (não "portuguese"/"english"): nomes de sites e
// URLs não são texto corrido de verdade, então stemming de idioma atrapalha
// mais do que ajuda aqui. Roda uma vez na subida do servidor; falha aqui não
// derruba o servidor — só faz a busca ficar mais lenta até o índice existir.
prisma
  .$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "Bookmark_search_idx" ON "Bookmark"
     USING GIN (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(url, '')))`,
  )
  .catch((error) =>
    console.error("Não foi possível criar o índice de busca:", error.message),
  );
export const app = express();
const developmentOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

// Origens de extensões de navegador (ex: a extensão "Salvar no Linkable"). Uma página
// maliciosa nunca tem essa origem — só uma extensão instalada pelo próprio usuário.
function isExtensionOrigin(origin) {
  return /^(chrome|moz)-extension:\/\//.test(origin || "");
}

// Requisições sem Origin (curl, apps não-navegador) não são o público desta
// API — quem legitimamente muda estado aqui é sempre o navegador (frontend
// same-origin ou a extensão), e ambos sempre mandam esse header em métodos
// não seguros. Exigir que ele exista e seja reconhecido fecha o único jeito
// de contornar essa checagem apenas omitindo o header.
function hasAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  if (new URL(origin).host === req.headers.host) return true;
  if (isExtensionOrigin(origin)) return true;
  return process.env.NODE_ENV !== "production" && developmentOrigins.has(origin);
}

if (process.env.NODE_ENV !== "production")
  console.warn(
    "Aviso: NODE_ENV não é \"production\" — o cookie de sessão não terá a flag Secure. " +
      "Garanta que NODE_ENV=production esteja definido no deploy real.",
  );

app.disable("x-powered-by");
// Em produção (Render e afins) toda requisição chega por um proxy reverso —
// sem isto, req.ip é o IP do proxy, igual pra todo mundo, e os limites por IP
// (ver /api/auth em auth.mjs) viram um limite global compartilhado por todos
// os usuários. "1" = confia só no proxy imediatamente à frente (o do host),
// não em qualquer X-Forwarded-For que o próprio cliente mande.
app.set("trust proxy", 1);
// Cabeçalhos de segurança (CSP, no-sniff, no-framing, HSTS, etc.). CSP restrita
// porque o build de produção é uma SPA de origem única sem scripts inline: só
// os favicons/avatares (sempre convertidos em data URI por resolveImage, nunca
// URL externa) precisam de "data:" em img-src. crossOriginResourcePolicy fica
// em "cross-origin" pra não quebrar a extensão do navegador, que lê as
// respostas da API a partir da própria origem dela (chrome-extension://…),
// já liberada explicitamente pelo middleware de CORS abaixo.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Login com Google (Google Identity Services): o script, o CSS e as
        // chamadas/iframes dele vêm de accounts.google.com/gsi — lista
        // oficial em developers.google.com/identity/gsi/web/guides/get-google-api-clientid#content_security_policy.
        scriptSrc: ["'self'", "https://accounts.google.com/gsi/client"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com/gsi/style"],
        // blob:: prévia e recorte da foto de capa (URL.createObjectURL do
        // arquivo escolhido, ver cropBannerImage em App.tsx) — sem isso a
        // imagem é bloqueada em produção e a capa não pode ser enviada. Só a
        // própria página cria URLs blob:, então não abre nada pra fora.
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'"],
        connectSrc: ["'self'", "https://accounts.google.com/gsi/"],
        frameSrc: ["https://accounts.google.com/gsi/"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    frameguard: { action: "deny" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // O padrão do helmet ("same-origin") corta a comunicação entre a página
    // e o popup de login do Google — "allow-popups" é o que o Google indica.
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  }),
);
// 20mb (não 3mb): um export de favoritos do Firefox embute o favicon de cada
// item como data URI dentro do próprio HTML, e pode passar de alguns MB numa
// biblioteca grande — /api/import recebe esse HTML inteiro como corpo JSON.
app.use(express.json({ limit: "20mb" }));
// CORS para extensões de navegador: elas rodam numa origem própria (chrome-extension://…)
// e autenticam com o header X-Linkable-Session (ver cookieToken em auth.mjs) em vez do
// cookie de sessão, então precisam de uma resposta CORS explícita para ler o resultado.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isExtensionOrigin(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Headers", "Content-Type, X-Linkable-Session");
    res.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
  }
  next();
});
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (["POST", "PATCH", "DELETE"].includes(req.method) && !hasAllowedOrigin(req))
    return res.status(403).json({ error: "Origem não permitida." });
  next();
});
// Health check do host (ver render.yaml): responde 200 só se o banco também
// responde — um processo de pé mas sem conexão com o Postgres não serve pra
// nada. Público e sem dados, antes de installAuth. Também diz qual commit
// está no ar e desde quando (ver buildInfo.mjs).
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, ...buildInfo });
  } catch {
    res.status(503).json({ ok: false, ...buildInfo });
  }
});
// Página de perfil público (App.tsx, ?perfil=<id>), inspirada no Twitter:
// avatar/nome/usuário, "entrou em", seguidores e as coleções públicas do
// dono. owner vem null quando o id não corresponde a nenhuma conta real —
// caso dos autores fictícios do feed da Comunidade (ver communityMock.ts),
// que não têm Owner por trás; o frontend usa nome/usuário/cor recebidos na
// própria URL como fallback de exibição nesse caso (ver publicProfileHref
// em Community.tsx).
// Fica ANTES de installAuth de propósito (ver o comentário dela mais abaixo:
// "Public profiles stay accessible; all personal routes below require a
// session" — installAuth termina registrando um guard que EXIGE sessão pra
// qualquer rota "/api" seguinte). resolveOwner (exportada por auth.mjs) faz a
// mesma consulta de sessão do middleware que installAuth registraria, só que
// sem esse guard: sabe quem é o visitante quando ele está logado (pra
// excluir a curtida/salvamento DELE MESMO da contagem de cada favorito,
// mesmo motivo do +1 otimista em GET /api/community/feed,
// server/community.mjs), mas continua funcionando pra visitante anônimo.
app.get("/api/public/:id", async (req, res) => {
  const [owner, collections, followerCount, followingCount, viewer] = await Promise.all([
    prisma.owner.findUnique({
      where: { id: req.params.id },
      select: { username: true, displayName: true, avatar: true, banner: true, createdAt: true },
    }),
    prisma.collection.findMany({
      where: { ownerId: req.params.id, isPublic: true },
      // Sem isso, o Postgres não garante nenhuma ordem estável entre consultas
      // — um UPDATE em qualquer coleção (ex: o chevron de expandir/recolher,
      // que só mexe em "behavior") pode mudar a posição física da linha e fazer
      // a coleção "pular" de lugar na lista, mesmo sem relação nenhuma com sua
      // ordem de exibição. "order" é a posição escolhida (arrastar/"Ordenar
      // A-Z"); createdAt é só o desempate pras que nunca foram reordenadas.
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      // Sem "where: isPublic" nos favoritos soltos: um favorito sem grupo não
      // tem visibilidade própria (ver comentário no schema.prisma) — a
      // coleção já filtrada acima como pública cobre todos eles. Os GRUPOS
      // (seções e agrupamentos) já têm isPublic próprio (ver comentário em
      // BookmarkGroup) — "where: isPublic" neles deixa uma coleção pública
      // esconder seções/agrupamentos privados (e os favoritos dentro deles).
      include: {
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
    }),
    prisma.communityFollow.count({ where: { authorId: req.params.id } }),
    prisma.communityFollow.count({ where: { ownerId: req.params.id } }),
    resolveOwner(req, prisma),
  ]);
  // Mesmo padrão de GET /api/community/feed: contagem de curtida/favoritado/
  // compartilhamento por favorito, pra mostrar nos ícones de cada link da
  // página de perfil público (antes só existia no feed da Comunidade).
  const itemIds = collections.flatMap((c) => [
    ...c.bookmarks.map((b) => b.id),
    ...c.groups.flatMap((g) => g.bookmarks.map((b) => b.id)),
  ]);
  const [itemLikeCounts, itemSaveCounts, itemShareCounts] = itemIds.length
    ? await Promise.all([
        prisma.communityItemLike.groupBy({
          by: ["bookmarkId"],
          where: { bookmarkId: { in: itemIds }, NOT: { ownerId: viewer?.id || "" } },
          _count: { ownerId: true },
        }),
        prisma.communityItemSave.groupBy({
          by: ["bookmarkId"],
          where: { bookmarkId: { in: itemIds }, NOT: { ownerId: viewer?.id || "" } },
          _count: { ownerId: true },
        }),
        prisma.communityItemShare.groupBy({
          by: ["bookmarkId"],
          where: { bookmarkId: { in: itemIds } },
          _count: { ownerId: true },
        }),
      ])
    : [[], [], []];
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
    collections: collections.map(({ bookmarks, groups, ...collection }) => ({
      ...collection,
      bookmarks: bookmarks.map(withItemCounts),
      groups: groups.map((g) => ({ ...g, bookmarks: g.bookmarks.map(withItemCounts) })),
    })),
    profile: owner
      ? {
          name: owner.displayName || owner.username || "Usuário",
          username: owner.username || "",
          avatar: owner.avatar || "",
          banner: owner.banner || "",
          memberSince: owner.createdAt,
          followerCount,
          followingCount,
        }
      : null,
  });
});
// Public profiles stay accessible; all personal routes below require a session.
installAuth(app, prisma);
// Limite geral por dono pra toda a API autenticada — defesa contra abuso
// automatizado (script rodando em loop, sessão comprometida) que nenhuma das
// rotas individuais cobre. Mais generoso que o limite específico de
// /api/metadata|/api/icon logo abaixo, que é mais apertado por envolver
// requisição de rede a um site de terceiros.
const apiLimits = new Map();
app.use("/api", (req, res, next) => {
  if (!req.owner) return next();
  const now = Date.now();
  const current = apiLimits.get(req.owner.id) || { start: now, count: 0 };
  if (now - current.start > 60000) {
    current.start = now;
    current.count = 0;
  }
  if (++current.count > 300)
    return res.status(429).json({ error: "Muitas requisições. Aguarde um minuto." });
  apiLimits.set(req.owner.id, current);
  next();
});
installCommunity(app, prisma);
// Busca por nome/descrição/URL nos favoritos do próprio dono — Postgres full
// text search (to_tsvector/websearch_to_tsquery), sem depender de nenhum
// serviço externo. websearch_to_tsquery aceita entrada de usuário "crua" (com
// aspas, "-palavra", etc.) sem lançar erro em pontuação inesperada, diferente
// de to_tsquery/plainto_tsquery — mais tolerante pra um campo de busca livre.
app.get("/api/search", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q || q.length > 200) return res.json({ results: [] });
  const results = await prisma.$queryRaw`
    SELECT b.id, b.name, b.url, b.description, b.favicon, b.color,
           c."isPublic", b."collectionId", c.name AS "collectionName"
    FROM "Bookmark" b
    JOIN "Collection" c ON c.id = b."collectionId"
    WHERE c."ownerId" = ${req.owner.id}
      AND to_tsvector('simple', coalesce(b.name, '') || ' ' || coalesce(b.description, '') || ' ' || coalesce(b.url, ''))
          @@ websearch_to_tsquery('simple', ${q})
    ORDER BY ts_rank(
      to_tsvector('simple', coalesce(b.name, '') || ' ' || coalesce(b.description, '') || ' ' || coalesce(b.url, '')),
      websearch_to_tsquery('simple', ${q})
    ) DESC
    LIMIT 50
  `;
  res.json({ results });
});
app.get("/api/collections", async (req, res) => {
  const collections = await prisma.collection.findMany({
    where: { ownerId: req.owner.id },
    // Ver comentário equivalente em /api/public/:id.
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      bookmarks: { where: { groupId: null }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      groups: { include: { bookmarks: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } } },
    },
  });
  res.json({ collections, ownerId: req.owner.id });
});
function fields(body) {
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 120
  )
    throw Object.assign(new Error("Informe um nome de até 120 caracteres."), {
      status: 400,
    });
  if (typeof body.isPublic !== "boolean" || !/^#[0-9a-f]{6}$/i.test(body.color))
    throw Object.assign(new Error("Cor ou visibilidade inválida."), {
      status: 400,
    });
  if (typeof body.description !== "string" || body.description.length > 2000)
    throw Object.assign(
      new Error("A descrição deve ter até 2.000 caracteres."),
      { status: 400 },
    );
  return {
    name: body.name.trim(),
    description: body.description,
    color: body.color,
    isPublic: body.isPublic,
  };
}
// Campos de um favorito — sem isPublic de propósito: um favorito não decide
// a própria visibilidade, sempre herda a da coleção (ver comentário no
// schema.prisma, model Bookmark). Diferente de fields() (usado só por
// coleção), que ainda valida/guarda isPublic normalmente.
function bookmarkBaseFields(body) {
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 120
  )
    throw Object.assign(new Error("Informe um nome de até 120 caracteres."), {
      status: 400,
    });
  if (!/^#[0-9a-f]{6}$/i.test(body.color))
    throw Object.assign(new Error("Cor inválida."), { status: 400 });
  if (typeof body.description !== "string" || body.description.length > 2000)
    throw Object.assign(
      new Error("A descrição deve ter até 2.000 caracteres."),
      { status: 400 },
    );
  return {
    name: body.name.trim(),
    description: body.description,
    color: body.color,
  };
}
function shape(body) {
  return ["circle", "square", "rounded"].includes(body.shape)
    ? body.shape
    : "rounded";
}
function behavior(body) {
  return ["fixed", "expansive"].includes(body.behavior)
    ? body.behavior
    : "expansive";
}
async function collection(req, id) {
  if (typeof id !== "string")
    throw Object.assign(new Error("Selecione uma coleção."), { status: 400 });
  const item = await prisma.collection.findFirst({
    where: { id, ownerId: req.owner.id },
  });
  if (!item)
    throw Object.assign(new Error("Coleção não encontrada."), { status: 404 });
  return item;
}
async function group(req, id) {
  if (typeof id !== "string")
    throw Object.assign(new Error("Selecione um grupo."), { status: 400 });
  const item = await prisma.bookmarkGroup.findFirst({
    where: { id, collection: { ownerId: req.owner.id } },
  });
  if (!item)
    throw Object.assign(new Error("Grupo não encontrado."), { status: 404 });
  return item;
}
// null = usa o formato da própria coleção (ver comentário no schema.prisma) —
// diferente de shape(), que sempre resolve pra um valor real ("rounded" por
// padrão), aqui a ausência de valor tem um significado próprio.
function groupShape(body) {
  if (!["circle", "square", "rounded"].includes(body.shape)) return null;
  return body.shape;
}
function groupFields(body) {
  if (
    typeof body.name !== "string" ||
    !body.name.trim() ||
    body.name.length > 120
  )
    throw Object.assign(new Error("Informe um nome de até 120 caracteres."), {
      status: 400,
    });
  if (body.color !== undefined && !/^#[0-9a-f]{6}$/i.test(body.color))
    throw Object.assign(new Error("Cor inválida."), { status: 400 });
  if (
    body.description !== undefined &&
    (typeof body.description !== "string" || body.description.length > 2000)
  )
    throw Object.assign(
      new Error("A descrição deve ter até 2.000 caracteres."),
      { status: 400 },
    );
  return {
    name: body.name.trim(),
    color: body.color || "#8b5cf6",
    description: typeof body.description === "string" ? body.description : "",
    showName: Boolean(body.showName),
    shape: groupShape(body),
    // Ausente (ex: formulário antigo que ainda não manda esse campo) mantém
    // o grupo público — visível assim que a coleção em volta for pública,
    // que já era o único comportamento possível antes desse campo existir.
    isPublic: body.isPublic === false ? false : true,
  };
}
app.post("/api/collections", async (req, res) => {
  const data = fields(req.body);
  res
    .status(201)
    .json(
      await prisma.collection.create({
        data: {
          ...data,
          shape: shape(req.body),
          behavior: behavior(req.body),
          ownerId: req.owner.id,
          publishedAt: data.isPublic ? new Date() : null,
        },
        include: { bookmarks: true },
      }),
    );
});
// Reordena a lista "Suas coleções" do dono — usada tanto por "Ordenar A-Z"
// quanto por arrastar uma coleção pra outra posição. Precisa vir antes do
// PATCH /api/collections/:id abaixo, senão "reorder" seria lido como um :id.
app.patch("/api/collections/reorder", async (req, res) => {
  const { orderedIds } = req.body;
  if (
    !Array.isArray(orderedIds) ||
    !orderedIds.length ||
    orderedIds.some((id) => typeof id !== "string")
  )
    throw Object.assign(new Error("Lista de coleções inválida."), {
      status: 400,
    });
  await prisma.$transaction(async (tx) => {
    const found = await tx.collection.findMany({
      where: { id: { in: orderedIds }, ownerId: req.owner.id },
      select: { id: true },
    });
    if (found.length !== orderedIds.length)
      throw Object.assign(new Error("Uma ou mais coleções são inválidas."), {
        status: 400,
      });
    await Promise.all(
      orderedIds.map((id, index) =>
        tx.collection.update({ where: { id }, data: { order: index } }),
      ),
    );
  });
  res.sendStatus(204);
});
app.patch("/api/collections/:id", async (req, res) => {
  const existing = await collection(req, req.params.id);
  const data = { ...fields(req.body), shape: shape(req.body), behavior: behavior(req.body) };
  // Marca "publicada agora" só na transição privada → pública — voltar a
  // ficar pública depois de um tempo privada conta como nova publicação
  // (sobe pro topo do feed da Comunidade), mas alternar sem sair do público
  // (ex: outro campo do formulário) não deve mexer na data.
  if (data.isPublic && !existing.isPublic) data.publishedAt = new Date();
  res.json(
    await prisma.collection.update({
      where: { id: req.params.id },
      data,
    }),
  );
});
app.delete("/api/collections/:id", async (req, res) => {
  await collection(req, req.params.id);
  await prisma.collection.delete({ where: { id: req.params.id } });
  res.sendStatus(204);
});
async function bookmarkFields(req) {
  await collection(req, req.body.collectionId);
  const data = bookmarkBaseFields(req.body);
  let url;
  let icon;
  try {
    url = normalizeUrl(req.body.url);
    icon = await resolveImage(req.body.favicon);
  } catch (e) {
    throw Object.assign(e, { status: 400 });
  }
  const result = {
    ...data,
    url,
    favicon: icon.favicon,
    collectionId: req.body.collectionId,
  };
  // groupId só entra no update quando o corpo realmente manda essa chave (ex:
  // "adicionar favorito" a partir de uma seção específica) — se não vier, o
  // grupo atual do favorito (se houver) fica intocado, como já era o
  // comportamento do formulário normal de edição, que não mexe em grupo.
  if (req.body.groupId !== undefined) {
    if (req.body.groupId === null) {
      result.groupId = null;
    } else {
      const target = await group(req, req.body.groupId);
      if (target.collectionId !== req.body.collectionId)
        throw Object.assign(new Error("O grupo pertence a outra coleção."), {
          status: 400,
        });
      result.groupId = target.id;
    }
  }
  return result;
}
app.post("/api/bookmarks", async (req, res) =>
  res
    .status(201)
    .json(await prisma.bookmark.create({ data: await bookmarkFields(req) })),
);
// Ids já favoritados pelo dono logado — usado pra acender o coração no card
// de prévia de cada favicon (ver App.tsx), tanto em "Suas coleções" quanto no
// perfil público de outro dono ou num favicon da Comunidade. Combina três
// origens: favoritos individuais salvos de coleção alheia (SavedCollection
// parcial, ver GET /api/saved-collections abaixo), TODOS os favoritos atuais
// de uma coleção alheia salva INTEIRA (SavedCollection.full — o coração
// acende pra qualquer item dela, mesmo um adicionado depois de salvar) e
// marcas leves em BookmarkSaveMark (favoritos do PRÓPRIO dono, que nunca
// ganham referência — ver POST abaixo) — o cliente não precisa saber a
// diferença, só se o coração acende ou não.
app.get("/api/saved-items", async (req, res) => {
  const [savedCollections, marks] = await Promise.all([
    prisma.savedCollection.findMany({
      where: { ownerId: req.owner.id },
      include: {
        items: { select: { bookmarkId: true } },
        collection: { select: { bookmarks: { select: { id: true } } } },
      },
    }),
    prisma.bookmarkSaveMark.findMany({
      where: { ownerId: req.owner.id },
      select: { bookmarkId: true },
    }),
  ]);
  const savedFromIds = [];
  for (const saved of savedCollections) {
    if (saved.full) savedFromIds.push(...saved.collection.bookmarks.map((b) => b.id));
    else savedFromIds.push(...saved.items.map((i) => i.bookmarkId));
  }
  savedFromIds.push(...marks.map((m) => m.bookmarkId));
  res.json({ savedFromIds });
});
// Alterna favoritar um item específico (o coração de cada favicon, não o
// "Salvar" da coleção/publicação inteira). Dois caminhos bem diferentes:
// - link ALHEIO: liga/desliga uma REFERÊNCIA (SavedCollection +
//   SavedCollectionItem) à coleção original dele, nunca uma cópia — o dono
//   passa a "seguir" aquele link, sempre vendo o dado ao vivo (ver GET
//   /api/saved-collections), sem poder editá-lo. Favorito fictício da
//   Comunidade (sem linha de Bookmark de verdade, ver communityMock.ts): não
//   há nada de verdade pra referenciar, então só confirma a interação sem
//   persistir nada.
// - link do PRÓPRIO dono: não cria referência nenhuma (favoritar o próprio
//   link não faz sentido) — só liga/desliga uma marca leve em
//   BookmarkSaveMark, pra ele aparecer na filtragem de itens salvos sem
//   ganhar coleção nova nenhuma.
// Fica fora do middleware de posse de /api/bookmarks/:id porque o "original"
// pode nem pertencer a este dono.
app.post("/api/saved-items/:sourceId", async (req, res) => {
  const sourceId = req.params.sourceId;
  if (typeof sourceId !== "string" || !sourceId.trim() || sourceId.length > 80)
    throw Object.assign(new Error("Favorito inválido."), { status: 400 });
  const source = await prisma.bookmark.findUnique({
    where: { id: sourceId },
    select: { collectionId: true, collection: { select: { ownerId: true } } },
  });
  const sourceOwnerId = source?.collection.ownerId ?? null;
  if (sourceOwnerId === req.owner.id) {
    const where = { ownerId_bookmarkId: { ownerId: req.owner.id, bookmarkId: sourceId } };
    const existingMark = await prisma.bookmarkSaveMark.findUnique({ where });
    if (existingMark) {
      await prisma.bookmarkSaveMark.delete({ where });
      return res.json({ active: false });
    }
    await prisma.bookmarkSaveMark.create({ data: { ownerId: req.owner.id, bookmarkId: sourceId } });
    // Sem bump de relevância aqui: é o próprio dono favoritando o próprio
    // link, o exato caso que a relevância nunca deve contar (ver
    // server/relevance.mjs).
    return res.status(201).json({ active: true });
  }
  if (!source) return res.status(201).json({ active: true });
  const existingSaved = await prisma.savedCollection.findUnique({
    where: {
      ownerId_collectionId: { ownerId: req.owner.id, collectionId: source.collectionId },
    },
    include: { items: { where: { bookmarkId: sourceId } } },
  });
  // Coleção inteira já salva: o coração deste item já acende por causa dela
  // (ver GET /api/saved-items acima) — desfazer só um item aqui não faz
  // sentido, precisa desfazer o "Salvar" da publicação inteira.
  if (existingSaved?.full) return res.json({ active: true });
  if (existingSaved?.items.length) {
    await prisma.savedCollectionItem.delete({
      where: {
        savedCollectionId_bookmarkId: {
          savedCollectionId: existingSaved.id,
          bookmarkId: sourceId,
        },
      },
    });
    const remaining = await prisma.savedCollectionItem.count({
      where: { savedCollectionId: existingSaved.id },
    });
    // Some da aba "Itens Salvos" assim que a referência fica sem nenhum item
    // salvo — ela só existe enquanto tiver pelo menos um.
    if (remaining === 0)
      await prisma.savedCollection.delete({ where: { id: existingSaved.id } });
    await creditRelevance(prisma, {
      actingOwnerId: req.owner.id,
      targetOwnerId: sourceOwnerId,
      bumpTarget: bumpRelevance,
      targetId: sourceId,
      weight: -RELEVANCE_WEIGHT.copy,
    });
    return res.json({ active: false });
  }
  const savedCollection =
    existingSaved ||
    (await prisma.savedCollection.create({
      data: { ownerId: req.owner.id, collectionId: source.collectionId, full: false },
    }));
  let created = true;
  try {
    await prisma.savedCollectionItem.create({
      data: { savedCollectionId: savedCollection.id, bookmarkId: sourceId },
    });
  } catch (e) {
    // Duplo clique bem rápido pode mandar dois POSTs de "salvar" antes do
    // primeiro terminar — o índice único (savedCollectionId, bookmarkId)
    // barra a segunda referência; trata como sucesso (já está salvo) em vez
    // de erro. Não conta relevância de novo nesse caso: o item em si já
    // rendeu seus pontos na primeira requisição que de fato criou a linha.
    if (e.code !== "P2002") throw e;
    created = false;
  }
  if (created)
    await creditRelevance(prisma, {
      actingOwnerId: req.owner.id,
      targetOwnerId: sourceOwnerId,
      bumpTarget: bumpRelevance,
      targetId: sourceId,
      weight: RELEVANCE_WEIGHT.copy,
    });
  res.status(201).json({ active: true });
});
// Lista as coleções alheias que o dono logado "segue" (aba "Itens Salvos",
// ver PosterRow/CollectionRow em App.tsx) — sempre lidas AO VIVO da coleção
// original (nome, descrição, favoritos atuais), nunca de uma cópia, então
// qualquer edição de quem criou aparece aqui sem esforço nenhum. Só coleções
// ainda públicas entram (o dono original pode ter tornado privada depois de
// salva, e nesse caso ela simplesmente some daqui, mesma regra de
// GET /api/public/:id). Quando full=false, filtra bookmarks/grupos pra só os
// itens individualmente salvos (SavedCollectionItem) aparecerem, mesmo que a
// coleção original tenha outros links não salvos por este dono.
app.get("/api/saved-collections", async (req, res) => {
  const savedCollections = await prisma.savedCollection.findMany({
    where: { ownerId: req.owner.id, collection: { isPublic: true } },
    orderBy: { createdAt: "desc" },
    include: {
      items: { select: { bookmarkId: true } },
      collection: {
        include: {
          owner: { select: { id: true, username: true, displayName: true } },
          groups: {
            where: publicGroupWhere,
            orderBy: { createdAt: "asc" },
            include: { bookmarks: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
          },
          bookmarks: {
            where: { groupId: null },
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });
  const collections = savedCollections
    .map((saved) => {
      const allowedIds = saved.full ? null : new Set(saved.items.map((i) => i.bookmarkId));
      const filterBookmarks = (bookmarks) =>
        allowedIds ? bookmarks.filter((b) => allowedIds.has(b.id)) : bookmarks;
      const groups = saved.collection.groups
        .map((group) => ({ ...group, bookmarks: filterBookmarks(group.bookmarks) }))
        .filter((group) => saved.full || group.bookmarks.length);
      const bookmarks = filterBookmarks(saved.collection.bookmarks);
      return {
        id: saved.collection.id,
        name: saved.collection.name,
        description: saved.collection.description,
        color: saved.collection.color,
        isPublic: saved.collection.isPublic,
        shape: saved.collection.shape,
        behavior: saved.collection.behavior,
        bookmarks,
        groups,
        savedFromAuthorId: saved.collection.owner.id,
        savedFromAuthorName:
          saved.collection.owner.displayName || saved.collection.owner.username || "Usuário",
        // Só usado pro filter abaixo, nunca enviado ao cliente: uma coleção
        // salva por completo continua aparecendo mesmo sem nenhum item (ela
        // ainda existe, só está vazia agora), diferente de uma referência
        // parcial vazia, que já teria sido apagada em POST /api/saved-items.
        full: saved.full,
      };
    })
    .filter((c) => c.full || c.bookmarks.length || c.groups.some((g) => g.bookmarks.length))
    .map(({ full, ...c }) => c);
  res.json({ collections, ownerId: req.owner.id });
});
// Desfaz o "Salvar" de uma coleção alheia por completo (inteira ou parcial) —
// diferente do coração de um item específico (POST /api/saved-items/:sourceId),
// que só desfaz um link por vez quando a referência é parcial. Usado pelo
// botão "Remover dos salvos" da aba "Itens Salvos" em App.tsx. Também desliga
// o CommunityPostSave (ver server/community.mjs) da mesma publicação, senão o
// botão "Salvar" dela no feed continuaria mostrando "salvo" mesmo depois da
// referência ter sumido daqui.
app.delete("/api/saved-collections/:collectionId", async (req, res) => {
  const { id: ownerId } = req.owner;
  const { collectionId } = req.params;
  await Promise.all([
    prisma.savedCollection.deleteMany({ where: { ownerId, collectionId } }),
    prisma.communityPostSave.deleteMany({ where: { ownerId, postId: collectionId } }),
  ]);
  res.json({ ok: true });
});
// Reordena (e opcionalmente move de grupo) uma lista inteira de favoritos de
// uma vez — usada ao arrastar um ícone para uma posição específica da lista
// (entre dois outros) ou para dentro de uma seção. O cliente manda a lista
// completa já na ordem final do destino (com o item arrastado já incluído);
// só o container de chegada precisa ser reenumerado, o de origem (se
// diferente) mantém seus valores de `order` como estavam. Precisa vir antes
// do middleware `/api/bookmarks/:id` abaixo, senão "reorder" seria lido como
// um :id de favorito e cairia num 404.
app.patch("/api/bookmarks/reorder", async (req, res) => {
  const { collectionId, orderedIds } = req.body;
  const groupId = req.body.groupId === undefined ? null : req.body.groupId;
  await collection(req, collectionId);
  if (groupId !== null) {
    const target = await group(req, groupId);
    if (target.collectionId !== collectionId)
      throw Object.assign(new Error("O grupo pertence a outra coleção."), {
        status: 400,
      });
  }
  if (
    !Array.isArray(orderedIds) ||
    !orderedIds.length ||
    orderedIds.some((id) => typeof id !== "string")
  )
    throw Object.assign(new Error("Lista de favoritos inválida."), {
      status: 400,
    });
  await prisma.$transaction(async (tx) => {
    const found = await tx.bookmark.findMany({
      where: { id: { in: orderedIds }, collectionId },
      select: { id: true },
    });
    if (found.length !== orderedIds.length)
      throw Object.assign(new Error("Um ou mais favoritos são inválidos."), {
        status: 400,
      });
    await Promise.all(
      orderedIds.map((id, index) =>
        tx.bookmark.update({ where: { id }, data: { groupId, order: index } }),
      ),
    );
  });
  res.sendStatus(204);
});
app.use("/api/bookmarks/:id", async (req, res, next) => {
  const item = await prisma.bookmark.findFirst({
    where: { id: req.params.id, collection: { ownerId: req.owner.id } },
  });
  if (!item) return res.status(404).json({ error: "Favorito não encontrado." });
  next();
});
app.patch("/api/bookmarks/:id", async (req, res) =>
  res.json(
    await prisma.bookmark.update({
      where: { id: req.params.id },
      data: await bookmarkFields(req),
    }),
  ),
);
app.delete("/api/bookmarks/:id", async (req, res) => {
  await prisma.bookmark.delete({ where: { id: req.params.id } });
  res.sendStatus(204);
});
// Endpoint dedicado e leve só pra mover um favorito pra dentro/fora de um
// grupo — evita reprocessar favicon/nome/etc. a cada arrasto, que é o que a
// rota PATCH /api/bookmarks/:id normal faria via bookmarkFields().
app.patch("/api/bookmarks/:id/move", async (req, res) => {
  const groupId = req.body.groupId;
  if (groupId !== null && typeof groupId !== "string")
    throw Object.assign(new Error("Grupo inválido."), { status: 400 });
  if (groupId) {
    const bookmark = await prisma.bookmark.findUnique({
      where: { id: req.params.id },
    });
    const target = await group(req, groupId);
    if (target.collectionId !== bookmark.collectionId)
      throw Object.assign(new Error("O grupo pertence a outra coleção."), {
        status: 400,
      });
  }
  res.json(
    await prisma.bookmark.update({
      where: { id: req.params.id },
      data: { groupId },
    }),
  );
});
app.post("/api/groups", async (req, res) => {
  const col = await collection(req, req.body.collectionId);
  const data = groupFields(req.body);
  // "section" pode nascer vazia (o usuário ainda vai adicionar favoritos por
  // ela, pelo "+" da própria seção) — "tile" continua exigindo pelo menos dois,
  // já que ele nasce de arrastar um ícone sobre outro.
  const display = req.body.display === "section" ? "section" : "tile";
  const bookmarkIds = Array.isArray(req.body.bookmarkIds)
    ? req.body.bookmarkIds
    : [];
  if (bookmarkIds.length < (display === "section" ? 0 : 2))
    throw Object.assign(new Error("Selecione ao menos dois favoritos."), {
      status: 400,
    });
  // Agrupamento criado dentro de uma seção (arrastando um favorito sobre
  // outro dela) continua morando nela — ver parentId no schema.prisma. Seção
  // não tem pai: só um nível de aninhamento.
  let parentId = null;
  if (display === "tile" && req.body.parentId) {
    const parent = await group(req, req.body.parentId);
    if (parent.collectionId !== col.id || parent.display !== "section")
      throw Object.assign(new Error("Seção inválida."), { status: 400 });
    parentId = parent.id;
  }
  const created = await prisma.$transaction(async (tx) => {
    const grp = await tx.bookmarkGroup.create({
      data: { ...data, display, parentId, collectionId: col.id },
    });
    if (bookmarkIds.length) {
      const { count } = await tx.bookmark.updateMany({
        where: { id: { in: bookmarkIds }, collectionId: col.id },
        data: { groupId: grp.id },
      });
      if (count !== bookmarkIds.length)
        throw Object.assign(
          new Error("Um ou mais favoritos são inválidos."),
          { status: 400 },
        );
    }
    return tx.bookmarkGroup.findUnique({
      where: { id: grp.id },
      include: { bookmarks: true },
    });
  });
  res.status(201).json(created);
});
app.patch("/api/groups/:id", async (req, res) => {
  await group(req, req.params.id);
  res.json(
    await prisma.bookmarkGroup.update({
      where: { id: req.params.id },
      data: groupFields(req.body),
      include: { bookmarks: true },
    }),
  );
});
app.delete("/api/groups/:id", async (req, res) => {
  const target = await group(req, req.params.id);
  // Excluir um grupo nunca apaga favoritos: eles voltam pro container de
  // onde o grupo veio — a seção, se for um agrupamento dentro de uma
  // (parentId), ou a coleção — no fim da lista de lá, na mesma ordem em que
  // estavam no grupo. Excluir uma seção devolve os favoritos soltos dela e os
  // agrupamentos de dentro dela pra coleção (onDelete: SetNull no schema).
  const destinationId = target.parentId || null;
  const parent = destinationId
    ? await prisma.bookmarkGroup.findUnique({ where: { id: destinationId } })
    : null;
  await prisma.$transaction(async (tx) => {
    const [members, last] = await Promise.all([
      tx.bookmark.findMany({
        where: { groupId: target.id },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      }),
      tx.bookmark.aggregate({
        where: { collectionId: target.collectionId, groupId: destinationId },
        _max: { order: true },
      }),
    ]);
    const start = (last._max.order ?? -1) + 1;
    for (const [index, member] of members.entries())
      await tx.bookmark.update({
        where: { id: member.id },
        data: { groupId: destinationId, order: start + index },
      });
    await tx.bookmarkGroup.delete({ where: { id: target.id } });
  });
  res.json({ returnedTo: parent ? { kind: "section", name: parent.name } : { kind: "collection" } });
});
const limits = new Map();
app.post(["/api/metadata", "/api/icon"], async (req, res) => {
  const now = Date.now();
  const current = limits.get(req.owner.id) || { start: now, count: 0 };
  if (now - current.start > 60000) {
    current.start = now;
    current.count = 0;
  }
  if (++current.count > 30)
    return res
      .status(429)
      .json({ error: "Aguarde um minuto antes de consultar novos ícones." });
  limits.set(req.owner.id, current);
  try {
    res.json(
      req.path.endsWith("/icon")
        ? await resolveImage(req.body.favicon, {
            crop: req.body.crop === "cover" ? "cover" : "inside",
          })
        : await metadata(req.body.url),
    );
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// "Atualizar imagens" da barra de ferramentas da coleção: busca de novo, pra
// cada favorito, a melhor imagem disponível hoje (mesma escolha do metadata()
// ao criar um favorito — og:image num post/artigo, o maior ícone do site
// numa home) e troca a guardada quando mudou. Sites trocam de favicon/capa
// com o tempo, e o que foi salvo na criação fica congelado sem isto. Um
// favorito cuja busca falha (site fora do ar, sem ícone nenhum) mantém a
// imagem atual em vez de ficar sem nenhuma. Uma rodada por dono de cada vez:
// cada favorito pode custar várias requisições externas.
const iconRefreshRunning = new Set();
app.post("/api/collections/:id/refresh-icons", async (req, res) => {
  const col = await collection(req, req.params.id);
  if (iconRefreshRunning.has(req.owner.id))
    return res
      .status(429)
      .json({ error: "Já existe uma atualização de imagens em andamento." });
  iconRefreshRunning.add(req.owner.id);
  try {
    const bookmarks = await prisma.bookmark.findMany({
      where: { collectionId: col.id },
      select: { id: true, url: true, favicon: true },
    });
    const CONCURRENCY = 5;
    let index = 0;
    let updated = 0;
    async function worker() {
      while (index < bookmarks.length) {
        const bookmark = bookmarks[index++];
        try {
          const result = await metadata(bookmark.url);
          if (!result.favicon || result.favicon === bookmark.favicon) continue;
          await prisma.bookmark.update({
            where: { id: bookmark.id },
            data: { favicon: result.favicon, color: result.color },
          });
          updated++;
        } catch {}
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, bookmarks.length) }, worker),
    );
    res.json({ total: bookmarks.length, updated });
  } finally {
    iconRefreshRunning.delete(req.owner.id);
  }
});
// Relato de bug do menu Ajuda: guardado no banco (sempre) e, se
// BUG_REPORT_EMAIL estiver configurado, também enviado por e-mail. O cliente
// manda junto a página, o navegador, o tamanho da tela e o commit do front;
// tudo é truncado aqui pra nunca guardar texto arbitrariamente grande. No
// máximo 5 relatos por hora por conta.
const bugReportLimits = new Map();
const clip = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");
app.post("/api/bug-reports", async (req, res) => {
  const message = typeof req.body.message === "string" ? req.body.message.trim() : "";
  if (message.length < 10 || message.length > 4000)
    return res.status(400).json({ error: "Descreva o problema em 10 a 4.000 caracteres." });
  const now = Date.now();
  const recent = (bugReportLimits.get(req.owner.id) || []).filter((t) => now - t < 3600000);
  if (recent.length >= 5)
    return res.status(429).json({ error: "Você já enviou vários relatos na última hora. Tente de novo mais tarde." });
  bugReportLimits.set(req.owner.id, [...recent, now]);
  const report = await prisma.bugReport.create({
    data: {
      ownerId: req.owner.id,
      message,
      pageUrl: clip(req.body.pageUrl, 2000),
      userAgent: clip(req.headers["user-agent"], 512),
      viewport: clip(req.body.viewport, 40),
      appCommit: clip(req.body.appCommit, 40) || buildInfo.commit,
    },
  });
  if (bugReportEmailConfigured())
    sendBugReportEmail(report, req.owner).catch((error) =>
      console.error("Falha ao enviar o relato de bug por e-mail:", error.message),
    );
  res.status(201).json({ id: report.id });
});
// Achata pastas aninhadas além de um nível: o Linkable só tem coleção → grupo →
// favorito, então uma pasta dentro de um grupo perde só o próprio nome —
// nenhum favorito é descartado.
function flattenBookmarks(nodes) {
  const out = [];
  for (const node of nodes) {
    if (node.type === "bookmark") out.push(node);
    else if (node.type === "folder") out.push(...flattenBookmarks(node.children));
  }
  return out;
}
async function createImportedBookmark(node, collectionId, groupId) {
  let url;
  try {
    url = normalizeUrl(node.url);
  } catch {
    return null; // pula bookmarklets (javascript:) e URLs inválidas, sem travar o resto
  }
  let favicon = "";
  // Só o Firefox embute o favicon (ICON, data URI) no próprio arquivo — dá
  // pra resolver na hora porque é decodificação local, sem ida à rede.
  if (node.icon) {
    try {
      favicon = (await resolveImage(node.icon)).favicon;
    } catch {}
  }
  return prisma.bookmark.create({
    data: {
      name: (node.name || url).slice(0, 120),
      url,
      description: "",
      favicon,
      color: "#8b5cf6",
      collectionId,
      groupId: groupId || null,
    },
  });
}
async function enrichImportedFavicons(ids) {
  const CONCURRENCY = 5;
  let index = 0;
  async function worker() {
    while (index < ids.length) {
      const id = ids[index++];
      try {
        const bookmark = await prisma.bookmark.findUnique({ where: { id } });
        if (!bookmark) continue;
        const result = await metadata(bookmark.url);
        if (result.favicon)
          await prisma.bookmark.update({
            where: { id },
            data: { favicon: result.favicon, color: result.color },
          });
      } catch {}
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker),
  );
}
// Teto de itens por importação: sem isso, um arquivo de favoritos malicioso
// (não uma biblioteca real de usuário, que fica na casa das centenas/poucos
// milhares) poderia forçar centenas de milhares de INSERTs numa única
// requisição e travar o processo por minutos — o limite de 20mb no corpo (ver
// express.json acima) não limita a CONTAGEM de itens, só o texto bruto do
// HTML, que pode ser bem compacto e ainda assim descrever muitos itens.
const MAX_IMPORT_ITEMS = 20000;
function countNodes(nodes) {
  let total = 0;
  for (const node of nodes) {
    total++;
    if (node.type === "folder") total += countNodes(node.children);
  }
  return total;
}
app.post("/api/import", async (req, res) => {
  const html = req.body.html;
  if (typeof html !== "string" || !html.trim())
    throw Object.assign(new Error("Envie um arquivo de favoritos válido."), {
      status: 400,
    });
  const tree = parseBookmarksHtml(html);
  if (countNodes(tree) > MAX_IMPORT_ITEMS)
    throw Object.assign(
      new Error(`Esse arquivo tem itens demais (limite de ${MAX_IMPORT_ITEMS}).`),
      { status: 400 },
    );
  const rootFolders = tree.filter((n) => n.type === "folder");
  const rootLoose = tree.filter((n) => n.type === "bookmark");
  let collections = 0;
  let groups = 0;
  let bookmarks = 0;
  const pendingFavicons = [];
  async function importBookmarkNode(node, collectionId, groupId) {
    const created = await createImportedBookmark(node, collectionId, groupId);
    if (!created) return;
    bookmarks++;
    if (!created.favicon) pendingFavicons.push(created.id);
  }
  const newCollection = (name) =>
    prisma.collection.create({
      data: {
        name: name.slice(0, 120),
        description: "",
        color: "#8b5cf6",
        isPublic: false,
        shape: "rounded",
        behavior: "expansive",
        ownerId: req.owner.id,
      },
    });
  for (const folder of rootFolders) {
    const col = await newCollection(folder.name);
    collections++;
    for (const child of folder.children) {
      if (child.type === "bookmark") {
        await importBookmarkNode(child, col.id, null);
      } else if (child.type === "folder") {
        // "section" em vez do "tile" padrão: uma pasta importada vira uma divisória
        // com os favoritos visíveis direto na coleção, não escondidos atrás de um
        // ícone só (esse continua reservado pro agrupamento manual, arrastando um
        // favorito sobre outro).
        const grp = await prisma.bookmarkGroup.create({
          data: {
            name: child.name.slice(0, 120),
            color: "#8b5cf6",
            collectionId: col.id,
            display: "section",
          },
        });
        groups++;
        for (const bookmarkNode of flattenBookmarks(child.children))
          await importBookmarkNode(bookmarkNode, col.id, grp.id);
      }
    }
  }
  if (rootLoose.length) {
    const col = await newCollection("Importados");
    collections++;
    for (const bookmarkNode of rootLoose)
      await importBookmarkNode(bookmarkNode, col.id, null);
  }
  res.json({ collections, groups, bookmarks });
  // Segundo plano, depois de responder: buscar favicon de quem não trouxe um
  // embutido no arquivo (a maioria — só o Firefox embute). Importar centenas
  // de favoritos e ir à rede buscar o ícone de cada um antes de responder
  // deixaria a requisição lenta demais.
  void enrichImportedFavicons(pendingFavicons);
});
app.get("/api/export", async (req, res) => {
  const collections = await prisma.collection.findMany({
    where: { ownerId: req.owner.id },
    // Ver comentário equivalente em /api/public/:id.
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      bookmarks: { where: { groupId: null }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      groups: { include: { bookmarks: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } } },
    },
  });
  const html = buildBookmarksHtml(collections);
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Content-Disposition", 'attachment; filename="linkable-favoritos.html"');
  res.send(html);
});
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of limits)
    if (now - value.start > 60000) limits.delete(key);
  for (const [key, value] of apiLimits)
    if (now - value.start > 60000) apiLimits.delete(key);
}, 60000);
cleanup.unref();
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "Recurso não encontrado." }),
);
const isDev = (process.env.npm_lifecycle_event || "").startsWith("dev");
if (isDev) {
  app.use((_req, res) =>
    res.status(404).json({ error: "Esta porta serve apenas a API em desenvolvimento. Acesse http://localhost:3000." }),
  );
} else {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
}
app.use((error, _req, res, _next) => {
  console.error(error.message);
  res
    .status(error.status || 503)
    .json({
      error: error.status
        ? error.message
        : "Não foi possível acessar o banco de dados. Verifique a conexão e tente novamente.",
    });
});
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  app.listen(Number(process.env.PORT || 3001), () =>
    console.log("Linkable disponível na porta " + (process.env.PORT || 3001)),
  );
  // Só no servidor de verdade — importar este arquivo pra teste (ver
  // tests/api.test.mjs) não deve disparar checagens de link de fundo.
  scheduleLinkChecks(prisma);
  scheduleRetention(prisma);
}
