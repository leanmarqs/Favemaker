import "dotenv/config";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { installAuth } from "./auth.mjs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { metadata, normalizeUrl, resolveImage } from "./metadata.mjs";
import { parseBookmarksHtml, buildBookmarksHtml } from "./bookmarksFile.mjs";

const prisma = new PrismaClient();
export const app = express();
const developmentOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

// Origens de extensões de navegador (ex: a extensão "Salvar no Pinicon"). Uma página
// maliciosa nunca tem essa origem — só uma extensão instalada pelo próprio usuário.
function isExtensionOrigin(origin) {
  return /^(chrome|moz)-extension:\/\//.test(origin || "");
}

function hasAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (new URL(origin).host === req.headers.host) return true;
  if (isExtensionOrigin(origin)) return true;
  return process.env.NODE_ENV !== "production" && developmentOrigins.has(origin);
}

app.disable("x-powered-by");
// 20mb (não 3mb): um export de favoritos do Firefox embute o favicon de cada
// item como data URI dentro do próprio HTML, e pode passar de alguns MB numa
// biblioteca grande — /api/import recebe esse HTML inteiro como corpo JSON.
app.use(express.json({ limit: "20mb" }));
// CORS para extensões de navegador: elas rodam numa origem própria (chrome-extension://…)
// e autenticam com o header X-Pinicon-Session (ver cookieToken em auth.mjs) em vez do
// cookie de sessão, então precisam de uma resposta CORS explícita para ler o resultado.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isExtensionOrigin(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Headers", "Content-Type, X-Pinicon-Session");
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
app.get("/api/public/:id", async (req, res) => {
  const collections = await prisma.collection.findMany({
    where: { ownerId: req.params.id, isPublic: true },
    include: {
      bookmarks: {
        where: { isPublic: true, groupId: null },
        orderBy: { createdAt: "asc" },
      },
      groups: {
        include: {
          bookmarks: { where: { isPublic: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  res.json({ collections });
});
// Public profiles stay accessible; all personal routes below require a session.
installAuth(app, prisma);
app.get("/api/collections", async (req, res) => {
  const collections = await prisma.collection.findMany({
    where: { ownerId: req.owner.id },
    include: {
      bookmarks: { where: { groupId: null }, orderBy: { createdAt: "asc" } },
      groups: { include: { bookmarks: { orderBy: { createdAt: "asc" } } } },
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
  return { name: body.name.trim(), color: body.color || "#b9ee78" };
}
app.post("/api/collections", async (req, res) =>
  res
    .status(201)
    .json(
      await prisma.collection.create({
        data: {
          ...fields(req.body),
          shape: shape(req.body),
          behavior: behavior(req.body),
          ownerId: req.owner.id,
        },
        include: { bookmarks: true },
      }),
    ),
);
app.patch("/api/collections/:id", async (req, res) => {
  await collection(req, req.params.id);
  res.json(
    await prisma.collection.update({
      where: { id: req.params.id },
      data: { ...fields(req.body), shape: shape(req.body), behavior: behavior(req.body) },
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
  const data = fields(req.body);
  let url;
  let icon;
  try {
    url = normalizeUrl(req.body.url);
    icon = await resolveImage(req.body.favicon);
  } catch (e) {
    throw Object.assign(e, { status: 400 });
  }
  return {
    ...data,
    url,
    favicon: icon.favicon,
    collectionId: req.body.collectionId,
  };
}
app.post("/api/bookmarks", async (req, res) =>
  res
    .status(201)
    .json(await prisma.bookmark.create({ data: await bookmarkFields(req) })),
);
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
  const bookmarkIds = Array.isArray(req.body.bookmarkIds)
    ? req.body.bookmarkIds
    : [];
  if (bookmarkIds.length < 2)
    throw Object.assign(new Error("Selecione ao menos dois favoritos."), {
      status: 400,
    });
  const created = await prisma.$transaction(async (tx) => {
    const grp = await tx.bookmarkGroup.create({
      data: { ...data, collectionId: col.id },
    });
    const { count } = await tx.bookmark.updateMany({
      where: { id: { in: bookmarkIds }, collectionId: col.id },
      data: { groupId: grp.id },
    });
    if (count !== bookmarkIds.length)
      throw Object.assign(new Error("Um ou mais favoritos são inválidos."), {
        status: 400,
      });
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
  await group(req, req.params.id);
  // onDelete: SetNull no schema já devolve os favoritos pra fora do grupo.
  await prisma.bookmarkGroup.delete({ where: { id: req.params.id } });
  res.sendStatus(204);
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
// Achata pastas aninhadas além de um nível: o Pinicon só tem coleção → grupo →
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
      color: "#b9ee78",
      isPublic: false,
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
app.post("/api/import", async (req, res) => {
  const html = req.body.html;
  if (typeof html !== "string" || !html.trim())
    throw Object.assign(new Error("Envie um arquivo de favoritos válido."), {
      status: 400,
    });
  const tree = parseBookmarksHtml(html);
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
        color: "#b9ee78",
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
        const grp = await prisma.bookmarkGroup.create({
          data: {
            name: child.name.slice(0, 120),
            color: "#b9ee78",
            collectionId: col.id,
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
    include: {
      bookmarks: { where: { groupId: null }, orderBy: { createdAt: "asc" } },
      groups: { include: { bookmarks: { orderBy: { createdAt: "asc" } } } },
    },
  });
  const html = buildBookmarksHtml(collections);
  res.set("Content-Type", "text/html; charset=utf-8");
  res.set("Content-Disposition", 'attachment; filename="pinicon-favoritos.html"');
  res.send(html);
});
const cleanup = setInterval(() => {
  for (const [key, value] of limits)
    if (Date.now() - value.start > 60000) limits.delete(key);
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
)
  app.listen(Number(process.env.PORT || 3001), () =>
    console.log("Pinicon disponível na porta " + (process.env.PORT || 3001)),
  );
