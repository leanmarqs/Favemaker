import test from "node:test";
import assert from "node:assert/strict";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
test(
  "curtir/salvar/comentar na Comunidade persiste por dono e usa o perfil real do autor",
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
    try {
      assert.equal((await a("/community/state")).status, 401);
      const usernameA = `test_${Date.now()}_a`;
      const usernameB = `test_${Date.now()}_b`;
      const password = "test-password-12345";
      await a("/auth/register", "POST", {
        username: usernameA,
        password,
        email: `${usernameA}@example.com`,
      });
      await b("/auth/register", "POST", {
        username: usernameB,
        password,
        email: `${usernameB}@example.com`,
      });
      owners.push((await a("/collections")).data.ownerId);
      owners.push((await b("/collections")).data.ownerId);
      await a("/auth/me", "PATCH", { displayName: "Ana Real" });
      // Curtir a publicação mockada "p1": liga, depois desliga.
      assert.deepEqual(await a("/community/posts/p1/like", "POST"), {
        status: 200,
        data: { active: true },
      });
      assert.deepEqual((await a("/community/state")).data.likedPostIds, ["p1"]);
      // O dono B não vê a curtida do dono A — cada um tem seu próprio estado.
      assert.deepEqual((await b("/community/state")).data.likedPostIds, []);
      assert.deepEqual(await a("/community/posts/p1/like", "POST"), {
        status: 200,
        data: { active: false },
      });
      assert.deepEqual((await a("/community/state")).data.likedPostIds, []);
      // Salvar um item individual do card (favorito mockado).
      assert.equal((await a("/community/items/mock-b1/save", "POST")).data.active, true);
      assert.deepEqual((await a("/community/state")).data.savedItemIds, ["mock-b1"]);
      // Comentar de verdade: o autor retornado é o perfil real do dono logado,
      // não um usuário fictício — é a garantia de que o avatar mostrado no
      // feed é o mesmo salvo no perfil, nunca uma inicial genérica fixa.
      const created = await a("/community/posts/p1/comments", "POST", {
        text: "Comentário de teste",
      });
      assert.equal(created.status, 201);
      assert.equal(created.data.author.name, "Ana Real");
      assert.equal(created.data.author.username, usernameA);
      assert.equal(created.data.text, "Comentário de teste");
      const state = (await a("/community/state")).data;
      assert.equal(state.comments.p1.length, 1);
      assert.equal(state.comments.p1[0].id, created.data.id);
      // Curtir/salvar o próprio comentário criado.
      assert.equal(
        (await a(`/community/comments/${created.data.id}/like`, "POST")).data.active,
        true,
      );
      assert.equal(
        (await a(`/community/comments/${created.data.id}/save`, "POST")).data.active,
        true,
      );
      assert.deepEqual((await a("/community/state")).data.likedCommentIds, [created.data.id]);
      // O dono B também consegue ver e comentar o mesmo post (comentários não
      // são isolados por dono, só as curtidas/salvamentos são).
      const commentB = await b("/community/posts/p1/comments", "POST", { text: "Oi!" });
      assert.equal(commentB.status, 201);
      assert.equal((await a("/community/state")).data.comments.p1.length, 2);
      // Texto vazio ou longo demais é rejeitado.
      assert.equal((await a("/community/posts/p1/comments", "POST", { text: "  " })).status, 400);
      assert.equal(
        (await a("/community/posts/p1/comments", "POST", { text: "x".repeat(501) })).status,
        400,
      );
      // postId inválido (vazio) é rejeitado.
      assert.equal((await a("/community/posts//like", "POST")).status, 404);
    } finally {
      await db.owner.deleteMany({ where: { id: { in: owners } } });
      await db.$disconnect();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
test(
  "caixa de comentários: sanitização, spam, limite de envio, duplicidade, denúncia com ocultação, bloqueio e exclusão",
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
    async function registerAndLogin(tag) {
      const c = client();
      const username = `test_${Date.now()}_${tag}_${Math.random().toString(36).slice(2, 7)}`;
      await c("/auth/register", "POST", {
        username,
        password: "test-password-12345",
        email: `${username}@example.com`,
      });
      const ownerId = (await c("/collections")).data.ownerId;
      owners.push(ownerId);
      return { c, ownerId, username };
    }
    try {
      const author = await registerAndLogin("author");
      const reporter1 = await registerAndLogin("rep1");
      const reporter2 = await registerAndLogin("rep2");
      const reporter3 = await registerAndLogin("rep3");

      // Sanitização: caracteres de controle/largura-zero somem e espaço/linha
      // em excesso "achata" — sem exigir que o cliente já mande limpo.
      const dirty = "Olá​ mundo\n\n\n\n\ncom\t\t\t\tespaço\u0007 estranho";
      const cleaned = await author.c("/community/posts/p2/comments", "POST", { text: dirty });
      assert.equal(cleaned.status, 201);
      assert.ok(!cleaned.data.text.includes("​"));
      assert.ok(!/\n{3,}/.test(cleaned.data.text));
      assert.ok(!/[ \t]{3,}/.test(cleaned.data.text));

      // Padrão de spam: link em excesso e caractere repetido em flood.
      assert.equal(
        (
          await author.c("/community/posts/p2/comments", "POST", {
            text: "olha isso http://a.com http://b.com http://c.com",
          })
        ).status,
        400,
      );
      assert.equal(
        (await author.c("/community/posts/p2/comments", "POST", { text: "a".repeat(40) })).status,
        400,
      );

      // Duplicidade: o mesmo texto, no mesmo post, em sequência rápida é rejeitado (429).
      const dup = await registerAndLogin("dup");
      const first = await dup.c("/community/posts/p3/comments", "POST", { text: "Repetido" });
      assert.equal(first.status, 201);
      assert.equal(
        (await dup.c("/community/posts/p3/comments", "POST", { text: "Repetido" })).status,
        429,
      );
      // Texto diferente no mesmo post não é bloqueado pela checagem de duplicidade.
      assert.equal(
        (await dup.c("/community/posts/p3/comments", "POST", { text: "Diferente" })).status,
        201,
      );

      // Limite de comentários por minuto: a sexta postagem em sequência do
      // mesmo dono é recusada, mesmo com texto sempre diferente (não é a
      // checagem de duplicidade que está barrando).
      const flooder = await registerAndLogin("flood");
      for (let i = 0; i < 5; i++)
        assert.equal(
          (await flooder.c("/community/posts/p4/comments", "POST", { text: `Comentário ${i}` }))
            .status,
          201,
        );
      assert.equal(
        (await flooder.c("/community/posts/p4/comments", "POST", { text: "Comentário extra" }))
          .status,
        429,
      );

      // Denúncia: o próprio autor não pode denunciar o próprio comentário.
      const target = await author.c("/community/posts/p1/comments", "POST", {
        text: "Comentário que vai ser denunciado",
      });
      assert.equal(target.status, 201);
      const commentId = target.data.id;
      assert.equal((await author.c(`/community/comments/${commentId}/report`, "POST")).status, 400);

      // Duas denúncias (abaixo do limiar de 3) ainda não ocultam pra ninguém.
      assert.equal((await reporter1.c(`/community/comments/${commentId}/report`, "POST")).status, 200);
      assert.equal((await reporter2.c(`/community/comments/${commentId}/report`, "POST")).status, 200);
      assert.ok(!(await author.c("/community/state")).data.hiddenCommentIds.includes(commentId));
      // Denunciar de novo (mesmo dono) é idempotente — não conta duas vezes.
      assert.equal((await reporter1.c(`/community/comments/${commentId}/report`, "POST")).status, 200);
      assert.ok(!(await author.c("/community/state")).data.hiddenCommentIds.includes(commentId));
      // A terceira denúncia de um dono DISTINTO passa do limiar: o comentário
      // fica oculto pra qualquer um que carregar o estado, autor incluso.
      assert.equal((await reporter3.c(`/community/comments/${commentId}/report`, "POST")).status, 200);
      assert.ok((await author.c("/community/state")).data.hiddenCommentIds.includes(commentId));
      assert.ok((await reporter1.c("/community/state")).data.hiddenCommentIds.includes(commentId));

      // Bloqueio: reporter1 bloqueia o autor; o id dele passa a aparecer em
      // blockedAuthorIds SÓ pra quem bloqueou. Bloquear a si mesmo é recusado.
      assert.equal((await reporter1.c(`/community/users/${author.ownerId}/block`, "POST")).status, 200);
      assert.deepEqual((await reporter1.c("/community/state")).data.blockedAuthorIds, [
        author.ownerId,
      ]);
      assert.deepEqual((await reporter2.c("/community/state")).data.blockedAuthorIds, []);
      assert.equal(
        (await reporter1.c(`/community/users/${reporter1.ownerId}/block`, "POST")).status,
        400,
      );
      // Desbloquear (mesmo POST, alterna): blockedAuthorIds volta a ficar vazio.
      assert.equal((await reporter1.c(`/community/users/${author.ownerId}/block`, "POST")).status, 200);
      assert.deepEqual((await reporter1.c("/community/state")).data.blockedAuthorIds, []);

      // Exclusão: só o próprio autor consegue excluir o comentário; um
      // comentário fictício (id fixo do communityMock.ts) não existe no
      // banco, então tentar excluir um retorna 404, não um 500.
      assert.equal((await reporter1.c(`/community/comments/${commentId}`, "DELETE")).status, 404);
      assert.equal((await author.c(`/community/comments/${commentId}`, "DELETE")).status, 204);
      assert.equal((await author.c("/community/comments/c1", "DELETE")).status, 404);
    } finally {
      await db.owner.deleteMany({ where: { id: { in: owners } } });
      await db.$disconnect();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
test(
  "menu da publicação: seguir, denunciar com ocultação, cartão de perfil (seguidores/data da conta)",
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
    async function registerAndLogin(tag) {
      const c = client();
      const username = `test_${Date.now()}_${tag}_${Math.random().toString(36).slice(2, 7)}`;
      await c("/auth/register", "POST", {
        username,
        password: "test-password-12345",
        email: `${username}@example.com`,
      });
      const ownerId = (await c("/collections")).data.ownerId;
      owners.push(ownerId);
      return { c, ownerId, username };
    }
    try {
      const fan1 = await registerAndLogin("fan1");
      const fan2 = await registerAndLogin("fan2");
      const fan3 = await registerAndLogin("fan3");
      const mockAuthorId = "u1"; // Marina Alves, ver communityMock.ts

      // Info de conta pra um id sem Owner por trás (autor fictício do feed):
      // 0 seguidores, memberSince null — o cliente mostra "conta de demonstração".
      const infoBefore = await fan1.c(`/community/users/${mockAuthorId}`);
      assert.equal(infoBefore.status, 200);
      assert.equal(infoBefore.data.followerCount, 0);
      assert.equal(infoBefore.data.memberSince, null);

      // Seguir é um toggle simples, sem checagem de dono/existência do autor.
      assert.equal((await fan1.c(`/community/users/${mockAuthorId}/follow`, "POST")).data.active, true);
      assert.equal((await fan2.c(`/community/users/${mockAuthorId}/follow`, "POST")).data.active, true);
      assert.deepEqual((await fan1.c("/community/state")).data.followedAuthorIds, [mockAuthorId]);
      const infoAfter = await fan3.c(`/community/users/${mockAuthorId}`);
      assert.equal(infoAfter.data.followerCount, 2);
      // Deixar de seguir também é o mesmo POST, alternando de volta.
      assert.equal((await fan1.c(`/community/users/${mockAuthorId}/follow`, "POST")).data.active, false);
      assert.equal((await fan3.c(`/community/users/${mockAuthorId}`)).data.followerCount, 1);

      // Info de conta pra um dono de verdade: memberSince vem preenchido.
      const infoOwner = await fan1.c(`/community/users/${fan2.ownerId}`);
      assert.equal(infoOwner.status, 200);
      assert.ok(infoOwner.data.memberSince);

      // Denúncia de PUBLICAÇÃO com o mesmo limiar de ocultação automática dos
      // comentários — mas aqui é por postId (mock), sem checagem de "próprio
      // autor" (posts não têm dono real por trás ainda).
      const postId = "p1";
      assert.equal((await fan1.c(`/community/posts/${postId}/report`, "POST")).status, 200);
      assert.ok(!(await fan1.c("/community/state")).data.hiddenPostIds.includes(postId));
      assert.equal((await fan2.c(`/community/posts/${postId}/report`, "POST")).status, 200);
      assert.ok(!(await fan1.c("/community/state")).data.hiddenPostIds.includes(postId));
      assert.equal((await fan3.c(`/community/posts/${postId}/report`, "POST")).status, 200);
      assert.ok((await fan1.c("/community/state")).data.hiddenPostIds.includes(postId));
      assert.ok((await fan2.c("/community/state")).data.reportedPostIds.includes(postId));
    } finally {
      await db.owner.deleteMany({ where: { id: { in: owners } } });
      await db.$disconnect();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
