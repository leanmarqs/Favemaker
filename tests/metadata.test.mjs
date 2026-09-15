import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { encodeIco } from "icojs";
import {
  normalizeUrl,
  isPublicAddress,
  safeFetch,
  resolveImage,
} from "../server/metadata.mjs";
test("normaliza links e rejeita protocolos inadequados", () => {
  assert.equal(
    normalizeUrl("example.com/pagina"),
    "https://example.com/pagina",
  );
  assert.throws(() => normalizeUrl("https://user:pass@example.com"));
});
test("bloqueia endereços internos, locais e IPv4 mapeado", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "192.168.0.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
  ])
    assert.equal(isPublicAddress(ip), false);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  await assert.rejects(safeFetch("http://127.0.0.1/"));
});
test("converte imagem local para PNG e extrai a cor predominante", async () => {
  const source = await sharp({
    create: { width: 24, height: 24, channels: 4, background: "#ee2222" },
  })
    .png()
    .toBuffer();
  const result = await resolveImage(
    `data:image/png;base64,${source.toString("base64")}`,
  );
  assert.match(result.favicon, /^data:image\/png;base64,/);
  assert.ok(parseInt(result.color.slice(1, 3), 16) > 200);
  await assert.rejects(resolveImage("data:text/html;base64,PGgxPk9pPC9oMT4="));
});

test("decodifica arquivos ICO enviados pelo usuário", async () => {
  const png = await sharp({ create: { width: 16, height: 16, channels: 4, background: '#2299ee' } }).png().toBuffer();
  const ico = await encodeIco([{ buffer: png }]);
  const result = await resolveImage(`data:image/x-icon;base64,${Buffer.from(ico).toString('base64')}`);
  assert.match(result.favicon, /^data:image\/png;base64,/);
});
