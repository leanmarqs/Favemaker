import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpRight,
  Bookmark as BookmarkIcon,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Folder,
  Globe2,
  Heart,
  Link2,
  Lock,
  Moon,
  Pencil,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Sun,
  Trash2,
  X,
  Upload,
  Copy,
} from "lucide-react";
import type { Bookmark, Collection } from "./types";
import "./styles.css";

async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res
    .json()
    .catch(() => ({ error: "Não foi possível conectar ao Pinicon." }));
  if (!res.ok)
    throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}
const blank = {
  name: "",
  description: "",
  color: "#b9ee78",
  isPublic: false,
  url: "",
  favicon: "",
  collectionId: "",
  shape: "circle",
};
type Draft = Omit<typeof blank, "shape"> & {
  id?: string;
  shape: string;
};
type FilterKey = "liked" | "bookmarked" | "public" | "private" | "mostUsed" | "leastUsed" | "newest" | "oldest";
const filterLabels: Record<FilterKey, string> = {
  liked: "Com gostei",
  bookmarked: "Favoritados",
  public: "Públicos",
  private: "Privados",
  mostUsed: "Mais usados",
  leastUsed: "Menos usados",
  newest: "Mais recentes",
  oldest: "Mais antigos",
};
function Privacy({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="privacy">
      <div>
        <strong>{value ? "Público" : "Privado"}</strong>
      </div>
      <button
        type="button"
        role="switch"
        aria-label="Visibilidade pública"
        aria-checked={value}
        className={`switch ${value ? "on" : ""}`}
        onClick={() => onChange(!value)}
      >
        <span />
      </button>
    </div>
  );
}
function Sphere({
  bookmark,
  shape = "circle",
}: {
  bookmark: Pick<Bookmark, "favicon" | "color" | "name">;
  shape?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [bookmark.favicon]);
  return (
    <span
      className={`sphere sphere-${shape}`}
      style={{ "--orb": bookmark.color } as React.CSSProperties}
    >
      {bookmark.favicon && !failed ? (
        <img src={bookmark.favicon} alt="" onError={() => setFailed(true)} />
      ) : (
        <span>{bookmark.name.slice(0, 1).toUpperCase() || <Globe2 />}</span>
      )}
    </span>
  );
}
function CollectionRow({
  collection,
  readOnly,
  edit,
  remove,
  add,
  editBookmark,
  removeBookmark,
  openBookmark,
}: {
  collection: Collection;
  readOnly: boolean;
  edit: () => void;
  remove: () => void;
  add: () => void;
  editBookmark: (bookmark: Bookmark) => void;
  removeBookmark: (bookmark: Bookmark) => void;
  openBookmark: (bookmark: Bookmark) => void;
}) {
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [toolbar, setToolbar] = useState<{
    bookmark?: Bookmark;
    x?: number;
    y?: number;
  } | null>(null);
  const pageTransitionTimer = useRef<number | null>(null);
  const toolbarTimer = useRef<number | null>(null);
  const pages = Math.max(1, Math.ceil(collection.bookmarks.length / 10));
  const active = Math.min(page, pages - 1);
  const bookmarks = sortDirection
    ? [...collection.bookmarks].sort((a, b) =>
        sortDirection === "asc"
          ? a.name.localeCompare(b.name, "pt-BR")
          : b.name.localeCompare(a.name, "pt-BR"),
      )
    : collection.bookmarks;

  useEffect(
    () => () => {
      if (pageTransitionTimer.current) {
        window.clearTimeout(pageTransitionTimer.current);
      }
      if (toolbarTimer.current) window.clearTimeout(toolbarTimer.current);
    },
    [],
  );

  const changePage = (nextPage: number, nextDirection: "forward" | "backward") => {
    if (isPageTransitioning || nextPage < 0 || nextPage >= pages) return;
    setDirection(nextDirection);
    setIsPageTransitioning(true);
    pageTransitionTimer.current = window.setTimeout(() => {
      setPage(nextPage);
      setIsPageTransitioning(false);
    }, 180);
  };
  const scheduleToolbar = (next: {
    bookmark?: Bookmark;
    x?: number;
    y?: number;
  }) => {
    if (toolbarTimer.current) window.clearTimeout(toolbarTimer.current);
    setToolbar(null);
    toolbarTimer.current = window.setTimeout(() => setToolbar(next), 500);
  };
  const clearToolbar = () => {
    if (toolbarTimer.current) window.clearTimeout(toolbarTimer.current);
    setToolbar(null);
  };
  const deferToolbarClear = () => {
    if (toolbarTimer.current) window.clearTimeout(toolbarTimer.current);
    toolbarTimer.current = window.setTimeout(
      () => setToolbar(null),
      350,
    );
  };
  const keepToolbarVisible = () => {
    if (toolbarTimer.current) window.clearTimeout(toolbarTimer.current);
  };
  const clearBookmarkToolbar = (event: React.MouseEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as HTMLElement | null;
    if (!nextTarget?.closest(".favorite-controls")) deferToolbarClear();
  };
  return (
    <article
      className={`collection ${toolbar ? "has-visible-toolbar" : ""}`}
      onMouseEnter={() => scheduleToolbar({})}
      onMouseLeave={deferToolbarClear}
    >
      <div className="collection-heading">
        <div className="collection-label">
          <span
            className="collection-dot"
            style={{ background: collection.color }}
          />
          <h3>{collection.name}</h3>
          <span className="count">{collection.bookmarks.length}</span>
        </div>
      </div>
      {collection.description && (
        <p className="collection-description">{collection.description}</p>
      )}
      <div className={`pill ${isExpanded ? "is-expanded" : ""}`}>
        {!readOnly && (
          toolbar?.bookmark ? (
            <div className="collection-controls favorite-controls" style={{ left: toolbar.x, top: toolbar.y }} aria-label={`Ações do favorito ${toolbar.bookmark.name}`} onMouseEnter={keepToolbarVisible} onMouseLeave={deferToolbarClear}>
              <button type="button" aria-label={`Editar favorito ${toolbar.bookmark.name}`} title="Editar favorito" onClick={() => editBookmark(toolbar.bookmark!)}>
                <Pencil size={13} />
              </button>
              <button type="button" aria-label={`Excluir favorito ${toolbar.bookmark.name}`} title="Excluir favorito" onClick={() => removeBookmark(toolbar.bookmark!)}>
                <Trash2 size={13} />
              </button>
            </div>
          ) : toolbar ? (
            <div className="collection-controls" aria-label={`Ações da coleção ${collection.name}`} onMouseEnter={keepToolbarVisible} onMouseLeave={deferToolbarClear}>
              <button type="button" aria-label={`${isExpanded ? "Recolher" : "Expandir"} coleção ${collection.name}`} aria-expanded={isExpanded} title={isExpanded ? "Recolher coleção" : "Expandir coleção"} onClick={() => setIsExpanded((value) => !value)}>
                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <button type="button" aria-label={`Ordenar favoritos de ${collection.name} de ${sortDirection === "asc" ? "Z a A" : "A a Z"}`} title={sortDirection === "asc" ? "Ordenar de Z a A" : "Ordenar de A a Z"} onClick={() => setSortDirection((value) => value === "asc" ? "desc" : "asc")}>
                <ArrowDownAZ size={13} />
              </button>
              <button type="button" aria-label={`Adicionar favorito à coleção ${collection.name}`} title="Adicionar favorito" onClick={add}>
                <Plus size={14} />
              </button>
              <button type="button" aria-label={`Editar coleção ${collection.name}`} title="Editar coleção" onClick={edit}>
                <Pencil size={13} />
              </button>
              <button type="button" aria-label={`Excluir coleção ${collection.name}`} title="Excluir coleção" onClick={remove}>
                <Trash2 size={13} />
              </button>
            </div>
          ) : null
        )}
        {!isExpanded && (
          <button
            className="page-arrow"
            aria-label={`Página anterior de ${collection.name}`}
            disabled={active === 0 || isPageTransitioning}
            onClick={() => changePage(active - 1, "backward")}
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <div
          key={isExpanded ? "expanded" : active}
          className={`favorites favorites-${direction} ${isPageTransitioning ? "favorites-leaving" : "favorites-entering"}`}
          aria-live="polite"
        >
          {(isExpanded
            ? bookmarks
            : bookmarks.slice(active * 10, active * 10 + 10)
          )
            .map((b) => (
              <div
                className="favorite"
                key={b.id}
                onMouseEnter={(event) => {
                  const pill = event.currentTarget.closest(".pill");
                  const favoriteRect = event.currentTarget.getBoundingClientRect();
                  const pillRect = pill?.getBoundingClientRect();
                  scheduleToolbar({
                    bookmark: b,
                    x: pillRect
                      ? favoriteRect.left - pillRect.left + favoriteRect.width / 2
                      : undefined,
                    y: pillRect ? favoriteRect.top - pillRect.top - 16 : undefined,
                  });
                }}
                onMouseLeave={clearBookmarkToolbar}
              >
                <a
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={b.name}
                  onClick={() => openBookmark(b)}
                >
                  <Sphere bookmark={b} shape={collection.shape} />
                  <span className="sr-only">{b.name}</span>
                </a>
              </div>
          ))}
          {!collection.bookmarks.length && (
            <span className="empty-row">Coleção Vazia</span>
          )}
        </div>
        {!isExpanded && (
          <button
            className="page-arrow"
            aria-label={`Próxima página de ${collection.name}`}
            disabled={active >= pages - 1 || isPageTransitioning}
            onClick={() => changePage(active + 1, "forward")}
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>
      {!isExpanded && pages > 1 && (
        <p className="page-info">
          {active * 10 + 1}–
          {Math.min(active * 10 + 10, collection.bookmarks.length)} de{" "}
          {collection.bookmarks.length} favoritos
        </p>
      )}
    </article>
  );
}
export default function App() {
  const sharedId = new URLSearchParams(location.search).get("perfil");
  const readOnly = Boolean(sharedId);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [notice, setNotice] = useState("");
  const [url, setUrl] = useState("");
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("pinicon-theme") || "dark";
    } catch {
      return "dark";
    }
  });
  const [kind, setKind] = useState<"collection" | "bookmark" | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...blank });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lockedBookmarkCollectionId, setLockedBookmarkCollectionId] = useState("");
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [likedIds, setLikedIds] = useState<string[]>(() => JSON.parse(localStorage.getItem("pinicon-liked") || "[]"));
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => JSON.parse(localStorage.getItem("pinicon-bookmarked") || "[]"));
  const [usage, setUsage] = useState<Record<string, number>>(() => JSON.parse(localStorage.getItem("pinicon-usage") || "{}"));
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterKey[]>([]);
  const [isCollectionCreatorOpen, setIsCollectionCreatorOpen] = useState(false);
  const [collectionDraft, setCollectionDraft] = useState<Draft>({ ...blank });
  const [collectionEditorReturn, setCollectionEditorReturn] = useState<Draft | null>(null);
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [collectionModalPosition, setCollectionModalPosition] = useState({ x: 0, y: 0 });
  const [isDraggingModal, setIsDraggingModal] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const collectionDialog = useRef<HTMLDialogElement>(null);
  const modalDrag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const collectionModalDrag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const fetchedMetadataUrl = useRef("");
  const hasMovedModal = useRef(false);
  const total = collections.reduce((n, c) => n + c.bookmarks.length, 0);
  const filteredCollection = activeFilters.length
    ? (() => {
        const all = collections.flatMap((collection) => collection.bookmarks);
        let bookmarks = [...all];
        if (activeFilters.includes("liked")) bookmarks = bookmarks.filter((bookmark) => likedIds.includes(bookmark.id));
        if (activeFilters.includes("bookmarked")) bookmarks = bookmarks.filter((bookmark) => bookmarkedIds.includes(bookmark.id));
        if (activeFilters.includes("public")) bookmarks = bookmarks.filter((bookmark) => bookmark.isPublic);
        if (activeFilters.includes("private")) bookmarks = bookmarks.filter((bookmark) => !bookmark.isPublic);
        if (activeFilters.includes("newest")) bookmarks.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        if (activeFilters.includes("oldest")) bookmarks.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
        if (activeFilters.includes("mostUsed")) bookmarks.sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0));
        if (activeFilters.includes("leastUsed")) bookmarks.sort((a, b) => (usage[a.id] || 0) - (usage[b.id] || 0));
        return { id: "temporary-filter", name: "Resultados do filtro", description: activeFilters.map((filter) => filterLabels[filter]).join(" · "), color: "#b9ee78", isPublic: false, bookmarks };
      })()
    : null;
  const displayedCollections = filteredCollection ? [filteredCollection, ...collections] : collections;
  const editingCollectionBookmarks =
    kind === "collection" && draft.id
      ? collections.find((collection) => collection.id === draft.id)?.bookmarks || []
      : [];
  async function reload() {
    setLoading(true);
    setConnectionError("");
    try {
      const data = await api(
        sharedId ? `/public/${encodeURIComponent(sharedId)}` : "/collections",
      );
      setCollections(data.collections);
      setOwnerId(data.ownerId || "");
    } catch (e) {
      setConnectionError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  function toggleStoredId(
    id: string,
    current: string[],
    update: React.Dispatch<React.SetStateAction<string[]>>,
    storageKey: string,
  ) {
    const next = current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id];
    update(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    return next.includes(id);
  }
  function registerUsage(id: string) {
    const next = { ...usage, [id]: (usage[id] || 0) + 1 };
    setUsage(next);
    localStorage.setItem("pinicon-usage", JSON.stringify(next));
  }
  function toggleFilter(filter: FilterKey) {
    const exclusiveGroups: FilterKey[][] = [
      ["public", "private"],
      ["mostUsed", "leastUsed"],
      ["newest", "oldest"],
    ];
    setActiveFilters((current) => {
      if (current.includes(filter)) return current.filter((value) => value !== filter);
      const group = exclusiveGroups.find((items) => items.includes(filter));
      return group
        ? [...current.filter((value) => !group.includes(value)), filter]
        : [...current, filter];
    });
  }
  useEffect(() => {
    void reload();
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("pinicon-theme", theme);
    } catch {}
  }, [theme]);
  useEffect(() => {
    if (kind && !dialog.current?.open) dialog.current?.showModal();
    else if (!kind && dialog.current?.open) dialog.current.close();
  }, [kind]);
  useEffect(() => {
    if (isCollectionCreatorOpen && !collectionDialog.current?.open)
      collectionDialog.current?.showModal();
    else if (!isCollectionCreatorOpen && collectionDialog.current?.open)
      collectionDialog.current.close();
  }, [isCollectionCreatorOpen]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timeout);
  }, [notice]);
  function open(
    type: "collection" | "bookmark",
    data?: Partial<Draft>,
    lockedCollectionId = "",
  ) {
    setError("");
    setConfirmDelete(false);
    setIconUrl("");
    fetchedMetadataUrl.current = "";
    setModalPosition({ x: 0, y: 0 });
    setLockedBookmarkCollectionId(type === "bookmark" ? lockedCollectionId : "");
    setIsLiked(Boolean(data?.id && likedIds.includes(data.id)));
    setIsBookmarked(Boolean(data?.id && bookmarkedIds.includes(data.id)));
    setDraft({
      ...blank,
      collectionId: collections[0]?.id || "",
      ...(type === "bookmark" && !data?.id ? { isPublic: true } : {}),
      ...data,
    });
    setKind(type);
  }
  function closeMainModal() {
    if (kind === "bookmark" && collectionEditorReturn) {
      setDraft(collectionEditorReturn);
      setCollectionEditorReturn(null);
      setKind("collection");
      return;
    }
    setCollectionEditorReturn(null);
    setKind(null);
  }
  function editBookmarkFromCollection(bookmark: Bookmark, deleting = false) {
    setCollectionEditorReturn(draft);
    open("bookmark", bookmark);
    if (deleting) setConfirmDelete(true);
  }
  const isCollectionEdit = kind === "collection" && Boolean(draft.id);
  const isMovableDialog = kind === "bookmark" || kind === "collection";
  function startModalDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (
      !isMovableDialog ||
      busy ||
      (event.target as HTMLElement).closest("button, .modal-heading-actions")
    )
      return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    modalDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: modalPosition.x,
      originY: modalPosition.y,
    };
    hasMovedModal.current = false;
    setIsDraggingModal(true);
  }
  function moveModal(event: React.PointerEvent<HTMLDivElement>) {
    const drag = modalDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (
      Math.abs(event.clientX - drag.startX) > 2 ||
      Math.abs(event.clientY - drag.startY) > 2
    )
      hasMovedModal.current = true;
    setModalPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  }
  function stopModalDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (modalDrag.current?.pointerId !== event.pointerId) return;
    modalDrag.current = null;
    setIsDraggingModal(false);
  }
  function startCollectionModalDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (busy || (event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    collectionModalDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: collectionModalPosition.x,
      originY: collectionModalPosition.y,
    };
  }
  function moveCollectionModal(event: React.PointerEvent<HTMLDivElement>) {
    const drag = collectionModalDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setCollectionModalPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  }
  function stopCollectionModalDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (collectionModalDrag.current?.pointerId !== event.pointerId) return;
    collectionModalDrag.current = null;
  }
  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const data = await api("/metadata", "POST", { url: url.trim() });
      open("bookmark", data);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function discoverBookmarkMetadata() {
    const requestedUrl = draft.url.trim();
    if (!requestedUrl || busy || requestedUrl === fetchedMetadataUrl.current) return;
    try {
      new URL(requestedUrl);
    } catch {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api("/metadata", "POST", { url: requestedUrl });
      fetchedMetadataUrl.current = requestedUrl;
      setDraft((current) =>
        current.url.trim() !== requestedUrl
          ? current
          : {
              ...current,
              url: data.url || current.url,
              name: current.name || data.name,
              description: current.description || data.description,
              favicon: data.favicon || current.favicon,
              color: data.color || current.color,
            },
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const path = kind === "collection" ? "/collections" : "/bookmarks";
      await api(
        path + (draft.id ? `/${draft.id}` : ""),
        draft.id ? "PATCH" : "POST",
        draft,
      );
      closeMainModal();
      setUrl("");
      setNotice(
        draft.id
          ? "Alterações salvas."
          : kind === "collection"
            ? "Coleção criada. Pronta para novas descobertas."
            : "Favorito guardado na sua coleção.",
      );
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveCollectionFromBookmark(e: React.FormEvent) {
    e.preventDefault();
    if (!collectionDraft.name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const collection = await api("/collections", "POST", collectionDraft);
      setCollections((previous) => [...previous, collection]);
      setDraft((previous) => ({ ...previous, collectionId: collection.id }));
      setIsCollectionCreatorOpen(false);
      setNotice("Nova coleção criada e selecionada.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(
        `/${kind === "collection" ? "collections" : "bookmarks"}/${draft.id}`,
        "DELETE",
      );
      closeMainModal();
      setNotice("Excluído com sucesso.");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function setIcon(favicon: string) {
    setBusy(true);
    setError("");
    try {
      const data = await api("/icon", "POST", { favicon });
      setDraft((prev) => ({ ...prev, ...data }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Escolha uma imagem de até 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => void setIcon(String(reader.result));
    reader.onerror = () => setError("Não foi possível ler o arquivo.");
    reader.readAsDataURL(file);
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/?perfil=${ownerId}`,
      );
      setNotice(
        "Link público copiado. Somente coleções e favoritos públicos serão exibidos.",
      );
    } catch {
      setNotice("Não foi possível copiar o link.");
    }
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Pinicon, início">
          <img src="/pinicon.svg" alt="" />
          pinicon<span className="brand-period">.</span>
        </a>
        <div className="header-actions">
          <button
            className="theme-button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={`Ativar tema ${theme === "dark" ? "claro" : "escuro"}`}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <span className="avatar" aria-hidden="true">
            P
          </span>
        </div>
      </header>
      <main>
        <section className="hero">
          {!readOnly && (
            <>
              <form className="search-bar" onSubmit={submitUrl}>
                <Search size={21} />
                <input
                  aria-label="URL do site para favoritar"
                  placeholder="Cole ou digite o link de um site…"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  disabled={busy || loading || !!connectionError}
                  aria-label={busy ? "Buscando informações do site" : "Adicionar favorito"}
                  title={busy ? "Buscando informações do site" : "Adicionar favorito"}
                >
                  {busy ? <span className="loader" /> : <Plus size={18} />}
                </button>
              </form>
              <div className="toolbar">
                <button
                  onClick={() => open("collection")}
                  disabled={loading || !!connectionError}
                >
                  <Plus size={16} />
                  Nova coleção
                </button>
                <button
                  type="button"
                  aria-expanded={filterOpen}
                  onClick={() => setFilterOpen((value) => !value)}
                >
                  <SlidersHorizontal size={15} />
                  Filtrar
                </button>
              </div>
              {filterOpen && (
                <div className="filter-panel" aria-label="Opções de filtro">
                  {(Object.keys(filterLabels) as FilterKey[]).map((filter) => (
                    <button
                      type="button"
                      key={filter}
                      className={activeFilters.includes(filter) ? "active" : ""}
                      onClick={() => toggleFilter(filter)}
                    >
                      {filterLabels[filter]}
                    </button>
                  ))}
                  {activeFilters.length > 0 && (
                    <button type="button" className="clear-filter" onClick={() => setActiveFilters([])}>
                      Limpar filtro
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </section>
        <section className="library">
          <div className="library-heading">
            <div>
              <h2>
                {readOnly ? "Coleções públicas" : "Suas coleções"}
                <span>{collections.length}</span>
              </h2>
            </div>
            <div className="library-meta">
              <span>
                {total} {total === 1 ? "favorito" : "favoritos"}
              </span>
              {!readOnly && ownerId && (
                <button className="share-button" onClick={share}>
                  <Copy size={14} />
                  Compartilhar
                </button>
              )}
            </div>
          </div>
          {loading ? (
            <div className="empty-state">
              <span className="loader" />
              <p>Preparando seu espaço…</p>
            </div>
          ) : connectionError ? (
            <div className="empty-state">
              <Folder size={34} />
              <h3>Não foi possível carregar suas coleções</h3>
              <p>{connectionError}</p>
              <button className="primary" onClick={reload}>
                Tentar novamente
              </button>
            </div>
          ) : displayedCollections.length ? (
            displayedCollections.map((c) => (
              <CollectionRow
                key={c.id}
                collection={c}
                readOnly={readOnly || c.id === "temporary-filter"}
                edit={() => open("collection", c)}
                remove={() => {
                  open("collection", c);
                  setConfirmDelete(true);
                }}
                add={() => open("bookmark", { collectionId: c.id }, c.id)}
                editBookmark={(bookmark) => open("bookmark", bookmark)}
                removeBookmark={(bookmark) => {
                  open("bookmark", bookmark);
                  setConfirmDelete(true);
                }}
                openBookmark={(bookmark) => registerUsage(bookmark.id)}
              />
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-art">
                <span className="mini-orb">
                  <Globe2 size={23} />
                </span>
                <span className="main-orb">
                  <BookmarkIcon size={32} />
                </span>
                <span className="mini-orb">
                  <Link2 size={22} />
                </span>
              </div>
              <h3>
                {readOnly
                  ? "Nenhuma coleção pública por aqui"
                  : "Mantenha seus favoritos sempre perto de você."}
              </h3>
              <p>
                {readOnly
                  ? "As coleções privadas ficam visíveis apenas para o proprietário."
                  : "Crie sua primeira coleção"}
              </p>
              {!readOnly && (
                <button className="primary" onClick={() => open("collection")}>
                  <Plus size={16} />
                  Criar minha primeira coleção
                </button>
              )}
            </div>
          )}
        </section>
      </main>
      <footer>
        <span>
          pinicon<span className="brand-period">.</span>
        </span>
      </footer>
      {notice && !kind && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="modal-title"
        className={`${isMovableDialog ? "movable-dialog" : ""} ${kind === "bookmark" ? "bookmark-dialog" : ""}`}
        style={
          isMovableDialog
            ? {
                left: `calc(50% + ${modalPosition.x}px)`,
                top: `calc(50% + ${modalPosition.y}px)`,
              }
            : undefined
        }
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else closeMainModal();
        }}
        onClick={(e) => {
          if (hasMovedModal.current) {
            hasMovedModal.current = false;
            return;
          }
          if (e.target === dialog.current && !busy) closeMainModal();
        }}
      >
        <div className="modal-content">
          <div
            className={`modal-heading ${isMovableDialog ? "draggable" : ""} ${isDraggingModal ? "dragging" : ""}`}
            onPointerDown={startModalDrag}
            onPointerMove={moveModal}
            onPointerUp={stopModalDrag}
            onPointerCancel={stopModalDrag}
            title={isMovableDialog ? "Arraste para mover o modal" : undefined}
          >
            <div>
              <h2 id="modal-title">
                {draft.id ? "Editar" : kind === "collection" ? "Nova" : "Novo"}{" "}
                {kind === "collection" ? "coleção" : "favorito"}
              </h2>
            </div>
            <div className="modal-heading-actions">
              {draft.id ? (
                <div className="bookmark-actions" aria-label={`Ações da ${kind === "collection" ? "coleção" : "página"}`}>
                  <button
                    type="button"
                    aria-label={`Curtir ${kind === "collection" ? "coleção" : "favorito"}`}
                    aria-pressed={isLiked}
                    title="Curtir"
                    className={isLiked ? "active" : ""}
                    onClick={() => {
                      if (!draft.id) return;
                      setIsLiked(toggleStoredId(draft.id, likedIds, setLikedIds, "pinicon-liked"));
                    }}
                  >
                    <Heart size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Favoritar ${kind === "collection" ? "coleção" : "página"}`}
                    title="Favoritar"
                    aria-pressed={isBookmarked}
                    className={isBookmarked ? "active" : ""}
                    onClick={() => {
                      if (!draft.id) return;
                      setIsBookmarked(toggleStoredId(draft.id, bookmarkedIds, setBookmarkedIds, "pinicon-bookmarked"));
                    }}
                  >
                    <BookmarkIcon size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Compartilhar ${kind === "collection" ? "coleção" : "favorito"}`}
                    title="Copiar link"
                    onClick={() => {
                      void navigator.clipboard?.writeText(draft.url || location.href);
                      setNotice("Link copiado.");
                    }}
                  >
                    <Share2 size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={draft.isPublic ? "Tornar privado" : "Tornar público"}
                    title={draft.isPublic ? "Público" : "Privado"}
                    className={!draft.isPublic ? "active" : ""}
                    onClick={() => setDraft({ ...draft, isPublic: !draft.isPublic })}
                  >
                    <Lock size={16} />
                  </button>
                </div>
              ) : kind === "bookmark" ? (
                <div className="bookmark-privacy-header">
                  <Privacy
                    value={draft.isPublic}
                    onChange={(isPublic) => setDraft({ ...draft, isPublic })}
                  />
                </div>
              ) : null}
              <button
                className="icon-button"
                type="button"
                disabled={busy}
                aria-label="Fechar modal"
                onClick={closeMainModal}
              >
                <X size={20} />
              </button>
            </div>
          </div>
          <form className={kind === "bookmark" ? "bookmark-form" : ""} onSubmit={save}>
            <fieldset disabled={busy}>
              {kind === "bookmark" && (
                <div className="bookmark-preview">
                  <Sphere bookmark={draft} />
                  <div>
                    <strong>{draft.name || "Seu próximo favorito"}</strong>
                    <p>{draft.url}</p>
                  </div>
                  <ArrowUpRight size={18} />
                </div>
              )}
              <label className={kind === "bookmark" ? "bookmark-name" : ""}>
                Nome
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder={
                    kind === "collection"
                      ? "Ex.: Design e inspiração"
                      : "Nome do site"
                  }
                />
              </label>
              {kind === "bookmark" && (
                <label className="bookmark-url">
                  URL do site
                  <input
                    required
                    value={draft.url}
                    onChange={(e) =>
                      setDraft({ ...draft, url: e.target.value })
                    }
                    onBlur={() => void discoverBookmarkMetadata()}
                  />
                </label>
              )}
              <label className={kind === "bookmark" ? "bookmark-description" : ""}>
                Descrição <span className="optional">opcional</span>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={draft.description}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                  placeholder="O que torna esse lugar especial?"
                />
              </label>
              {kind === "collection" && draft.id && (
                <>
                  <section
                  className="collection-bookmarks-editor"
                  aria-labelledby="collection-bookmarks-title"
                >
                  <div className="collection-bookmarks-heading">
                    <h3 id="collection-bookmarks-title">Favicons</h3>
                    <span>{editingCollectionBookmarks.length}</span>
                  </div>
                  {editingCollectionBookmarks.length ? (
                    <ul className="collection-bookmarks-list">
                      {editingCollectionBookmarks.map((bookmark) => (
                        <li key={bookmark.id} className="collection-bookmark-row">
                          <span className="collection-bookmark-favicon">
                            {bookmark.favicon ? (
                              <img src={bookmark.favicon} alt="" />
                            ) : (
                              <Globe2 size={16} />
                            )}
                          </span>
                          <span className="collection-bookmark-name">
                            {bookmark.name}
                          </span>
                          <div className="collection-bookmark-actions">
                            <button
                              type="button"
                              aria-label={`Editar favicon ${bookmark.name}`}
                              title="Editar favorito"
                              onClick={() => editBookmarkFromCollection(bookmark)}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remover favicon ${bookmark.name}`}
                              title="Remover favorito"
                              onClick={() => editBookmarkFromCollection(bookmark, true)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="help">Esta coleção ainda não tem favicons.</p>
                  )}
                  </section>
                  <div className="shape-options">
                  <span>Formato dos favicons</span>
                  <div>
                    {[
                      ["circle", "Redondo"],
                      ["square", "Quadrado"],
                      ["rounded", "Estilo iPhone"],
                    ].map(([shape, label]) => (
                      <button
                        type="button"
                        key={shape}
                        className={draft.shape === shape ? "active" : ""}
                        aria-pressed={draft.shape === shape}
                        onClick={() =>
                          setDraft({ ...draft, shape: shape as Draft["shape"] })
                        }
                      >
                        <span className={`shape-sample ${shape}`} />
                        {label}
                      </button>
                    ))}
                  </div>
                  </div>
                </>
              )}
              {kind === "bookmark" && (
                <>
                  <label className="bookmark-collection">
                    Coleção
                    <select
                      required
                      disabled={Boolean(lockedBookmarkCollectionId)}
                      value={draft.collectionId}
                      onChange={(e) => {
                        const collectionId = e.target.value;
                        if (collectionId === "__new_collection__") {
                          setCollectionDraft({ ...blank });
                          setCollectionModalPosition({ x: 0, y: 0 });
                          setIsCollectionCreatorOpen(true);
                          return;
                        }
                        setDraft({ ...draft, collectionId });
                      }}
                    >
                      <option value="" disabled>
                        Selecione uma coleção
                      </option>
                      {collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                      <option value="__new_collection__">
                        + Criar nova coleção
                      </option>
                    </select>
                  </label>
                  {!collections.length && (
                    <p className="help">
                      Todo favorito precisa pertencer a uma coleção. Crie uma
                      abaixo.
                    </p>
                  )}
                  <div className="bookmark-options">
                    <details className="icon-options" open={!draft.favicon}>
                      <summary>
                        {draft.favicon
                          ? "Personalizar favicon"
                          : "Favicon não encontrado? Adicione o seu."}
                      </summary>
                      <div className="icon-input">
                        <input
                          type="url"
                          aria-label="Link do favicon"
                          placeholder="https://site.com/icone.png"
                          value={iconUrl}
                          onChange={(e) => setIconUrl(e.target.value)}
                        />
                        <button
                          type="button"
                          className="secondary"
                          disabled={!iconUrl}
                          onClick={() => setIcon(iconUrl)}
                        >
                          Usar link
                        </button>
                      </div>
                      <label className="upload">
                        <Upload size={15} />
                        Enviar imagem local
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif,.ico"
                          onChange={(e) => void upload(e.target.files?.[0])}
                        />
                      </label>
                      <p className="help">
                        PNG, JPG, WebP, GIF ou ICO. Até 2 MB.
                      </p>
                    </details>
                  </div>
                </>
              )}
              <div className={kind === "bookmark" ? "bookmark-color" : ""}>
                <label>
                  Estilo de cor{" "}
                  <span className="optional">
                    {kind === "bookmark"
                      ? "extraída do favicon · personalizável"
                      : ""}
                  </span>
                </label>
                <div className="color-picker">
                  {[
                    "#b9ee78",
                    "#7cc9ec",
                    "#ae9cf4",
                    "#eea4c3",
                    "#edb677",
                    "#9ba6b2",
                  ].map((color) => (
                    <button
                      type="button"
                      key={color}
                      style={{ background: color }}
                      aria-label={`Usar cor ${color}`}
                      aria-pressed={draft.color === color}
                      onClick={() => setDraft({ ...draft, color })}
                    >
                      {draft.color === color && <Check size={18} />}
                    </button>
                  ))}
                  <input
                    type="color"
                    aria-label="Escolher outra cor"
                    value={draft.color}
                    onChange={(e) =>
                      setDraft({ ...draft, color: e.target.value })
                    }
                  />
                </div>
              </div>
              {kind !== "bookmark" && !draft.id && (
                <div>
                  <Privacy
                    value={draft.isPublic}
                    onChange={(isPublic) => setDraft({ ...draft, isPublic })}
                  />
                </div>
              )}
            </fieldset>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {confirmDelete ? (
              <div className="delete-confirm">
                <p>
                  {kind === "collection"
                    ? "Excluir esta coleção e todos os seus favoritos? Esta ação não pode ser desfeita."
                    : "Excluir este favorito? Esta ação não pode ser desfeita."}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  className="danger"
                  onClick={remove}
                >
                  Confirmar exclusão
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="secondary"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="modal-footer">
                {draft.id && (
                  <button
                    className="danger-text"
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Excluir
                  </button>
                )}
                <button
                  className="secondary cancel"
                  type="button"
                  disabled={busy}
                  onClick={closeMainModal}
                >
                  Cancelar
                </button>
                <button
                  className="primary"
                  type="submit"
                  disabled={
                    busy || (kind === "bookmark" && !draft.collectionId)
                  }
                >
                  {busy
                    ? "Salvando…"
                    : draft.id
                      ? "Salvar alterações"
                      : kind === "collection"
                        ? "Criar coleção"
                        : "Salvar favorito"}
                </button>
              </div>
            )}
          </form>
        </div>
        {notice && (
          <div className="toast modal-toast" role="status">
            <span>{notice}</span>
            <button aria-label="Fechar aviso" onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
      </dialog>
      <dialog
        ref={collectionDialog}
        aria-labelledby="collection-creator-title"
        className="movable-dialog collection-creator-dialog"
        style={{
          left: `calc(50% + ${collectionModalPosition.x}px)`,
          top: `calc(50% + ${collectionModalPosition.y}px)`,
        }}
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setIsCollectionCreatorOpen(false);
        }}
        onClick={(e) => {
          if (e.target === collectionDialog.current && !busy)
            setIsCollectionCreatorOpen(false);
        }}
      >
        <div className="modal-content">
          <div
            className="modal-heading draggable"
            onPointerDown={startCollectionModalDrag}
            onPointerMove={moveCollectionModal}
            onPointerUp={stopCollectionModalDrag}
            onPointerCancel={stopCollectionModalDrag}
            title="Arraste para mover o modal"
          >
            <h2 id="collection-creator-title">Nova coleção</h2>
            <button
              className="icon-button"
              type="button"
              disabled={busy}
              aria-label="Fechar modal"
              onClick={() => setIsCollectionCreatorOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <form onSubmit={saveCollectionFromBookmark}>
            <fieldset disabled={busy}>
              <label>
                Nome
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={collectionDraft.name}
                  onChange={(e) =>
                    setCollectionDraft({ ...collectionDraft, name: e.target.value })
                  }
                  placeholder="Ex.: Design e inspiração"
                />
              </label>
              <label>
                Descrição <span className="optional">opcional</span>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={collectionDraft.description}
                  onChange={(e) =>
                    setCollectionDraft({
                      ...collectionDraft,
                      description: e.target.value,
                    })
                  }
                  placeholder="O que reúne estes favoritos?"
                />
              </label>
              <label>Estilo de cor</label>
              <div className="color-picker">
                {[
                  "#b9ee78",
                  "#7cc9ec",
                  "#ae9cf4",
                  "#eea4c3",
                  "#edb677",
                  "#9ba6b2",
                ].map((color) => (
                  <button
                    type="button"
                    key={color}
                    style={{ background: color }}
                    aria-label={`Usar cor ${color}`}
                    aria-pressed={collectionDraft.color === color}
                    onClick={() =>
                      setCollectionDraft({ ...collectionDraft, color })
                    }
                  >
                    {collectionDraft.color === color && <Check size={18} />}
                  </button>
                ))}
                <input
                  type="color"
                  aria-label="Escolher outra cor"
                  value={collectionDraft.color}
                  onChange={(e) =>
                    setCollectionDraft({
                      ...collectionDraft,
                      color: e.target.value,
                    })
                  }
                />
              </div>
              <Privacy
                value={collectionDraft.isPublic}
                onChange={(isPublic) =>
                  setCollectionDraft({ ...collectionDraft, isPublic })
                }
              />
            </fieldset>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="modal-footer">
              <button
                className="secondary cancel"
                type="button"
                disabled={busy}
                onClick={() => setIsCollectionCreatorOpen(false)}
              >
                Cancelar
              </button>
              <button className="primary" type="submit" disabled={busy}>
                {busy ? "Criando…" : "Criar coleção"}
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
}
