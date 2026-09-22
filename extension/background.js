import {
  getSettings,
  fetchMe,
  fetchMetadata,
  fetchCollections,
  createBookmark,
} from "./shared.js";

const MENU_ID = "likemylinks-save-page";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Salvar no Like My Links",
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
  const { baseUrl, lastCollectionId, lastGroupId } = await getSettings();
  if (!lastCollectionId) {
    notify("Like My Links", "Abra a extensão e escolha uma coleção padrão antes de salvar.");
    return;
  }
  try {
    const me = await fetchMe(baseUrl);
    if (!me.user) {
      notify("Like My Links", "Faça login no Like My Links no navegador antes de salvar.");
      return;
    }
    // Confirma que a seção lembrada ainda existe e ainda é dessa mesma
    // coleção antes de usá-la — evita mandar um groupId órfão (a seção pode
    // ter sido excluída, ou a coleção padrão pode ter mudado) pro servidor,
    // que rejeitaria a criação do favorito inteiro por causa disso.
    let groupId = null;
    if (lastGroupId) {
      const collections = await fetchCollections(baseUrl);
      const collection = collections.find((c) => c.id === lastCollectionId);
      const section = collection?.groups?.find(
        (g) => g.id === lastGroupId && g.display === "section",
      );
      if (section) groupId = section.id;
    }
    const data = await fetchMetadata(baseUrl, linkUrl);
    await createBookmark(baseUrl, {
      name: (data.name || "Sem título").slice(0, 120),
      description: (data.description || "").slice(0, 2000),
      color: data.color,
      url: data.url || linkUrl,
      favicon: data.favicon,
      collectionId: lastCollectionId,
      groupId,
    });
    notify("Salvo no Like My Links", data.name || linkUrl);
  } catch (error) {
    notify("Não foi possível salvar", error.message || "Erro inesperado.");
  }
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === MENU_ID && info.linkUrl) void handleSave(info.linkUrl);
});
