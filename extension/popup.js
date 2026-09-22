import {
  getSettings,
  setSettings,
  fetchMe,
  fetchCollections,
  createCollection,
  createSection,
  fetchMetadata,
  resolveIcon,
  scrapeActiveTabImage,
  createBookmark,
  DEFAULT_COLOR,
} from "./shared.js";

// Valores-sentinela pras opções "+ Nova coleção…"/"+ Nova seção…" nos <select>
// — nunca IDs de verdade, então dá pra distinguir de uma seleção real.
const NEW_COLLECTION = "__new_collection__";
const NEW_SECTION = "__new_section__";

const els = {
  loading: document.getElementById("loading"),
  loggedOut: document.getElementById("logged-out"),
  loggedIn: document.getElementById("logged-in"),
  openLogin: document.getElementById("open-login"),
  previewLoading: document.getElementById("preview-loading"),
  previewUnavailable: document.getElementById("preview-unavailable"),
  preview: document.getElementById("preview"),
  previewIcon: document.getElementById("preview-icon"),
  previewName: document.getElementById("preview-name"),
  previewDescription: document.getElementById("preview-description"),
  collectionSelect: document.getElementById("collection-select"),
  collectionCreator: document.getElementById("collection-creator"),
  newCollectionName: document.getElementById("new-collection-name"),
  createCollectionBtn: document.getElementById("create-collection-btn"),
  sectionField: document.getElementById("section-field"),
  sectionSelect: document.getElementById("section-select"),
  sectionCreator: document.getElementById("section-creator"),
  newSectionName: document.getElementById("new-section-name"),
  createSectionBtn: document.getElementById("create-section-btn"),
  saveNow: document.getElementById("save-now"),
  saveFeedback: document.getElementById("save-feedback"),
};

// Preenchido pela captura da página (não editável pelo usuário no popup: só nome e
// descrição fazem sentido editar ali; URL e ícone acompanham o que foi capturado).
let scraped = null;

function show(section) {
  for (const el of [els.loading, els.loggedOut, els.loggedIn]) el.classList.add("hidden");
  section.classList.remove("hidden");
}

function setFeedback(message, kind) {
  els.saveFeedback.textContent = message;
  els.saveFeedback.className = `feedback ${kind || ""}`.trim();
}

async function loadPreview(baseUrl) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith("http")) {
    els.previewLoading.classList.add("hidden");
    els.previewUnavailable.classList.remove("hidden");
    return;
  }
  try {
    scraped = await fetchMetadata(baseUrl, tab.url);
  } catch {
    els.previewLoading.classList.add("hidden");
    els.previewUnavailable.classList.remove("hidden");
    return;
  }
  // Reforço pra sites que bloqueiam o fetch do servidor (TikTok, Instagram, ...)
  // e por isso só têm og:image genérico ou nenhum: lê a imagem direto da aba já
  // carregada no navegador e, se achar algo, troca a do /api/metadata por ela.
  // SÓ quando o servidor não usou uma imagem de conteúdo (usedContentImage) —
  // se usou, o fetch fresco do servidor pra URL atual já é mais confiável que
  // o DOM da aba, que pode estar com meta tags desatualizadas depois de uma
  // navegação client-side dentro de uma SPA (ex.: trocar de canal no YouTube
  // sem recarregar a página guarda o avatar do canal anterior até um F5) —
  // era exatamente esse reforço que causava esse bug. Falha aqui não deve
  // travar o preview — o favicon do servidor já é um resultado válido.
  if (!scraped.usedContentImage) {
    try {
      const liveImage = await scrapeActiveTabImage(tab.id);
      if (liveImage) {
        const resolved = await resolveIcon(baseUrl, liveImage, "cover");
        if (resolved.favicon) scraped = { ...scraped, ...resolved };
      }
    } catch {}
  }
  els.previewIcon.src = scraped.favicon || "icons/icon32.png";
  els.previewIcon.onerror = () => {
    els.previewIcon.onerror = null;
    els.previewIcon.src = "icons/icon32.png";
  };
  els.previewName.value = (scraped.name || "Sem título").slice(0, 120);
  els.previewDescription.value = (scraped.description || "").slice(0, 2000);
  els.previewLoading.classList.add("hidden");
  els.preview.classList.remove("hidden");
}

// Só seções (não "tiles", o agrupamento manual do site) fazem sentido como
// destino aqui — ver server/index.mjs e o campo BookmarkGroup.display.
function sectionsOf(collection) {
  return (collection?.groups || []).filter((g) => g.display === "section");
}

function populateCollectionOptions(collections, selectedId) {
  els.collectionSelect.innerHTML = "";
  for (const c of collections) {
    const option = document.createElement("option");
    option.value = c.id;
    option.textContent = c.name;
    els.collectionSelect.appendChild(option);
  }
  const create = document.createElement("option");
  create.value = NEW_COLLECTION;
  create.textContent = "+ Nova coleção…";
  els.collectionSelect.appendChild(create);
  if (selectedId && collections.some((c) => c.id === selectedId)) {
    els.collectionSelect.value = selectedId;
  } else if (collections[0]) {
    els.collectionSelect.value = collections[0].id;
  }
}

// Refeita toda vez que a coleção escolhida muda: a seção é sempre relativa à
// coleção selecionada no momento, nunca uma solta de outra coleção. Sem
// coleção nenhuma (lista vazia) não tem onde a seção morar, então o campo
// inteiro some — o resto do tempo fica sempre visível (mesmo sem nenhuma
// seção ainda) porque "+ Nova seção…" precisa estar sempre alcançável.
function populateSections(collections, collectionId, preselectGroupId) {
  els.sectionField.classList.toggle("hidden", collections.length === 0);
  if (!collections.length) return;
  const collection = collections.find((c) => c.id === collectionId);
  const sections = sectionsOf(collection);
  els.sectionSelect.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "Nenhuma (direto na coleção)";
  els.sectionSelect.appendChild(none);
  for (const section of sections) {
    const option = document.createElement("option");
    option.value = section.id;
    option.textContent = section.name;
    els.sectionSelect.appendChild(option);
  }
  const create = document.createElement("option");
  create.value = NEW_SECTION;
  create.textContent = "+ Nova seção…";
  els.sectionSelect.appendChild(create);
  els.sectionSelect.value = sections.some((s) => s.id === preselectGroupId)
    ? preselectGroupId
    : "";
}

async function init() {
  const { baseUrl, lastCollectionId, lastGroupId } = await getSettings();

  let me;
  try {
    me = await fetchMe(baseUrl);
  } catch (error) {
    setFeedback(error.message, "error");
    show(els.loggedOut);
    return;
  }

  if (!me.user) {
    els.openLogin.onclick = () => chrome.tabs.create({ url: baseUrl });
    show(els.loggedOut);
    return;
  }

  show(els.loggedIn);

  let [collections] = await Promise.all([fetchCollections(baseUrl), loadPreview(baseUrl)]);
  // Guardado à parte (não só lido de volta do <select>) porque, enquanto o
  // criador de coleção está aberto, o <select> mostra "+ Nova coleção…"
  // selecionado — precisamos saber pra qual valor voltar se o usuário
  // desistir sem preencher nada.
  let currentCollectionId = "";

  if (lastCollectionId && collections.some((c) => c.id === lastCollectionId)) {
    currentCollectionId = lastCollectionId;
  } else if (collections[0]) {
    currentCollectionId = collections[0].id;
    await setSettings({ lastCollectionId: currentCollectionId, lastGroupId: "" });
  }
  populateCollectionOptions(collections, currentCollectionId);
  populateSections(collections, currentCollectionId, lastGroupId);

  function hideCollectionCreator() {
    els.collectionCreator.classList.add("hidden");
    els.newCollectionName.value = "";
  }
  function hideSectionCreator() {
    els.sectionCreator.classList.add("hidden");
    els.newSectionName.value = "";
  }

  els.collectionSelect.onchange = () => {
    if (els.collectionSelect.value === NEW_COLLECTION) {
      els.collectionSelect.value = currentCollectionId;
      hideSectionCreator();
      els.collectionCreator.classList.remove("hidden");
      els.newCollectionName.focus();
      return;
    }
    hideCollectionCreator();
    currentCollectionId = els.collectionSelect.value;
    // Coleção mudou: a seção lembrada não pertence mais a ela — recomeça sem
    // nenhuma selecionada em vez de arriscar salvar na seção errada.
    populateSections(collections, currentCollectionId, "");
    setSettings({ lastCollectionId: currentCollectionId, lastGroupId: "" });
  };

  els.createCollectionBtn.onclick = async () => {
    const name = els.newCollectionName.value.trim();
    if (!name) {
      els.newCollectionName.focus();
      return;
    }
    els.createCollectionBtn.disabled = true;
    try {
      const created = await createCollection(baseUrl, name);
      collections = await fetchCollections(baseUrl);
      currentCollectionId = created.id;
      populateCollectionOptions(collections, currentCollectionId);
      populateSections(collections, currentCollectionId, "");
      await setSettings({ lastCollectionId: currentCollectionId, lastGroupId: "" });
      hideCollectionCreator();
    } catch (error) {
      setFeedback(error.message, "error");
    } finally {
      els.createCollectionBtn.disabled = false;
    }
  };

  els.sectionSelect.onchange = () => {
    if (els.sectionSelect.value === NEW_SECTION) {
      els.sectionSelect.value = "";
      // Pedido explícito: sem coleção de verdade escolhida, não cria a seção
      // (o <select> de coleção pode estar parado em "+ Nova coleção…" com o
      // criador ainda aberto, esperando o usuário terminar aquilo primeiro).
      if (!currentCollectionId || currentCollectionId === NEW_COLLECTION) {
        setFeedback("Escolha (ou crie) uma coleção antes de criar uma seção.", "error");
        return;
      }
      hideCollectionCreator();
      els.sectionCreator.classList.remove("hidden");
      els.newSectionName.focus();
      return;
    }
    hideSectionCreator();
    setSettings({ lastGroupId: els.sectionSelect.value });
  };

  els.createSectionBtn.onclick = async () => {
    const name = els.newSectionName.value.trim();
    if (!name) {
      els.newSectionName.focus();
      return;
    }
    if (!currentCollectionId || currentCollectionId === NEW_COLLECTION) {
      setFeedback("Escolha (ou crie) uma coleção antes de criar uma seção.", "error");
      hideSectionCreator();
      return;
    }
    els.createSectionBtn.disabled = true;
    try {
      const created = await createSection(baseUrl, currentCollectionId, name);
      collections = await fetchCollections(baseUrl);
      populateSections(collections, currentCollectionId, created.id);
      await setSettings({ lastGroupId: created.id });
      hideSectionCreator();
    } catch (error) {
      setFeedback(error.message, "error");
    } finally {
      els.createSectionBtn.disabled = false;
    }
  };

  els.saveNow.onclick = async () => {
    if (!scraped) return;
    // Só acontece com zero coleções: "+ Nova coleção…" fica selecionada por
    // ser a única opção do <select>, sem nenhum onchange disparar pra revelar
    // o criador — pede pra criar antes em vez de mandar esse valor-sentinela
    // pro servidor como se fosse um ID de coleção de verdade.
    if (els.collectionSelect.value === NEW_COLLECTION) {
      setFeedback("Crie uma coleção antes de salvar.", "error");
      els.collectionCreator.classList.remove("hidden");
      els.newCollectionName.focus();
      return;
    }
    els.saveNow.disabled = true;
    setFeedback("Salvando…");
    try {
      await createBookmark(baseUrl, {
        name: (els.previewName.value || "Sem título").slice(0, 120),
        description: (els.previewDescription.value || "").slice(0, 2000),
        color: scraped.color || DEFAULT_COLOR,
        url: scraped.url,
        favicon: scraped.favicon,
        collectionId: els.collectionSelect.value,
        groupId: els.sectionSelect.value || null,
      });
      setFeedback("Salvo no Linkable!", "success");
    } catch (error) {
      setFeedback(error.message, "error");
    } finally {
      els.saveNow.disabled = false;
    }
  };
}

init();
