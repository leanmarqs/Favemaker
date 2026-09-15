import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
test(
  "CRUD, coleção obrigatória, isolamento e privacidade hierárquica",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    const { app } = await import("../server/index.mjs");
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const db = new PrismaClient();
    const owners = [];
    function client() {
      let cookie = "";
      return async (path, method = "GET", body) => {
        const response = await fetch(base + path, {
          method,
          headers: { "Content-Type": "application/json", cookie },
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
      color: "#b9ee78",
      isPublic: true,
    };
    try {
      const owner = (await a("/collections")).data.ownerId;
      owners.push(owner);
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
      await a("/bookmarks", "POST", {
        ...bookmark,
        name: "Privado",
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
        1,
      );
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
    } finally {
      await db.owner.deleteMany({ where: { id: { in: owners } } });
      await db.$disconnect();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
