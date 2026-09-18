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
