// Lógica compartilhada entre o popup e o service worker (background.js).
// Mantida sem dependências externas para poder rodar nos dois contextos.

export const DEFAULT_BASE_URL = "http://localhost:3000";
export const DEFAULT_COLOR = "#b9ee78";

export async function getSettings() {
  const { baseUrl, lastCollectionId } = await chrome.storage.local.get([
    "baseUrl",
    "lastCollectionId",
  ]);
  return { baseUrl: baseUrl || DEFAULT_BASE_URL, lastCollectionId: lastCollectionId || "" };
}

export async function setSettings(partial) {
  await chrome.storage.local.set(partial);
}

// pinicon_session é HttpOnly (não aparece em document.cookie), mas chrome.cookies
// pode lê-lo porque a extensão declarou host_permissions para a origem do Pinicon —
// é a forma correta e prevista de uma extensão de primeira parte se autenticar.
async function getSessionToken(baseUrl) {
  try {
    const cookie = await chrome.cookies.get({ url: baseUrl, name: "pinicon_session" });
    return cookie?.value || "";
  } catch {
    return "";
  }
}

export async function apiFetch(baseUrl, path, options = {}) {
  const token = await getSessionToken(baseUrl);
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  if (token) headers["X-Pinicon-Session"] = token;
  const res = await fetch(`${baseUrl}${path}`, { ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status} ao falar com o Pinicon.`);
  return data;
}

export async function fetchMe(baseUrl) {
  return apiFetch(baseUrl, "/api/auth/me");
}

export async function fetchCollections(baseUrl) {
  const data = await apiFetch(baseUrl, "/api/collections");
  return data.collections || [];
}

export async function createBookmark(baseUrl, bookmark) {
  return apiFetch(baseUrl, "/api/bookmarks", {
    method: "POST",
    body: JSON.stringify(bookmark),
  });
}

// Mesmo endpoint usado pela barra de busca do site e pelo menu de contexto
// ("Salvar no Pinicon" num link): o servidor busca a página e decide nome,
// descrição e imagem (preferindo o og:image/twitter:image do conteúdo em vez
// do favicon do site quando a URL não é a home genérica — ver server/metadata.mjs).
// `favicon` já vem como data URI pronta para reenviar direto em createBookmark.
export async function fetchMetadata(baseUrl, url) {
  return apiFetch(baseUrl, "/api/metadata", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

// Resolve uma imagem (favicon, og:image, poster de vídeo, ...) em data URI já
// recortada — mesmo endpoint que o próprio site usa pra ícones manuais.
// crop: "cover" pede o recorte quadrado centralizado (ver imageData em
// server/metadata.mjs), melhor pra thumbnails retangulares de vídeo/post.
export async function resolveIcon(baseUrl, favicon, crop) {
  return apiFetch(baseUrl, "/api/icon", {
    method: "POST",
    body: JSON.stringify({ favicon, crop }),
  });
}

// Roda DENTRO da página ativa (via chrome.scripting.executeScript), por isso é
// autocontida, sem closures externas. Existe porque alguns sites (TikTok,
// Instagram, ...) bloqueiam ou servem uma página vazia pra requisições feitas
// pelo SERVIDOR (sem og:image de verdade) — mas a página já carregada no
// navegador tem os metadados certos, então lê-se direto dali como reforço.
// Ordem de prioridade: poster do <video> > og:image > twitter:image > frame
// capturado do vídeo em reprodução (só como último recurso, ver abaixo).
function scrapeActiveImage() {
  const meta = (name) =>
    document.querySelector(`meta[property="${name}"]`)?.getAttribute("content") ||
    document.querySelector(`meta[name="${name}"]`)?.getAttribute("content") ||
    "";
  const toAbsolute = (value) => {
    if (!value) return "";
    try {
      return new URL(value, document.baseURI).href;
    } catch {
      return "";
    }
  };
  // O poster do <video> em reprodução é literalmente a miniatura do vídeo
  // específico que está na tela — mais confiável que og:image em sites que só
  // atualizam esse meta tag na navegação inicial da SPA, não a cada vídeo.
  const poster = document.querySelector("video[poster]")?.getAttribute("poster");
  const declared = toAbsolute(poster || meta("og:image") || meta("twitter:image"));
  if (declared) return declared;
  // Último recurso: nenhuma miniatura declarada em lugar nenhum (nem poster,
  // nem og:image/twitter:image) — tenta capturar o frame atual de um vídeo em
  // reprodução desenhando ele num <canvas>. Só considera vídeos com dados
  // suficientes carregados (readyState >= 2 = HAVE_CURRENT_DATA), senão o
  // frame sai preto; e falha silenciosamente se o vídeo tiver proteção
  // CORS/DRM, que "contamina" o canvas e faz toDataURL lançar um erro.
  const video = [...document.querySelectorAll("video")].find(
    (v) => v.readyState >= 2 && v.videoWidth,
  );
  if (!video) {
    console.warn("[Pinicon] nenhum <video> com frame carregado encontrado na página.");
    return "";
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch (error) {
    // O caso mais comum aqui é "tainted canvas": o navegador recusa exportar
    // pixels de um vídeo carregado sem permissão CORS explícita do CDN que o
    // serve — e a maioria dos CDNs de vídeo (TikTok incluso) não dá essa
    // permissão. Isso NÃO depende de qual frame foi escolhido: qualquer
    // captura desse mesmo elemento de vídeo, em qualquer instante, esbarra no
    // mesmo bloqueio — por isso deixar o usuário escolher o frame manualmente
    // não resolveria esse erro específico.
    console.warn("[Pinicon] falha ao capturar frame do vídeo:", error.message);
    return "";
  }
}

export async function scrapeActiveTabImage(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: scrapeActiveImage,
    });
    return result || "";
  } catch {
    return "";
  }
}
