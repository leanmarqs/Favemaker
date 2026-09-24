// Gera os pacotes da extensão prontos pra enviar às lojas:
//
//   npm run pack:extension -- https://seudominio.com
//   (ou EXTENSION_BASE_URL=https://seudominio.com npm run pack:extension)
//
// Saída em dist-extension/:
//   linkable-<versão>-chromium.zip  → Microsoft Edge Add-ons e Chrome Web Store
//   linkable-<versão>-firefox.zip   → addons.mozilla.org
//
// A pasta extension/ continua apontando pra localhost (desenvolvimento); só
// os pacotes gerados aqui recebem a URL de produção. O que muda em cada um:
// - shared.js: DEFAULT_BASE_URL vira a URL informada;
// - manifest.json: host_permissions só com a origem de produção (as lojas
//   recusam permissão pra localhost sem motivo);
// - README.md fica de fora;
// - Firefox: background.scripts no lugar de service_worker (o Firefox ainda
//   não aceita service worker de extensão) e browser_specific_settings.gecko
//   (id obrigatório + declaração de coleta de dados exigida pela AMO).
import { readFile, readdir, mkdir, writeFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { deflateRawSync, crc32 } from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SOURCE = join(ROOT, "extension");
const OUT = join(ROOT, "dist-extension");
const EXCLUDE = new Set(["README.md", ".DS_Store", "Thumbs.db"]);

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

const rawUrl = process.argv[2] || process.env.EXTENSION_BASE_URL;
if (!rawUrl)
  fail("Informe a URL de produção: npm run pack:extension -- https://seudominio.com");
let baseUrl;
try {
  baseUrl = new URL(rawUrl);
} catch {
  fail(`URL inválida: ${rawUrl}`);
}
if (baseUrl.protocol !== "https:")
  fail("A URL de produção precisa ser https:// (o cookie de sessão é Secure em produção).");
const origin = baseUrl.origin;

// ---------- arquivos da extensão ----------
async function listFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else out.push(full);
  }
  return out;
}

const files = new Map(); // caminho no zip (com "/") → Buffer
for (const full of await listFiles(SOURCE))
  files.set(relative(SOURCE, full).split(sep).join("/"), await readFile(full));

const shared = files.get("shared.js")?.toString("utf8");
const DEFAULT_LINE = /export const DEFAULT_BASE_URL = "[^"]*";/;
if (!shared || !DEFAULT_LINE.test(shared))
  fail("Não achei `export const DEFAULT_BASE_URL = \"...\";` em extension/shared.js.");
files.set(
  "shared.js",
  Buffer.from(shared.replace(DEFAULT_LINE, `export const DEFAULT_BASE_URL = "${origin}";`)),
);

const manifest = JSON.parse(files.get("manifest.json").toString("utf8"));
const version = manifest.version;
manifest.host_permissions = [`${origin}/*`];

// ---------- zip (store/deflate, sem dependências) ----------
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}
function buildZip(entries) {
  const { time, day } = dosDateTime(new Date());
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versão necessária
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // feito por
    central.writeUInt16LE(20, 6); // versão necessária
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }
  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function withManifest(m) {
  const entries = new Map(files);
  entries.set("manifest.json", Buffer.from(JSON.stringify(m, null, 2) + "\n"));
  // manifest.json primeiro, só por organização.
  return [...entries].sort(([a], [b]) =>
    a === "manifest.json" ? -1 : b === "manifest.json" ? 1 : a.localeCompare(b),
  );
}

// ---------- Chromium (Edge + Chrome) ----------
const chromium = structuredClone(manifest);

// ---------- Firefox ----------
const firefox = structuredClone(manifest);
const worker = firefox.background?.service_worker;
if (worker)
  firefox.background = {
    scripts: [worker],
    ...(firefox.background.type ? { type: firefox.background.type } : {}),
  };
firefox.browser_specific_settings = {
  gecko: {
    // Id fixo e permanente da extensão na AMO — não mude depois de publicar.
    id: process.env.EXTENSION_GECKO_ID || `linkable@${baseUrl.hostname}`,
    strict_min_version: "128.0",
    // Declaração de coleta de dados exigida pela AMO pra extensões novas:
    // a extensão usa o cookie de sessão do Linkable (autenticação) e envia
    // endereço/título/imagem da página que a pessoa escolhe salvar.
    data_collection_permissions: {
      required: ["authenticationInfo", "websiteContent", "browsingActivity"],
    },
  },
};

await mkdir(OUT, { recursive: true });
const outputs = [
  [`linkable-${version}-chromium.zip`, chromium],
  [`linkable-${version}-firefox.zip`, firefox],
];
for (const [name, m] of outputs) {
  const path = join(OUT, name);
  await writeFile(path, buildZip(withManifest(m)));
  const { size } = await stat(path);
  console.log(`✔ ${relative(ROOT, path)}  (${(size / 1024).toFixed(1)} KB)`);
}
console.log(`\nURL de produção: ${origin}  ·  versão ${version}`);
console.log("Lembre de subir \"version\" em extension/manifest.json a cada envio novo às lojas.");
