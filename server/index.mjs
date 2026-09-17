import "dotenv/config";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { installAuth } from "./auth.mjs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { metadata, normalizeUrl, resolveImage } from "./metadata.mjs";

const prisma = new PrismaClient();
export const app = express();
const developmentOrigins = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function hasAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (new URL(origin).host === req.headers.host) return true;
  return process.env.NODE_ENV !== "production" && developmentOrigins.has(origin);
}

app.disable("x-powered-by");
app.use(express.json({ limit: "3mb" }));
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
      bookmarks: { where: { isPublic: true }, orderBy: { createdAt: "asc" } },
    },
  });
  res.json({ collections });
});
// Public profiles stay accessible; all personal routes below require a session.
installAuth(app, prisma);
app.get("/api/collections", async (req, res) => {
  const collections = await prisma.collection.findMany({
    where: { ownerId: req.owner.id },
    include: { bookmarks: { orderBy: { createdAt: "asc" } } },
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
    : "circle";
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
app.post("/api/collections", async (req, res) =>
  res
    .status(201)
    .json(
      await prisma.collection.create({
        data: { ...fields(req.body), shape: shape(req.body), ownerId: req.owner.id },
        include: { bookmarks: true },
      }),
    ),
);
app.patch("/api/collections/:id", async (req, res) => {
  await collection(req, req.params.id);
  res.json(
    await prisma.collection.update({
      where: { id: req.params.id },
      data: { ...fields(req.body), shape: shape(req.body) },
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
        ? await resolveImage(req.body.favicon)
        : await metadata(req.body.url),
    );
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
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
