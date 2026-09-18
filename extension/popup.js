import {
  getSettings,
  setSettings,
  fetchMe,
  fetchCollections,
  fetchMetadata,
  createBookmark,
  DEFAULT_COLOR,
} from "./shared.js";

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

async function init() {
  const { baseUrl, lastCollectionId } = await getSettings();

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

  const [collections] = await Promise.all([fetchCollections(baseUrl), loadPreview(baseUrl)]);

  els.collectionSelect.innerHTML = "";
  for (const c of collections) {
    const option = document.createElement("option");
    option.value = c.id;
    option.textContent = c.name;
    els.collectionSelect.appendChild(option);
  }
  if (lastCollectionId && collections.some((c) => c.id === lastCollectionId)) {
    els.collectionSelect.value = lastCollectionId;
  } else if (collections[0]) {
    await setSettings({ lastCollectionId: collections[0].id });
  }
  els.collectionSelect.onchange = () =>
    setSettings({ lastCollectionId: els.collectionSelect.value });

  els.saveNow.onclick = async () => {
    if (!scraped) return;
    els.saveNow.disabled = true;
    setFeedback("Salvando…");
    try {
      await createBookmark(baseUrl, {
        name: (els.previewName.value || "Sem título").slice(0, 120),
        description: (els.previewDescription.value || "").slice(0, 2000),
        color: scraped.color || DEFAULT_COLOR,
        isPublic: false,
        url: scraped.url,
        favicon: scraped.favicon,
        collectionId: els.collectionSelect.value,
      });
      setFeedback("Salvo no Pinicon!", "success");
    } catch (error) {
      setFeedback(error.message, "error");
    } finally {
      els.saveNow.disabled = false;
    }
  };
}

init();
