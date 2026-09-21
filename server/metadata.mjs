import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
import { load } from "cheerio";
import sharp from "sharp";
import { decodeIco, isIco } from "icojs";

// Nunca fazem parte da identidade do conteúdo (que mora inteira no path:
// /video/ID, /status/ID, /p/CODIGO, /permalink/ID, ...) — só rastreamento de
// origem que cada rede social anexa de um jeito diferente dependendo de como
// o link foi copiado (barra de endereço vs. botão "Compartilhar"). Remover
// isso deixa o favorito salvo com a URL limpa e elimina essa como possível
// causa de variação entre as duas formas de pegar o mesmo link.
const TRACKING_PARAMS = new Set([
  "is_from_webapp",
  "sender_device",
  "s",
  "t",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "igshid",
  "igsh",
  "stkn",
  "fbclid",
  "ref",
  "ref_src",
  "mibextid",
]);
export function normalizeUrl(value) {
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !url.hostname.includes(".")
  )
    throw new Error("Informe uma URL pública válida.");
  for (const key of [...url.searchParams.keys()])
    if (TRACKING_PARAMS.has(key) || key.startsWith("__"))
      url.searchParams.delete(key);
  return url.href;
}
export function isPublicAddress(address) {
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress())
    parsed = parsed.toIPv4Address();
  return parsed.range() === "unicast";
}
const DEFAULT_UA = "Pinicon/1.0";
// Vários sites (TikTok, Instagram, ...) servem a página praticamente vazia pra
// um fetch de servidor genérico — o conteúdo real só existe depois de JS rodar
// no navegador — mas reconhecem esse User-Agent de crawler de preview social
// conhecido e respondem com og:title/og:image/og:description completos,
// porque é assim que eles fazem a própria prévia funcionar no WhatsApp/
// Facebook/etc. Não é o padrão: alguns sites (ex.: Magazine Luiza) bloqueiam
// esse UA especificamente mesmo em assets estáticos que liberam pra um UA
// genérico — por isso só é usado como segunda tentativa (ver fetchDocument).
const CRAWLER_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
// Faz a requisição de fato fixada num único IP já validado (proteção contra
// DNS rebinding: nunca deixa o socket resolver o hostname de novo).
function fetchAddress(url, address, timeoutMs, userAgent, truncate) {
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).get(
      url,
      {
        headers: { "User-Agent": userAgent, "Accept-Encoding": "identity" },
        lookup: (_host, options, callback) =>
          options.all
            ? callback(null, [address])
            : callback(null, address.address, address.family),
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024) {
            if (truncate) {
              // Só o <head> importa pra og:title/og:image/favicon — corta o
              // download aqui em vez de falhar a página inteira. Sem isso,
              // páginas legítimas mas pesadas (ex.: um canal do YouTube passa
              // de 2MB só de JSON embutido que não usamos) nunca tinham
              // metadado nenhum extraído, mesmo com og:title/og:image logo
              // no começo do HTML.
              res.destroy();
              resolve({
                status: res.statusCode,
                headers: res.headers,
                buffer: Buffer.concat(chunks),
                url: url.href,
              });
            } else {
              req.destroy(new Error("Arquivo muito grande."));
            }
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            buffer: Buffer.concat(chunks),
            url: url.href,
          }),
        );
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("Tempo de consulta esgotado.")),
      timeoutMs,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
  });
}
// Resolve e fixa o IP em cada requisição, inclusive após redirecionamentos.
// truncate: usado só pelo fetch de HTML pra extrair metadados (fetchDocument)
// — nunca pra baixar imagens (resolveImage precisa dos bytes completos).
export async function safeFetch(
  value,
  redirects = 0,
  userAgent = DEFAULT_UA,
  truncate = false,
) {
  if (redirects > 3) throw new Error("Muitos redirecionamentos.");
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error("Endereço não permitido.");
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), {
    all: true,
  });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error("Endereço não permitido.");
  // IPv4 primeiro: em vários ambientes de hospedagem o registro AAAA existe no
  // DNS mas a rota IPv6 não é alcançável de fato — sem esse fallback, um site
  // com os dois tipos de endereço trava até estourar o timeout preso nesse
  // primeiro IP quebrado, mesmo com o IPv4 respondendo instantaneamente (foi
  // exatamente isso que fez o favicon da Magazine Luiza não ser encontrado).
  const ordered = [...addresses].sort((a, b) => a.family - b.family).slice(0, 3);
  let result;
  for (let i = 0; i < ordered.length; i++) {
    try {
      result = await fetchAddress(
        url,
        ordered[i],
        i === ordered.length - 1 ? 4500 : 2500,
        userAgent,
        truncate,
      );
      break;
    } catch (error) {
      if (i === ordered.length - 1) throw error;
    }
  }
  if (result.status >= 300 && result.status < 400 && result.headers.location)
    return safeFetch(
      new URL(result.headers.location, url).href,
      redirects + 1,
      userAgent,
      truncate,
    );
  if (result.status !== 200)
    throw new Error("Não foi possível consultar o site.");
  return result;
}
export async function imageData(buffer, { crop = "inside" } = {}) {
  if (isIco(buffer)) {
    if (buffer.readUInt16LE(4) > 32) throw new Error("O ícone contém imagens demais.");
    const images = await decodeIco(buffer, "image/png");
    images.sort((a, b) => b.width * b.height - a.width * a.height);
    if (!images.length) throw new Error("Arquivo ICO inválido.");
    buffer = Buffer.from(images[0].buffer);
  }
  // "cover" é usado pra imagem de conteúdo (og:image de um post específico): ela
  // quase nunca é quadrada, e o Pinicon mostra o favorito num círculo — em vez de
  // encolher mantendo a proporção (sobraria fundo/letterbox), recorta um quadrado
  // central com a estratégia "attention" do sharp, que tenta manter a região mais
  // relevante da imagem (bordas costumam ter só texto/gradiente decorativo).
  // 256px (não 128) porque o card de prévia grande mostra essa mesma imagem
  // numa área de ~220px de largura — em tela retina isso pede quase o dobro
  // disso em pixels reais, e sites que já oferecem ícone grande (apple-touch-icon,
  // manifest) não devem ser reduzidos à toa antes de guardar.
  const png = await sharp(buffer, { limitInputPixels: 16000000 })
    .resize(
      256,
      256,
      crop === "cover"
        ? { fit: "cover", position: sharp.strategy.attention }
        : { fit: "inside", withoutEnlargement: true },
    )
    .png()
    .toBuffer();
  const { dominant } = await sharp(png).stats();
  const color =
    "#" +
    [dominant.r, dominant.g, dominant.b]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
  return { favicon: `data:image/png;base64,${png.toString("base64")}`, color };
}
export async function resolveImage(value, options) {
  if (!value) return { favicon: "", color: "#a3b99a" };
  if (value.startsWith("data:")) {
    if (
      !/^data:image\/(png|jpeg|webp|gif|x-icon|vnd.microsoft.icon);base64,/.test(
        value,
      )
    )
      throw new Error("Use uma imagem PNG, JPEG, WebP, GIF ou ICO.");
    return imageData(Buffer.from(value.split(",")[1], "base64"), options);
  }
  return imageData((await safeFetch(value)).buffer, options);
}
// Primeira tentativa com o UA genérico (o mesmo usado pra favicon/manifest).
// Checa especificamente og:title (não a <title> comum): sites como o TikTok
// mandam uma página cheia de conteúdo pra qualquer UA, só que sem preencher o
// og:title/og:image do vídeo específico — esses só aparecem pra um crawler de
// preview social conhecido. Só troca pelo resultado da segunda tentativa se
// ela de fato achar um og:title (senão o site simplesmente não usa Open Graph,
// e o resultado original — que pode ter vindo com mais dados que o do crawler
// em sites que servem menos conteúdo pra bots — é mantido).
async function fetchDocument(url) {
  const page = await safeFetch(url, 0, DEFAULT_UA, true);
  const $ = load(page.buffer.toString("utf8"));
  if ($('meta[property="og:title"]').attr("content")) return { page, $ };
  try {
    const retried = await safeFetch(url, 0, CRAWLER_UA, true);
    const $retried = load(retried.buffer.toString("utf8"));
    if ($retried('meta[property="og:title"]').attr("content"))
      return { page: retried, $: $retried };
  } catch {}
  return { page, $ };
}
export async function metadata(value) {
  const url = normalizeUrl(value);
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  let title = hostname,
    description = "",
    contentImage = "";
  const candidates = [];
  try {
    const { page, $ } = await fetchDocument(url);
    title =
      $('meta[property="og:title"]').attr("content") ||
      $("title").text().trim() ||
      hostname;
    description =
      $('meta[name="description"]').attr("content") ||
      $('meta[property="og:description"]').attr("content") ||
      "";
    const base = new URL($("base").attr("href") || page.url, page.url);
    // Numa home genérica (path "/" sem og:type específico), o og:image costuma ser
    // um banner de marketing sem relação com nenhum conteúdo — o favicon do site
    // identifica melhor "de que site é" do que essa captura genérica. Já num post,
    // artigo ou vídeo específico, o og:image É o conteúdo, e vale mais que o favicon
    // do site (que seria igual em qualquer outra página do mesmo site).
    const isRootPath = ["/", ""].includes(new URL(page.url).pathname);
    const ogType = $('meta[property="og:type"]').attr("content");
    const looksLikeGenericHome = isRootPath && (!ogType || ogType === "website");
    if (!looksLikeGenericHome) {
      const ogImage =
        $('meta[property="og:image"]').attr("content") ||
        $('meta[name="twitter:image"]').attr("content");
      if (ogImage) {
        try {
          contentImage = new URL(ogImage, base).href;
        } catch {}
      }
    }
    $("link[rel]").each((_, el) => {
      const rel = $(el).attr("rel") || "";
      const href = $(el).attr("href") || "";
      if (/(^|\s)(icon|apple-touch-icon|shortcut)(\s|$)/i.test(rel)) {
        try {
          // SVG é vetorial: fica nítido em qualquer tamanho que a gente peça pro
          // sharp renderizar, então sempre vence os candidatos raster (PNG/ICO)
          // na ordenação por "size", mesmo quando o site declara sizes="any".
          const isSvg =
            $(el).attr("type") === "image/svg+xml" || /\.svg(\?|$)/i.test(href);
          candidates.push({
            url: new URL(href, base).href,
            size: isSvg
              ? Infinity
              : parseInt($(el).attr("sizes")) ||
                (rel.includes("apple") ? 180 : 32),
          });
        } catch {}
      }
    });
    const manifest = $('link[rel="manifest"]').attr("href");
    if (manifest) {
      try {
        const response = await safeFetch(new URL(manifest, base).href);
        const data = JSON.parse(response.buffer.toString());
        for (const icon of (data.icons || []).slice(0, 5))
          candidates.push({
            url: new URL(icon.src, response.url).href,
            size: parseInt(icon.sizes) || 32,
          });
      } catch {}
    }
  } catch {}
  candidates.sort((a, b) => b.size - a.size);
  candidates.push({ url: new URL("/favicon.ico", url).href });
  const unique = [...new Set(candidates.map((c) => c.url))].slice(0, 6);
  // Tentativas simultâneas (pra não pagar duas viagens sequenciais quando a
  // primeira falhar), mas a ordem do array decide a prioridade: a imagem de
  // conteúdo (quando existe) vem antes dos ícones do site.
  const attempts = contentImage
    ? [{ url: contentImage, crop: "cover" }, ...unique.map((u) => ({ url: u, crop: "inside" }))]
    : unique.map((u) => ({ url: u, crop: "inside" }));
  const images = await Promise.allSettled(
    attempts.map((a) => resolveImage(a.url, { crop: a.crop })),
  );
  const foundIndex = images.findIndex((r) => r.status === "fulfilled");
  const found = foundIndex >= 0 ? images[foundIndex] : undefined;
  // A extensão usa isso pra decidir se vale a pena reforçar a imagem lendo o
  // DOM da aba ativa: quando o servidor já conseguiu a imagem de conteúdo
  // (og:image) buscando a página do zero, esse resultado é mais confiável do
  // que o DOM ao vivo, que pode estar com meta tags desatualizadas depois de
  // uma navegação client-side dentro de uma SPA (o site só garante atualizar
  // isso numa recarga completa) — ver popup.js na extensão.
  const usedContentImage = Boolean(contentImage) && foundIndex === 0;
  return {
    url,
    name: title.slice(0, 120),
    description: description.slice(0, 2000),
    usedContentImage,
    ...(found?.value || { favicon: "", color: "#a3b99a" }),
  };
}
