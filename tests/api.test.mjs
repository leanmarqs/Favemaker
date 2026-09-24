import test from "node:test";
import assert from "node:assert/strict";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import { randomBytes, createHash } from "node:crypto";
test(
  "CRUD, coleção obrigatória, isolamento e privacidade hierárquica",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { app } = await import("../server/index.mjs");
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const origin = `http://127.0.0.1:${server.address().port}`;
    const db = new PrismaClient();
    const owners = [];
    // Same-origin, como um navegador de verdade sempre manda em POST/PATCH/
    // DELETE (ao contrário do fetch do Node, que nunca inclui esse header
    // sozinho) — sem isso, hasAllowedOrigin em index.mjs rejeitaria toda
    // requisição de escrita destes testes por Origin ausente.
    function client(initialCookie = "") {
      let cookie = initialCookie;
      return async (path, method = "GET", body) => {
        const response = await fetch(base + path, {
          method,
          headers: { "Content-Type": "application/json", cookie, Origin: origin },
          body: body ? JSON.stringify(body) : undefined,
        });
        cookie = response.headers.get("set-cookie")?.split(";")[0] || cookie;
        return {
          status: response.status,
          data: response.status === 204 ? null : await response.json(),
        };
      };
    }
    const a = client(),
      b = client();
    const fields = {
      name: "Coleção teste",
      description: "",
      color: "#8b5cf6",
      isPublic: true,
    };
    try {
      assert.equal((await a("/collections")).status, 401);
      const username = `test_${Date.now()}`;
      const password = "test-password-12345";
      const email = `${username}@example.com`;
      assert.equal((await a("/auth/register", "POST", { acceptTerms: true, username, password })).status, 400);
      assert.equal((await a("/auth/register", "POST", { acceptTerms: true, username, password, email: "invalid" })).status, 400);
      // Sem aceite dos Termos/Política (LGPD) o cadastro é recusado.
      assert.equal((await a("/auth/register", "POST", { username, password, email })).status, 400);
      assert.equal((await a("/auth/register", "POST", { acceptTerms: true, username, password, email: ` ${email.toUpperCase()} ` })).status, 200);
      assert.equal((await b("/auth/register", "POST", { acceptTerms: true, username: `${username}_b`, password, email })).status, 409);
      assert.equal((await b("/auth/register", "POST", { acceptTerms: true, username: `${username}_b`, password, email: `${username}_b@example.com` })).status, 200);
      const owner = (await a("/collections")).data.ownerId;
      const exported = await a("/auth/me/export");
      assert.equal(exported.status, 200);
      assert.equal(exported.data.account.email, email);
      assert.ok(exported.data.account.termsVersion);
      assert.ok(exported.data.account.termsAcceptedAt);
      assert.equal(exported.data.account.passwordHash, undefined);
      // Relato de bug (menu Ajuda): texto curto demais é recusado; um válido
      // é guardado e aparece em "Baixar meus dados".
      assert.equal((await a("/bug-reports", "POST", { message: "curto" })).status, 400);
      assert.equal(
        (await a("/bug-reports", "POST", { message: "O botão de salvar não responde.", pageUrl: "http://localhost/", viewport: "1280x800" })).status,
        201,
      );
      assert.equal((await a("/auth/me/export")).data.bugReports.length, 1);
      owners.push(owner);
      assert.equal((await db.owner.findUnique({ where: { id: owner } })).email, email);
      owners.push((await b("/collections")).data.ownerId);
      const c = (await a("/collections", "POST", fields)).data;
      const bookmark = {
        ...fields,
        name: "Exemplo",
        collectionId: c.id,
        url: "example.com",
        favicon: "",
      };
      assert.equal(
        (await a("/bookmarks", "POST", { ...bookmark, collectionId: "" }))
          .status,
        404,
      );
      const publicBookmark = (await a("/bookmarks", "POST", bookmark)).data;
      // Um favorito não tem visibilidade própria — sempre herda da coleção
      // (ver comentário no schema.prisma). Mandar isPublic: false aqui não
      // deve esconder este favorito: ele aparece igual, porque a coleção `c`
      // continua pública.
      await a("/bookmarks", "POST", {
        ...bookmark,
        name: "Também herda a visibilidade da coleção",
        isPublic: false,
      });
      assert.equal(
        (await b(`/collections/${c.id}`, "PATCH", fields)).status,
        404,
      );
      assert.equal(
        (await b(`/bookmarks/${publicBookmark.id}`, "DELETE")).status,
        404,
      );
      assert.equal(
        (await b(`/public/${owner}`)).data.collections[0].bookmarks.length,
        2,
      );
      // Coleção privada: TODOS os favoritos somem da visão pública de uma vez
      // (nenhum tinha visibilidade própria pra continuar aparecendo sozinho).
      await a(`/collections/${c.id}`, "PATCH", { ...fields, isPublic: false });
      assert.equal((await b(`/public/${owner}`)).data.collections.length, 0);
      assert.equal(
        (
          await a(`/bookmarks/${publicBookmark.id}`, "PATCH", {
            ...bookmark,
            name: "Editado",
          })
        ).data.name,
        "Editado",
      );
      assert.equal(
        (await a(`/bookmarks/${publicBookmark.id}`, "DELETE")).status,
        204,
      );
      assert.equal((await a(`/collections/${c.id}`, "DELETE")).status, 204);
      assert.equal(
        await db.bookmark.count({ where: { collectionId: c.id } }),
        0,
      );
      assert.equal((await a("/auth/logout", "POST", {})).status, 204);
      assert.equal((await a("/collections")).status, 401);
      assert.equal((await a("/auth/login", "POST", { identifier: username, password: "wrong" })).status, 401);
      assert.equal((await a("/auth/login", "POST", { identifier: username, password })).status, 200);
      assert.equal((await a("/collections")).data.ownerId, owner);
      assert.equal((await a("/auth/me")).data.user.name, username);
      const legacyToken = randomBytes(32).toString("hex");
      const legacy = await db.owner.create({ data: { tokenHash: createHash("sha256").update(legacyToken).digest("hex") } });
      owners.push(legacy.id);
      const legacyCollection = await db.collection.create({ data: { ...fields, ownerId: legacy.id } });
      const migrated = client(`linkable_session=${legacyToken}`);
      assert.equal((await migrated("/auth/register", "POST", { acceptTerms: true, username: `${username}_legacy`, password, email: `${username}_legacy@example.com` })).status, 200);
      assert.equal((await migrated("/collections")).data.collections[0].id, legacyCollection.id);
      assert.equal((await client(`linkable_session=${legacyToken}`)("/collections")).status, 401);
      await db.session.updateMany({ where: { ownerId: owner }, data: { expiresAt: new Date(0) } });
      assert.equal((await a("/collections")).status, 401);
      const csrf = await fetch(base + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://untrusted.example" }, body: JSON.stringify({ username, password }) });
      assert.equal(csrf.status, 403);
    } finally {
      await db.owner.deleteMany({ where: { id: { in: owners } } });
      await db.$disconnect();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
