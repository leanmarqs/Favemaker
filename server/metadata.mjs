import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
import { load } from "cheerio";
import sharp from "sharp";
import { decodeIco, isIco } from "icojs";

export function normalizeUrl(value) {
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !url.hostname.includes(".")
  )
    throw new Error("Informe uma URL pública válida.");
  return url.href;
}
export function isPublicAddress(address) {
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === "ipv6" && parsed.isIPv4MappedAddress())
    parsed = parsed.toIPv4Address();
  return parsed.range() === "unicast";
}
// Resolve e fixa o IP em cada requisição, inclusive após redirecionamentos.
export async function safeFetch(value, redirects = 0) {
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
  const result = await new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).get(
      url,
      {
        headers: { "User-Agent": "Pinicon/1.0", "Accept-Encoding": "identity" },
        lookup: (_host, options, callback) =>
          options.all
            ? callback(null, [addresses[0]])
            : callback(null, addresses[0].address, addresses[0].family),
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 2 * 1024 * 1024)
            req.destroy(new Error("Arquivo muito grande."));
          else chunks.push(chunk);
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
      4500,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
  });
  if (result.status >= 300 && result.status < 400 && result.headers.location)
    return safeFetch(new URL(result.headers.location, url).href, redirects + 1);
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
  const png = await sharp(buffer, { limitInputPixels: 16000000 })
    .resize(
      128,
      128,
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
export async function metadata(value) {
  const url = normalizeUrl(value);
  const hostname = new URL(url).hostname.replace(/^www\./, "");
  let title = hostname,
    description = "",
    contentImage = "";
  const candidates = [];
  try {
    const page = await safeFetch(url);
    const $ = load(page.buffer.toString("utf8"));
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
      if (/(^|\s)(icon|apple-touch-icon|shortcut)(\s|$)/i.test(rel)) {
        try {
          candidates.push({
            url: new URL($(el).attr("href"), base).href,
            size:
              parseInt($(el).attr("sizes")) ||
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
  const found = images.find((r) => r.status === "fulfilled");
  return {
    url,
    name: title.slice(0, 120),
    description: description.slice(0, 2000),
    ...(found?.value || { favicon: "", color: "#a3b99a" }),
  };
}
