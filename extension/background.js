import { getSettings, fetchMe, fetchMetadata, createBookmark } from "./shared.js";

const MENU_ID = "pinicon-save-page";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Salvar no Pinicon",
    contexts: ["link"],
  });
});

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}

// Salva o link clicado direto na coleção configurada no popup da extensão
// (lastCollectionId), sem abrir aba nem modal. Nome, descrição e imagem vêm
// do mesmo /api/metadata usado pelo popup e pela barra de busca do site — já
// prioriza a imagem do conteúdo específico (og:image) sobre o favicon do
// site quando o link não é a home.
async function handleSave(linkUrl) {
  const { baseUrl, lastCollectionId } = await getSettings();
  if (!lastCollectionId) {
    notify("Pinicon", "Abra a extensão e escolha uma coleção padrão antes de salvar.");
    return;
  }
  try {
    const me = await fetchMe(baseUrl);
    if (!me.user) {
      notify("Pinicon", "Faça login no Pinicon no navegador antes de salvar.");
      return;
    }
    const data = await fetchMetadata(baseUrl, linkUrl);
    await createBookmark(baseUrl, {
      name: (data.name || "Sem título").slice(0, 120),
      description: (data.description || "").slice(0, 2000),
      color: data.color,
      isPublic: false,
      url: data.url || linkUrl,
      favicon: data.favicon,
      collectionId: lastCollectionId,
    });
    notify("Salvo no Pinicon", data.name || linkUrl);
  } catch (error) {
    notify("Não foi possível salvar", error.message || "Erro inesperado.");
  }
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_ID && info.linkUrl) void handleSave(info.linkUrl);
});
