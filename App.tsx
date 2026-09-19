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
  LockOpen,
  LogOut,
  Moon,
  Pencil,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Sun,
  Trash2,
  User,
  X,
  Upload,
  Copy,
  Download,
} from "lucide-react";
import type { Account, Bookmark, BookmarkGroup, Collection } from "./types";
import PasswordField from "./PasswordField";
import "./styles.css";

type GoogleTokenClient = { requestAccessToken: () => void };
type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (options: {
        client_id: string;
        scope: string;
        callback: (response: { access_token?: string }) => void;
      }) => GoogleTokenClient;
    };
  };
};
declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

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
  shape: "rounded",
  behavior: "expansive",
};
type Draft = Omit<typeof blank, "shape" | "behavior"> & {
  id?: string;
  shape: string;
  behavior: string;
};
type FilterKey =
  | "liked"
  | "bookmarked"
  | "public"
  | "private"
  | "mostUsed"
  | "leastUsed"
  | "newest"
  | "oldest";
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
        <strong>Visibilidade</strong>
      </div>
      <button
        type="button"
        role="switch"
        aria-label="Visibilidade pública"
        aria-checked={value}
        title={value ? "Público" : "Privado"}
        className={`switch ${value ? "on" : ""}`}
        onClick={() => onChange(!value)}
      >
        <span aria-hidden="true">
          {value ? <LockOpen size={12} /> : <Lock size={12} />}
        </span>
      </button>
    </div>
  );
}
// Alguns sites só têm mesmo um favicon minúsculo (ex.: um .ico de 16px, sem
// apple-touch-icon nem manifest disponíveis em lugar nenhum) — nesse caso,
// esticar a imagem pra preencher os ~220px do card de prévia deixa ela
// borradíssima. Em vez disso, abaixo de 96px de origem, mostra em tamanho
// fixo e moderado (object-fit: contain) centralizado no fundo colorido, em
// vez de tentar cobrir a área toda. Componente à parte só pra poder resetar
// esse estado (via remount, key={bookmark.id} no card) a cada favorito novo.
function PreviewFavicon({ src }: { src: string }) {
  const [isSmallSource, setIsSmallSource] = useState(false);
  return (
    <img
      src={src}
      alt=""
      className={isSmallSource ? "is-small-source" : ""}
      onLoad={(e) => setIsSmallSource(e.currentTarget.naturalWidth < 96)}
    />
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
  const borderRadius =
    shape === "square" ? 0 : shape === "rounded" ? "28%" : "50%";
  useEffect(() => setFailed(false), [bookmark.favicon]);
  return (
    <span
      className={`sphere sphere-${shape}`}
      style={
        {
          "--orb": bookmark.color,
          borderRadius,
        } as React.CSSProperties
      }
    >
      {bookmark.favicon && !failed ? (
        <img src={bookmark.favicon} alt="" onError={() => setFailed(true)} />
      ) : (
        <span>{bookmark.name.slice(0, 1).toUpperCase() || <Globe2 />}</span>
      )}
    </span>
  );
}
// Ícone de grupo (várias moldura numa só, estilo App Library do iPhone): usa
// a mesma classe "sphere" pra ter o mesmo tamanho/hover/border-radius de um
// favorito comum, só que com uma mini-grade 2x2 dos favicons de dentro em vez
// de uma imagem só. Não participa do sistema de hover-toolbar/preview-card
// (esse é tipado especificamente pra Bookmark) — clicar sempre abre o
// popover de conteúdo do grupo, com ou sem o modo de edição ligado.
function GroupTile({
  group,
  shape = "circle",
  onOpen,
}: {
  group: Pick<BookmarkGroup, "id" | "name" | "color" | "bookmarks">;
  shape?: string;
  onOpen: () => void;
}) {
  const borderRadius =
    shape === "square" ? 0 : shape === "rounded" ? "28%" : "50%";
  const preview = group.bookmarks.slice(0, 4);
  const extra = group.bookmarks.length - preview.length;
  return (
    <button
      type="button"
      className={`sphere sphere-${shape} group-tile`}
      style={{ "--orb": group.color, borderRadius } as React.CSSProperties}
      aria-label={`Abrir grupo ${group.name}`}
      title={group.name}
      onClick={onOpen}
    >
      <span className="group-tile-grid">
        {preview.map((b) =>
          b.favicon ? (
            <img key={b.id} src={b.favicon} alt="" />
          ) : (
            <span key={b.id} className="group-tile-letter">
              {b.name.slice(0, 1).toUpperCase() || <Globe2 size={9} />}
            </span>
          ),
        )}
      </span>
      {extra > 0 && <span className="group-tile-badge">+{extra}</span>}
    </button>
  );
}
function CollectionRow({
  collection,
  readOnly,
  toolbarsEnabled,
  likedIds,
  bookmarkedIds,
  edit,
  remove,
  add,
  editBookmark,
  removeBookmark,
  openBookmark,
  toggleLiked,
  toggleBookmarked,
  shareBookmark,
  toggleVisibility,
  toggleBehavior,
  createGroup,
  moveToGroup,
  renameGroup,
  deleteGroup,
}: {
  collection: Collection;
  readOnly: boolean;
  toolbarsEnabled: boolean;
  likedIds: string[];
  bookmarkedIds: string[];
  edit: () => void;
  remove: () => void;
  add: () => void;
  editBookmark: (bookmark: Bookmark) => void;
  removeBookmark: (bookmark: Bookmark) => void;
  openBookmark: (bookmark: Bookmark) => void;
  toggleLiked: (bookmark: Bookmark) => void;
  toggleBookmarked: (bookmark: Bookmark) => void;
  shareBookmark: (bookmark: Bookmark) => void;
  toggleVisibility: (bookmark: Bookmark) => void;
  toggleBehavior: (collection: Collection) => void;
  createGroup: (
    collectionId: string,
    bookmarkIds: string[],
  ) => Promise<BookmarkGroup | null>;
  moveToGroup: (bookmarkId: string, groupId: string | null) => Promise<void>;
  renameGroup: (groupId: string, name: string, color: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
}) {
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc" | null>(
    null,
  );
  // Persistido em collection.behavior (não é estado local): assim a coleção volta
  // expandida/recolhida do jeito que o usuário deixou mesmo depois de sair e
  // entrar de novo no site, em vez de sempre remontar recolhida.
  const isExpanded = collection.behavior === "expansive";
  const [bookmarkToolbar, setBookmarkToolbar] = useState<{
    bookmark: Bookmark;
    x?: number;
    y?: number;
  } | null>(null);
  const [previewCard, setPreviewCard] = useState<{
    bookmark: Bookmark;
    x?: number;
    y?: number;
  } | null>(null);
  const [previewCardLeaving, setPreviewCardLeaving] = useState(false);
  // Arrastar um ícone sobre outro (só com o lápis ligado) cria/adiciona a um
  // grupo — estado local porque precisa re-renderizar pra destacar o alvo.
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<BookmarkGroup | null>(null);
  const pageTransitionTimer = useRef<number | null>(null);
  const bookmarkToolbarTimer = useRef<number | null>(null);
  const previewCardTimer = useRef<number | null>(null);
  const previewCardExitTimer = useRef<number | null>(null);
  type GridItem =
    | { kind: "bookmark"; id: string; sortKey: string; bookmark: Bookmark }
    | { kind: "group"; id: string; sortKey: string; group: BookmarkGroup };
  const items: GridItem[] = [
    ...collection.bookmarks.map((b) => ({
      kind: "bookmark" as const,
      id: b.id,
      sortKey: b.name,
      bookmark: b,
    })),
    // Grupo sem nenhum favorito visível acontece no perfil público quando todo
    // mundo dentro é privado — esconder em vez de mostrar uma moldura vazia.
    ...collection.groups
      .filter((g) => g.bookmarks.length)
      .map((g) => ({
        kind: "group" as const,
        id: g.id,
        sortKey: g.name,
        group: g,
      })),
  ];
  // Contagem de favoritos de verdade (inclusive os de dentro de grupos) é
  // diferente da contagem de "slots" na grade (um grupo conta como 1 slot).
  const totalBookmarks =
    collection.bookmarks.length +
    collection.groups.reduce((sum, g) => sum + g.bookmarks.length, 0);
  const pages = Math.max(1, Math.ceil(items.length / 10));
  const active = Math.min(page, pages - 1);
  const sortedItems = sortDirection
    ? [...items].sort((a, b) =>
        sortDirection === "asc"
          ? a.sortKey.localeCompare(b.sortKey, "pt-BR")
          : b.sortKey.localeCompare(a.sortKey, "pt-BR"),
      )
    : items;

  useEffect(
    () => () => {
      if (pageTransitionTimer.current) {
        window.clearTimeout(pageTransitionTimer.current);
      }
      if (bookmarkToolbarTimer.current)
        window.clearTimeout(bookmarkToolbarTimer.current);
      if (previewCardTimer.current)
        window.clearTimeout(previewCardTimer.current);
      if (previewCardExitTimer.current)
        window.clearTimeout(previewCardExitTimer.current);
    },
    [],
  );

  const changePage = (
    nextPage: number,
    nextDirection: "forward" | "backward",
  ) => {
    if (isPageTransitioning || nextPage < 0 || nextPage >= pages) return;
    setDirection(nextDirection);
    setIsPageTransitioning(true);
    pageTransitionTimer.current = window.setTimeout(() => {
      setPage(nextPage);
      setIsPageTransitioning(false);
    }, 180);
  };
  useEffect(() => {
    if (toolbarsEnabled) return;
    if (bookmarkToolbarTimer.current)
      window.clearTimeout(bookmarkToolbarTimer.current);
    setBookmarkToolbar(null);
  }, [toolbarsEnabled]);
  useEffect(() => {
    if (!toolbarsEnabled) return;
    if (previewCardTimer.current) window.clearTimeout(previewCardTimer.current);
    if (previewCardExitTimer.current)
      window.clearTimeout(previewCardExitTimer.current);
    setPreviewCard(null);
    setPreviewCardLeaving(false);
  }, [toolbarsEnabled]);
  const scheduleBookmarkToolbar = (next: {
    bookmark: Bookmark;
    x?: number;
    y?: number;
  }) => {
    if (!toolbarsEnabled) return;
    if (bookmarkToolbarTimer.current)
      window.clearTimeout(bookmarkToolbarTimer.current);
    setBookmarkToolbar(next);
  };
  const deferBookmarkToolbarClear = () => {
    if (bookmarkToolbarTimer.current)
      window.clearTimeout(bookmarkToolbarTimer.current);
    bookmarkToolbarTimer.current = window.setTimeout(
      () => setBookmarkToolbar(null),
      350,
    );
  };
  const keepBookmarkToolbarVisible = () => {
    if (bookmarkToolbarTimer.current)
      window.clearTimeout(bookmarkToolbarTimer.current);
  };
  const clearBookmarkToolbar = (event: React.MouseEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget as HTMLElement | null;
    if (!nextTarget?.closest(".favorite-controls")) deferBookmarkToolbarClear();
  };
  // Só quando o modo de edição (lápis) está desligado: passar o mouse sobre um
  // ícone por 1s (como um tooltip nativo) mostra um cartão maior de prévia, em vez
  // da barra de edição — que continua sendo o comportamento com o lápis ligado.
  const schedulePreviewCard = (next: {
    bookmark: Bookmark;
    x?: number;
    y?: number;
  }) => {
    if (toolbarsEnabled) return;
    if (previewCardTimer.current) window.clearTimeout(previewCardTimer.current);
    if (previewCardExitTimer.current)
      window.clearTimeout(previewCardExitTimer.current);
    setPreviewCardLeaving(false);
    previewCardTimer.current = window.setTimeout(
      () => setPreviewCard(next),
      250,
    );
  };
  // Some rápido (ver duração da animação "favorite-preview-out" no CSS): o
  // cartão continua montado durante essa saída (com a classe "is-leaving") e só
  // é removido de fato depois que a animação termina.
  const deferPreviewCardClear = () => {
    if (previewCardTimer.current) window.clearTimeout(previewCardTimer.current);
    previewCardTimer.current = window.setTimeout(() => {
      setPreviewCardLeaving(true);
      previewCardExitTimer.current = window.setTimeout(() => {
        setPreviewCard(null);
        setPreviewCardLeaving(false);
      }, 220);
    }, 250);
  };
  const keepPreviewCardVisible = () => {
    if (previewCardTimer.current) window.clearTimeout(previewCardTimer.current);
    if (previewCardExitTimer.current)
      window.clearTimeout(previewCardExitTimer.current);
    setPreviewCardLeaving(false);
  };
  // Soltar em cima de outro favorito cria um grupo novo com os dois; soltar em
  // cima de um grupo já existente só adiciona o item arrastado a ele. Soltar
  // em espaço vazio (sem alvo) não faz nada — reordenar livremente não é
  // suportado, só "largar em cima de outro ícone" aciona o agrupamento.
  function handleDrop(target: GridItem) {
    const sourceId = draggedId;
    setDraggedId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === target.id) return;
    if (target.kind === "group") {
      void moveToGroup(sourceId, target.id);
    } else {
      void createGroup(collection.id, [sourceId, target.id]).then(
        (created) => {
          if (created) setOpenGroup(created);
        },
      );
    }
  }
  // Sempre a versão mais atual do grupo aberto (não o objeto capturado no
  // momento do clique) — assim a lista dentro do popover reflete remoções/
  // renomeações na hora, sem precisar fechar e abrir de novo.
  const openGroupLive = openGroup
    ? collection.groups.find((g) => g.id === openGroup.id) || null
    : null;
  const groupDialog = useRef<HTMLDialogElement>(null);
  const [groupName, setGroupName] = useState("");
  const [groupColor, setGroupColor] = useState("");
  useEffect(() => {
    if (openGroupLive) {
      setGroupName(openGroupLive.name);
      setGroupColor(openGroupLive.color);
    }
  }, [openGroupLive?.id]);
  useEffect(() => {
    if (openGroup && !groupDialog.current?.open) groupDialog.current?.showModal();
    else if (!openGroup && groupDialog.current?.open) groupDialog.current.close();
  }, [openGroup]);
  useEffect(() => {
    // O grupo foi excluído (por essa aba ou por um reload) enquanto o popover
    // estava aberto — fecha em vez de mostrar uma lista vazia órfã.
    if (openGroup && !openGroupLive) setOpenGroup(null);
  }, [openGroup, openGroupLive]);
  return (
    <>
    <article
      className={`collection ${bookmarkToolbar || toolbarsEnabled || previewCard ? "has-visible-toolbar" : ""} ${toolbarsEnabled ? "toolbar-open" : ""}`}
    >
      <div className="collection-heading">
        <div className="collection-label">
          <span
            className="collection-dot"
            style={{ background: collection.color }}
          />
          <h3>{collection.name}</h3>
          <span className="count">{totalBookmarks}</span>
        </div>
      </div>
      {collection.description && (
        <p className="collection-description">{collection.description}</p>
      )}
      <div className={`pill ${isExpanded ? "is-expanded" : ""}`}>
        {!readOnly && toolbarsEnabled && (
          <div
            className="collection-controls"
            aria-label={`Ações da coleção ${collection.name}`}
          >
            <button
              type="button"
              aria-label={`${isExpanded ? "Recolher" : "Expandir"} coleção ${collection.name}`}
              aria-expanded={isExpanded}
              title={isExpanded ? "Recolher coleção" : "Expandir coleção"}
              onClick={() => toggleBehavior(collection)}
            >
              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <button
              type="button"
              aria-label={`Ordenar favoritos de ${collection.name} de ${sortDirection === "asc" ? "Z a A" : "A a Z"}`}
              title={
                sortDirection === "asc"
                  ? "Ordenar de Z a A"
                  : "Ordenar de A a Z"
              }
              onClick={() =>
                setSortDirection((value) => (value === "asc" ? "desc" : "asc"))
              }
            >
              <ArrowDownAZ size={13} />
            </button>
            <button
              type="button"
              aria-label={`Adicionar favorito à coleção ${collection.name}`}
              title="Adicionar favorito"
              onClick={add}
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              aria-label={`Editar coleção ${collection.name}`}
              title="Editar coleção"
              onClick={edit}
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              aria-label={`Excluir coleção ${collection.name}`}
              title="Excluir coleção"
              onClick={remove}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
        {!readOnly && bookmarkToolbar && (
          <div
            className="collection-controls favorite-controls"
            style={{ left: bookmarkToolbar.x, top: bookmarkToolbar.y }}
            aria-label={`Ações do favorito ${bookmarkToolbar.bookmark.name}`}
            onMouseEnter={keepBookmarkToolbarVisible}
            onMouseLeave={deferBookmarkToolbarClear}
          >
            <button
              type="button"
              aria-label={`Editar favorito ${bookmarkToolbar.bookmark.name}`}
              title="Editar"
              onClick={() => editBookmark(bookmarkToolbar.bookmark)}
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              aria-label={
                bookmarkToolbar.bookmark.isPublic
                  ? "Tornar privado"
                  : "Tornar público"
              }
              title={bookmarkToolbar.bookmark.isPublic ? "Privar" : "Exibir"}
              className={!bookmarkToolbar.bookmark.isPublic ? "active" : ""}
              onClick={() => {
                const bookmark = bookmarkToolbar.bookmark;
                // Atualiza a barra na hora (o ícone reflete o próximo estado antes da
                // resposta do servidor); sem isso, ela só refletia o novo estado depois
                // que o mouse saía e voltava a passar sobre o ícone.
                setBookmarkToolbar((current) =>
                  current?.bookmark.id === bookmark.id
                    ? {
                        ...current,
                        bookmark: {
                          ...current.bookmark,
                          isPublic: !current.bookmark.isPublic,
                        },
                      }
                    : current,
                );
                toggleVisibility(bookmark);
              }}
            >
              {bookmarkToolbar.bookmark.isPublic ? (
                <LockOpen size={13} />
              ) : (
                <Lock size={13} />
              )}
            </button>
            <button
              type="button"
              aria-label={`Excluir favorito ${bookmarkToolbar.bookmark.name}`}
              title="Excluir"
              onClick={() => removeBookmark(bookmarkToolbar.bookmark)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
        {!toolbarsEnabled && previewCard && (
          <div
            className="favorite-preview-anchor"
            style={{ left: previewCard.x, top: previewCard.y }}
          >
            <div
              key={previewCard.bookmark.id}
              className={`favorite-preview ${previewCardLeaving ? "is-leaving" : ""}`}
              aria-label={`Prévia do favorito ${previewCard.bookmark.name}`}
              onMouseEnter={keepPreviewCardVisible}
              onMouseLeave={deferPreviewCardClear}
            >
              <a
                className="favorite-preview-link"
                href={previewCard.bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir favorito ${previewCard.bookmark.name}`}
                onClick={() => openBookmark(previewCard.bookmark)}
              />
              <div
                className="favorite-preview-media"
                style={{ background: previewCard.bookmark.color }}
              >
                {previewCard.bookmark.favicon ? (
                  <PreviewFavicon src={previewCard.bookmark.favicon} />
                ) : (
                  <span>
                    {previewCard.bookmark.name.slice(0, 1).toUpperCase() || (
                      <Globe2 />
                    )}
                  </span>
                )}
                <button
                  type="button"
                  className="favorite-preview-edit"
                  aria-label={`Editar favorito ${previewCard.bookmark.name}`}
                  title="Editar"
                  onClick={() => editBookmark(previewCard.bookmark)}
                >
                  <Pencil size={13} />
                </button>
                <strong className="favorite-preview-name">
                  {previewCard.bookmark.name}
                </strong>
              </div>
              <div className="favorite-preview-footer">
                <div className="favorite-preview-actions">
                  <button
                    type="button"
                    aria-label={`Curtir favorito ${previewCard.bookmark.name}`}
                    aria-pressed={likedIds.includes(previewCard.bookmark.id)}
                    title="Curtir"
                    className={
                      likedIds.includes(previewCard.bookmark.id) ? "active" : ""
                    }
                    onClick={() => toggleLiked(previewCard.bookmark)}
                  >
                    <Heart size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Favoritar ${previewCard.bookmark.name}`}
                    aria-pressed={bookmarkedIds.includes(
                      previewCard.bookmark.id,
                    )}
                    title="Favoritar"
                    className={
                      bookmarkedIds.includes(previewCard.bookmark.id)
                        ? "active"
                        : ""
                    }
                    onClick={() => toggleBookmarked(previewCard.bookmark)}
                  >
                    <BookmarkIcon size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Compartilhar favorito ${previewCard.bookmark.name}`}
                    title="Compartilhar"
                    onClick={() => shareBookmark(previewCard.bookmark)}
                  >
                    <Share2 size={15} />
                  </button>
                </div>
                {previewCard.bookmark.description && (
                  <div className="favorite-preview-meta">
                    <span>{previewCard.bookmark.description}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
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
            ? sortedItems
            : sortedItems.slice(active * 10, active * 10 + 10)
          ).map((item) => (
            <div
              className={`favorite ${dragOverId === item.id && draggedId !== item.id ? "drop-target" : ""}`}
              key={item.id}
              draggable={toolbarsEnabled}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                setDraggedId(item.id);
              }}
              onDragOver={(event) => {
                if (!toolbarsEnabled || !draggedId) return;
                event.preventDefault();
                setDragOverId(item.id);
              }}
              onDragLeave={() =>
                setDragOverId((id) => (id === item.id ? null : id))
              }
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(item);
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDragOverId(null);
              }}
              onMouseEnter={(event) => {
                if (item.kind !== "bookmark") return;
                const b = item.bookmark;
                const pill = event.currentTarget.closest(".pill");
                const favoriteRect =
                  event.currentTarget.getBoundingClientRect();
                const pillRect = pill?.getBoundingClientRect();
                const x = pillRect
                  ? favoriteRect.left - pillRect.left + favoriteRect.width / 2
                  : undefined;
                if (toolbarsEnabled) {
                  scheduleBookmarkToolbar({
                    bookmark: b,
                    x,
                    y: pillRect
                      ? favoriteRect.top - pillRect.top - 16
                      : undefined,
                  });
                } else {
                  // Centro do ícone (não o topo): o cartão de prévia se ancora por
                  // esse ponto pra crescer ao redor do ícone, não acima dele.
                  schedulePreviewCard({
                    bookmark: b,
                    x,
                    y: pillRect
                      ? favoriteRect.top -
                        pillRect.top +
                        favoriteRect.height / 2
                      : undefined,
                  });
                }
              }}
              onMouseLeave={(event) => {
                if (item.kind !== "bookmark") return;
                if (toolbarsEnabled) clearBookmarkToolbar(event);
                else deferPreviewCardClear();
              }}
            >
              {item.kind === "bookmark" ? (
                <a
                  href={item.bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={item.bookmark.name}
                  onClick={() => openBookmark(item.bookmark)}
                >
                  <Sphere bookmark={item.bookmark} shape={collection.shape} />
                  <span className="sr-only">{item.bookmark.name}</span>
                </a>
              ) : (
                <>
                  <GroupTile
                    group={item.group}
                    shape={collection.shape}
                    onOpen={() => setOpenGroup(item.group)}
                  />
                  <span className="sr-only">{item.group.name}</span>
                </>
              )}
            </div>
          ))}
          {!items.length && (
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
          {Math.min(active * 10 + 10, items.length)} de{" "}
          {items.length} favoritos
        </p>
      )}
    </article>
    <dialog
      ref={groupDialog}
      className="confirm-dialog group-dialog"
      aria-labelledby="group-dialog-title"
      onCancel={() => setOpenGroup(null)}
      onClick={(e) => {
        if (e.target === groupDialog.current) setOpenGroup(null);
      }}
    >
      {openGroupLive && (
        <div className="modal-content">
          <div className="modal-heading">
            <h2 id="group-dialog-title">
              {readOnly ? openGroupLive.name : "Editar grupo"}
            </h2>
            <button
              className="icon-button"
              type="button"
              aria-label="Fechar modal"
              onClick={() => setOpenGroup(null)}
            >
              <X size={20} />
            </button>
          </div>
          {!readOnly && (
            <div className="group-dialog-fields">
              <label>
                Nome
                <input
                  maxLength={120}
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  onBlur={() =>
                    groupName.trim() &&
                    groupName !== openGroupLive.name &&
                    void renameGroup(openGroupLive.id, groupName, groupColor)
                  }
                />
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
                    aria-pressed={groupColor === color}
                    onClick={() => {
                      setGroupColor(color);
                      void renameGroup(openGroupLive.id, groupName, color);
                    }}
                  >
                    {groupColor === color && <Check size={18} />}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ul className="collection-bookmarks-list">
            {openGroupLive.bookmarks.map((bookmark) => (
              <li key={bookmark.id} className="collection-bookmark-row">
                <span className="collection-bookmark-favicon">
                  {bookmark.favicon ? (
                    <img src={bookmark.favicon} alt="" />
                  ) : (
                    <Globe2 size={16} />
                  )}
                </span>
                <a
                  className="collection-bookmark-name"
                  href={bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => openBookmark(bookmark)}
                >
                  {bookmark.name}
                </a>
                {!readOnly && (
                  <div className="collection-bookmark-actions">
                    <button
                      type="button"
                      aria-label={`Editar favorito ${bookmark.name}`}
                      title="Editar favorito"
                      onClick={() => editBookmark(bookmark)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remover ${bookmark.name} do grupo`}
                      title="Remover do grupo"
                      onClick={() => void moveToGroup(bookmark.id, null)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {!readOnly && (
            <div className="modal-footer">
              <button
                type="button"
                className="danger-text"
                onClick={() => {
                  void deleteGroup(openGroupLive.id);
                  setOpenGroup(null);
                }}
              >
                Excluir grupo
              </button>
            </div>
          )}
        </div>
      )}
    </dialog>
    </>
  );
}
export default function App({
  account,
  onLogout,
  googleClientId,
}: { account?: Account; onLogout?: () => void; googleClientId?: string } = {}) {
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
  // Excluir pela barra de ferramentas do ícone não deve abrir a janela de edição
  // inteira — só uma confirmação enxuta. Estado à parte do "draft"/"kind" usados
  // pelo modal de edição, pra não precisar montar esse modal só pra excluir.
  const [pendingDeleteBookmark, setPendingDeleteBookmark] =
    useState<Bookmark | null>(null);
  const [lockedBookmarkCollectionId, setLockedBookmarkCollectionId] =
    useState("");
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [likedIds, setLikedIds] = useState<string[]>(() =>
    JSON.parse(localStorage.getItem("pinicon-liked") || "[]"),
  );
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() =>
    JSON.parse(localStorage.getItem("pinicon-bookmarked") || "[]"),
  );
  const [usage, setUsage] = useState<Record<string, number>>(() =>
    JSON.parse(localStorage.getItem("pinicon-usage") || "{}"),
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterKey[]>([]);
  // Controla se as barras de ferramentas (da coleção e dos favoritos) aparecem ao
  // passar o mouse. Desligado por padrão para não atrapalhar quem só quer navegar.
  const [toolbarsEnabled, setToolbarsEnabled] = useState(false);
  const [isCollectionCreatorOpen, setIsCollectionCreatorOpen] = useState(false);
  const [collectionDraft, setCollectionDraft] = useState<Draft>({ ...blank });
  const [profile, setProfile] = useState<Account | undefined>(account);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenu = useRef<HTMLDivElement>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [confirmDisconnectGoogle, setConfirmDisconnectGoogle] = useState(false);
  const [disconnectGooglePassword, setDisconnectGooglePassword] = useState("");
  const googleTokenClient = useRef<GoogleTokenClient | null>(null);
  const [collectionEditorReturn, setCollectionEditorReturn] =
    useState<Draft | null>(null);
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [collectionModalPosition, setCollectionModalPosition] = useState({
    x: 0,
    y: 0,
  });
  const [isDraggingModal, setIsDraggingModal] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const collectionDialog = useRef<HTMLDialogElement>(null);
  const deleteBookmarkDialog = useRef<HTMLDialogElement>(null);
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
  const total = collections.reduce(
    (n, c) =>
      n +
      c.bookmarks.length +
      c.groups.reduce((gn, g) => gn + g.bookmarks.length, 0),
    0,
  );
  const filteredCollection = activeFilters.length
    ? (() => {
        const all = collections.flatMap((collection) => [
          ...collection.bookmarks,
          ...collection.groups.flatMap((group) => group.bookmarks),
        ]);
        let bookmarks = [...all];
        if (activeFilters.includes("liked"))
          bookmarks = bookmarks.filter((bookmark) =>
            likedIds.includes(bookmark.id),
          );
        if (activeFilters.includes("bookmarked"))
          bookmarks = bookmarks.filter((bookmark) =>
            bookmarkedIds.includes(bookmark.id),
          );
        if (activeFilters.includes("public"))
          bookmarks = bookmarks.filter((bookmark) => bookmark.isPublic);
        if (activeFilters.includes("private"))
          bookmarks = bookmarks.filter((bookmark) => !bookmark.isPublic);
        if (activeFilters.includes("newest"))
          bookmarks.sort(
            (a, b) =>
              new Date(b.createdAt || 0).getTime() -
              new Date(a.createdAt || 0).getTime(),
          );
        if (activeFilters.includes("oldest"))
          bookmarks.sort(
            (a, b) =>
              new Date(a.createdAt || 0).getTime() -
              new Date(b.createdAt || 0).getTime(),
          );
        if (activeFilters.includes("mostUsed"))
          bookmarks.sort((a, b) => (usage[b.id] || 0) - (usage[a.id] || 0));
        if (activeFilters.includes("leastUsed"))
          bookmarks.sort((a, b) => (usage[a.id] || 0) - (usage[b.id] || 0));
        return {
          id: "temporary-filter",
          name: "Resultados do filtro",
          description: activeFilters
            .map((filter) => filterLabels[filter])
            .join(" · "),
          color: "#b9ee78",
          isPublic: false,
          bookmarks,
          groups: [],
        };
      })()
    : null;
  const displayedCollections = filteredCollection
    ? [filteredCollection, ...collections]
    : collections;
  const editingCollectionBookmarks =
    kind === "collection" && draft.id
      ? collections.find((collection) => collection.id === draft.id)
          ?.bookmarks || []
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
  // Atualização silenciosa (sem o spinner de tela cheia): usada quando a aba volta a
  // ficar visível, para refletir favoritos salvos por fora (ex: pela extensão) sem
  // exigir um F5 manual. Falhas aqui não perturbam o que já está na tela.
  async function silentReload() {
    try {
      const data = await api(
        sharedId ? `/public/${encodeURIComponent(sharedId)}` : "/collections",
      );
      setCollections(data.collections);
      setOwnerId(data.ownerId || "");
    } catch {}
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
  function toggleBookmarkLiked(bookmark: Bookmark) {
    toggleStoredId(bookmark.id, likedIds, setLikedIds, "pinicon-liked");
  }
  function toggleBookmarkBookmarked(bookmark: Bookmark) {
    toggleStoredId(
      bookmark.id,
      bookmarkedIds,
      setBookmarkedIds,
      "pinicon-bookmarked",
    );
  }
  function shareBookmark(bookmark: Bookmark) {
    void navigator.clipboard?.writeText(bookmark.url);
    setNotice("Link copiado.");
  }
  async function toggleBookmarkVisibility(bookmark: Bookmark) {
    try {
      await api(`/bookmarks/${bookmark.id}`, "PATCH", {
        ...bookmark,
        isPublic: !bookmark.isPublic,
      });
      await silentReload();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function toggleCollectionBehavior(collection: Collection) {
    try {
      await api(`/collections/${collection.id}`, "PATCH", {
        name: collection.name,
        description: collection.description,
        color: collection.color,
        isPublic: collection.isPublic,
        shape: collection.shape,
        behavior: collection.behavior === "expansive" ? "fixed" : "expansive",
      });
      await silentReload();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function createGroup(collectionId: string, bookmarkIds: string[]) {
    try {
      const created = await api("/groups", "POST", {
        collectionId,
        name: "Novo grupo",
        color: "#b9ee78",
        bookmarkIds,
      });
      await silentReload();
      return created as BookmarkGroup;
    } catch (e) {
      setNotice((e as Error).message);
      return null;
    }
  }
  async function moveToGroup(bookmarkId: string, groupId: string | null) {
    try {
      await api(`/bookmarks/${bookmarkId}/move`, "PATCH", { groupId });
      await silentReload();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function renameGroup(groupId: string, name: string, color: string) {
    try {
      await api(`/groups/${groupId}`, "PATCH", { name, color });
      await silentReload();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function deleteGroup(groupId: string) {
    try {
      await api(`/groups/${groupId}`, "DELETE");
      setNotice("Grupo excluído. Os favoritos voltaram para a coleção.");
      await silentReload();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  function toggleFilter(filter: FilterKey) {
    const exclusiveGroups: FilterKey[][] = [
      ["public", "private"],
      ["mostUsed", "leastUsed"],
      ["newest", "oldest"],
    ];
    setActiveFilters((current) => {
      if (current.includes(filter))
        return current.filter((value) => value !== filter);
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
    function refreshIfVisible() {
      if (document.visibilityState === "visible") void silentReload();
    }
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [sharedId]);
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
    if (pendingDeleteBookmark && !deleteBookmarkDialog.current?.open)
      deleteBookmarkDialog.current?.showModal();
    else if (!pendingDeleteBookmark && deleteBookmarkDialog.current?.open)
      deleteBookmarkDialog.current.close();
  }, [pendingDeleteBookmark]);
  useEffect(() => {
    if (isProfileOpen) {
      setNameDraft(profile?.displayName || profile?.name || "");
      setCurrentPassword("");
      setNewPassword("");
      setDeletePassword("");
      setConfirmDeleteAccount(false);
      setProfileError("");
      setProfileNotice("");
    }
  }, [isProfileOpen]);
  useEffect(() => {
    if (!isAccountMenuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (!accountMenu.current?.contains(e.target as Node))
        setIsAccountMenuOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsAccountMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen]);
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
    setLockedBookmarkCollectionId(
      type === "bookmark" ? lockedCollectionId : "",
    );
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
    if (deleting) {
      setPendingDeleteBookmark(bookmark);
      return;
    }
    setCollectionEditorReturn(draft);
    open("bookmark", bookmark);
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
  async function addBookmarkFromUrl(rawUrl: string) {
    setBusy(true);
    setNotice("");
    try {
      const data = await api("/metadata", "POST", { url: rawUrl });
      open("bookmark", data);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    void addBookmarkFromUrl(url.trim());
  }
  async function discoverBookmarkMetadata() {
    const requestedUrl = draft.url.trim();
    if (!requestedUrl || busy || requestedUrl === fetchedMetadataUrl.current)
      return;
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
      // Recarga silenciosa (sem o spinner de tela cheia de reload()): trocar a lista
      // inteira por um spinner remonta as CollectionRow, perdendo estado local delas
      // (página atual, ordenação) mesmo sem o usuário ter mexido nisso.
      await silentReload();
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
      await silentReload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirmRemoveBookmark() {
    if (!pendingDeleteBookmark) return;
    setBusy(true);
    try {
      await api(`/bookmarks/${pendingDeleteBookmark.id}`, "DELETE");
      setPendingDeleteBookmark(null);
      // Só fecha a janela de edição se ela estiver mesmo aberta nesse favorito
      // (excluir pela barra do ícone, ou pela lista de favicons dentro da
      // coleção, não deve abrir nem fechar nenhuma outra janela).
      if (kind === "bookmark" && draft.id === pendingDeleteBookmark.id)
        closeMainModal();
      setNotice("Excluído com sucesso.");
      await silentReload();
    } catch (e) {
      setNotice((e as Error).message);
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
  async function importBookmarksFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const html = await file.text();
      const data = await api("/import", "POST", { html });
      setNotice(
        `Importado: ${data.collections} coleções, ${data.groups} grupos e ${data.bookmarks} favoritos. Os ícones vão sendo preenchidos nos próximos segundos.`,
      );
      await silentReload();
      // Os favicons que não vieram embutidos no arquivo são resolvidos aos
      // poucos em segundo plano no servidor — recarrega de novo algumas vezes
      // pra eles aparecerem sem precisar atualizar a página manualmente.
      [4000, 9000, 15000, 22000, 30000].forEach((ms) =>
        window.setTimeout(() => void silentReload(), ms),
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function exportBookmarks() {
    window.location.href = "/api/export";
  }
  async function saveAvatar(avatar: string) {
    setProfileBusy(true);
    setProfileError("");
    try {
      const data = await api("/auth/avatar", "POST", { avatar });
      setProfile(data.user);
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }
  async function uploadAvatar(file?: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setProfileError("Escolha uma imagem de até 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => void saveAvatar(String(reader.result));
    reader.onerror = () => setProfileError("Não foi possível ler o arquivo.");
    reader.readAsDataURL(file);
  }
  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    setProfileNotice("");
    try {
      const data = await api("/auth/me", "PATCH", { displayName: nameDraft });
      setProfile(data.user);
      setProfileNotice("Nome atualizado.");
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    setProfileNotice("");
    try {
      await api("/auth/change-password", "POST", {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setProfileNotice(
        profile?.hasPassword ? "Senha alterada." : "Senha definida.",
      );
      setProfile((previous) =>
        previous ? { ...previous, hasPassword: true } : previous,
      );
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }
  async function logoutOthers() {
    setProfileBusy(true);
    setProfileError("");
    setProfileNotice("");
    try {
      await api("/auth/logout-others", "POST", {});
      setProfileNotice("Você saiu de todos os outros dispositivos.");
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }
  async function deleteAccount() {
    setProfileBusy(true);
    setProfileError("");
    try {
      await api(
        "/auth/me",
        "DELETE",
        profile?.hasPassword ? { password: deletePassword } : {},
      );
      location.assign("/");
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }
  async function disconnectGoogle() {
    setProfileBusy(true);
    setProfileError("");
    setProfileNotice("");
    try {
      const data = await api("/auth/google/disconnect", "POST", {
        password: disconnectGooglePassword,
      });
      setDisconnectGooglePassword("");
      setConfirmDisconnectGoogle(false);
      setProfileNotice("Conta Google desconectada.");
      setProfile((data as { user: Account }).user);
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }
  useEffect(() => {
    if (!googleClientId || profile?.googleLinked) return;
    let active = true;
    const init = () => {
      if (!active || !window.google) return;
      googleTokenClient.current = window.google.accounts.oauth2.initTokenClient(
        {
          client_id: googleClientId,
          scope: "openid email profile",
          callback: async ({ access_token }) => {
            if (!access_token) {
              setProfileError(
                "Não foi possível conectar o Google. Tente novamente.",
              );
              return;
            }
            setProfileBusy(true);
            setProfileError("");
            setProfileNotice("");
            try {
              const data = await api("/auth/google/connect", "POST", {
                accessToken: access_token,
              });
              setProfileNotice("Conta Google conectada.");
              setProfile((data as { user: Account }).user);
            } catch (e) {
              setProfileError((e as Error).message);
            } finally {
              setProfileBusy(false);
            }
          },
        },
      );
    };
    let script = document.querySelector<HTMLScriptElement>(
      "script[data-google-login]",
    );
    if (!script) {
      script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.dataset.googleLogin = "true";
      document.head.appendChild(script);
    }
    script.addEventListener("load", init);
    init();
    return () => {
      active = false;
      script?.removeEventListener("load", init);
    };
  }, [googleClientId, profile?.googleLinked]);
  function connectGoogle() {
    googleTokenClient.current?.requestAccessToken();
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Pinicon, início">
          <img src="/pinicon.svg" alt="" />
          pinicon<span className="brand-period">.</span>
        </a>
        <div className="header-actions">
          {profile && (
            <div className="account-menu" ref={accountMenu}>
              <button
                type="button"
                className="avatar"
                title={profile.name}
                aria-label="Abrir menu da conta"
                aria-expanded={isAccountMenuOpen}
                onClick={() => setIsAccountMenuOpen((open) => !open)}
              >
                {profile.avatar ? (
                  <img src={profile.avatar} alt="" />
                ) : (
                  profile.name?.slice(0, 1).toUpperCase() || "P"
                )}
              </button>
              {isAccountMenuOpen && (
                <div className="account-menu-panel" role="menu">
                  <div className="account-menu-header">
                    <span className="account-menu-name">
                      {profile.displayName || profile.name}
                    </span>
                    <span className="account-menu-email">{profile.email}</span>
                  </div>
                  <div className="account-menu-items">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        setIsProfileOpen(true);
                      }}
                    >
                      <User size={16} />
                      Conta
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        setTheme(theme === "dark" ? "light" : "dark")
                      }
                    >
                      {theme === "dark" ? (
                        <Sun size={16} />
                      ) : (
                        <Moon size={16} />
                      )}
                      Tema
                    </button>
                    {onLogout && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsAccountMenuOpen(false);
                          onLogout();
                        }}
                      >
                        <LogOut size={16} />
                        Sair
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </header>
      <main>
        {isProfileOpen ? (
          <section className="account-page" aria-labelledby="profile-title">
            <div className="modal-content">
              <div className="modal-heading account-page-heading">
                <button
                  className="icon-button"
                  type="button"
                  disabled={profileBusy}
                  aria-label="Voltar"
                  onClick={() => setIsProfileOpen(false)}
                >
                  <ChevronLeft size={20} />
                </button>
                <h2 id="profile-title">Perfil</h2>
              </div>
              <div className="profile-section">
                <h3>Foto de perfil</h3>
                <div className="profile-avatar-row">
                  <span className="profile-avatar-preview">
                    {profile?.avatar ? (
                      <img src={profile.avatar} alt="" />
                    ) : (
                      profile?.name?.slice(0, 1).toUpperCase() || "P"
                    )}
                  </span>
                  <div className="profile-avatar-actions">
                    <label className="upload">
                      <Upload size={15} />
                      Enviar foto
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        disabled={profileBusy}
                        onChange={(e) => void uploadAvatar(e.target.files?.[0])}
                      />
                    </label>
                    {profile?.avatar && (
                      <button
                        type="button"
                        className="danger-text"
                        disabled={profileBusy}
                        onClick={() => void saveAvatar("")}
                      >
                        Remover foto
                      </button>
                    )}
                  </div>
                </div>
                <p className="help">PNG, JPG, WebP ou GIF. Até 2 MB.</p>
              </div>
              <form className="profile-section" onSubmit={saveName}>
                <h3>Nome</h3>
                <label>
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    required
                    maxLength={60}
                    disabled={profileBusy}
                  />
                </label>
                <button
                  className="primary"
                  type="submit"
                  disabled={profileBusy}
                >
                  {profileBusy ? "Salvando…" : "Salvar nome"}
                </button>
              </form>
              <div className="profile-section">
                <h3>Conta</h3>
                <div className="profile-info">
                  {profile?.email && (
                    <p>
                      E-mail: <strong>{profile.email}</strong>
                    </p>
                  )}
                  {profile?.username && (
                    <p>
                      Usuário: <strong>{profile.username}</strong>
                    </p>
                  )}
                </div>
              </div>
              <div className="profile-section">
                <h3>Métodos de login</h3>
                <div className="profile-info">
                  <p>
                    Google:{" "}
                    <strong>
                      {profile?.googleLinked ? "Conectado" : "Não conectado"}
                    </strong>
                  </p>
                </div>
                {profile?.googleLinked ? (
                  confirmDisconnectGoogle ? (
                    <div className="delete-confirm">
                      {profile?.hasPassword ? (
                        <label>
                          Confirme sua senha
                          <input
                            type="password"
                            value={disconnectGooglePassword}
                            onChange={(e) =>
                              setDisconnectGooglePassword(e.target.value)
                            }
                            autoComplete="current-password"
                          />
                        </label>
                      ) : (
                        <p className="help">
                          Defina uma senha antes de desconectar o Google, para
                          não perder o acesso à conta.
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={profileBusy || !profile?.hasPassword}
                        className="danger"
                        onClick={disconnectGoogle}
                      >
                        Confirmar desconexão
                      </button>
                      <button
                        type="button"
                        disabled={profileBusy}
                        className="secondary"
                        onClick={() => {
                          setConfirmDisconnectGoogle(false);
                          setDisconnectGooglePassword("");
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="danger-text"
                      disabled={profileBusy}
                      onClick={() => setConfirmDisconnectGoogle(true)}
                    >
                      Desconectar Google
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="secondary"
                    disabled={profileBusy || !googleClientId}
                    onClick={connectGoogle}
                  >
                    Conectar Google
                  </button>
                )}
              </div>
              <form className="profile-section" onSubmit={changePassword}>
                <h3>
                  {profile?.hasPassword ? "Trocar senha" : "Definir senha"}
                </h3>
                {!profile?.hasPassword && (
                  <p className="help">
                    Você entra com o Google. Defina uma senha para também poder
                    entrar com usuário e senha.
                  </p>
                )}
                {profile?.hasPassword && (
                  <label>
                    Senha atual
                    <PasswordField
                      value={currentPassword}
                      onChange={setCurrentPassword}
                      placeholder="Senha atual"
                      autoComplete="current-password"
                    />
                  </label>
                )}
                <label>
                  {profile?.hasPassword ? "Nova senha" : "Senha"}
                  <PasswordField
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder="Nova senha"
                    autoComplete="new-password"
                    minLength={8}
                  />
                </label>
                <p className="help">Use de 8 a 128 caracteres.</p>
                <button
                  className="primary"
                  type="submit"
                  disabled={profileBusy}
                >
                  {profileBusy
                    ? "Salvando…"
                    : profile?.hasPassword
                      ? "Trocar senha"
                      : "Definir senha"}
                </button>
              </form>
              <div className="profile-section">
                <h3>Segurança</h3>
                <button
                  type="button"
                  className="secondary"
                  disabled={profileBusy}
                  onClick={logoutOthers}
                >
                  Sair de todos os outros dispositivos
                </button>
              </div>
              {(profileError || profileNotice) && (
                <p
                  className={profileError ? "form-error" : "help"}
                  role={profileError ? "alert" : undefined}
                >
                  {profileError || profileNotice}
                </p>
              )}
              <div className="profile-section">
                <h3>Zona de risco</h3>
                {confirmDeleteAccount ? (
                  <div className="delete-confirm">
                    <p>
                      Excluir sua conta apaga todas as suas coleções e
                      favoritos. Esta ação não pode ser desfeita.
                    </p>
                    {profile?.hasPassword && (
                      <label>
                        Confirme sua senha
                        <input
                          type="password"
                          value={deletePassword}
                          onChange={(e) => setDeletePassword(e.target.value)}
                          autoComplete="current-password"
                        />
                      </label>
                    )}
                    <button
                      type="button"
                      disabled={profileBusy}
                      className="danger"
                      onClick={deleteAccount}
                    >
                      Confirmar exclusão
                    </button>
                    <button
                      type="button"
                      disabled={profileBusy}
                      className="secondary"
                      onClick={() => setConfirmDeleteAccount(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="danger-text"
                    disabled={profileBusy}
                    onClick={() => setConfirmDeleteAccount(true)}
                  >
                    Excluir conta
                  </button>
                )}
              </div>
            </div>
          </section>
        ) : (
          <>
            <div className="sticky-header">
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
                        aria-label={
                          busy
                            ? "Buscando informações do site"
                            : "Adicionar favorito"
                        }
                        title={
                          busy
                            ? "Buscando informações do site"
                            : "Adicionar favorito"
                        }
                      >
                        {busy ? (
                          <span className="loader" />
                        ) : (
                          <Plus size={18} />
                        )}
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
                      <div
                        className="filter-panel"
                        aria-label="Opções de filtro"
                      >
                        {(Object.keys(filterLabels) as FilterKey[]).map(
                          (filter) => (
                            <button
                              type="button"
                              key={filter}
                              className={
                                activeFilters.includes(filter) ? "active" : ""
                              }
                              onClick={() => toggleFilter(filter)}
                            >
                              {filterLabels[filter]}
                            </button>
                          ),
                        )}
                        {activeFilters.length > 0 && (
                          <button
                            type="button"
                            className="clear-filter"
                            onClick={() => setActiveFilters([])}
                          >
                            Limpar filtro
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>
              <div className="library-heading">
                <div>
                  <h2>
                    {readOnly ? "Coleções públicas" : "Suas coleções"}
                    <span>{collections.length}</span>
                    {!readOnly && (
                      <button
                        type="button"
                        className="collections-frame-toggle"
                        aria-pressed={toolbarsEnabled}
                        aria-label={
                          toolbarsEnabled
                            ? "Desativar barras de ferramentas"
                            : "Ativar barras de ferramentas"
                        }
                        title={
                          toolbarsEnabled
                            ? "Desativar barras de ferramentas"
                            : "Ativar barras de ferramentas"
                        }
                        onClick={() => setToolbarsEnabled((value) => !value)}
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </h2>
                </div>
                <div className="library-meta">
                  <span>
                    {total} {total === 1 ? "favorito" : "favoritos"}
                  </span>
                  {!readOnly && ownerId && (
                    <>
                      <label
                        className="share-button upload"
                        aria-label="Importar favoritos"
                      >
                        <Upload size={14} />
                        Importar
                        <input
                          type="file"
                          accept=".html,.htm"
                          disabled={busy}
                          onChange={(e) =>
                            void importBookmarksFile(e.target.files?.[0])
                          }
                        />
                      </label>
                      <button className="share-button" onClick={exportBookmarks}>
                        <Download size={14} />
                        Exportar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <section className="library">
              <div className="collections-frame">
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
                      toolbarsEnabled={toolbarsEnabled}
                      likedIds={likedIds}
                      bookmarkedIds={bookmarkedIds}
                      edit={() => open("collection", c)}
                      remove={() => {
                        open("collection", c);
                        setConfirmDelete(true);
                      }}
                      add={() => open("bookmark", { collectionId: c.id }, c.id)}
                      editBookmark={(bookmark) => open("bookmark", bookmark)}
                      removeBookmark={setPendingDeleteBookmark}
                      openBookmark={(bookmark) => registerUsage(bookmark.id)}
                      toggleLiked={toggleBookmarkLiked}
                      toggleBookmarked={toggleBookmarkBookmarked}
                      shareBookmark={shareBookmark}
                      toggleVisibility={toggleBookmarkVisibility}
                      toggleBehavior={toggleCollectionBehavior}
                      createGroup={createGroup}
                      moveToGroup={moveToGroup}
                      renameGroup={renameGroup}
                      deleteGroup={deleteGroup}
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
                      <button
                        className="primary"
                        onClick={() => open("collection")}
                      >
                        <Plus size={16} />
                        Criar minha primeira coleção
                      </button>
                    )}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
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
                <div
                  className="bookmark-actions"
                  aria-label={`Ações da ${kind === "collection" ? "coleção" : "página"}`}
                >
                  <button
                    type="button"
                    aria-label={`Curtir ${kind === "collection" ? "coleção" : "favorito"}`}
                    aria-pressed={isLiked}
                    title="Curtir"
                    className={isLiked ? "active" : ""}
                    onClick={() => {
                      if (!draft.id) return;
                      setIsLiked(
                        toggleStoredId(
                          draft.id,
                          likedIds,
                          setLikedIds,
                          "pinicon-liked",
                        ),
                      );
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
                      setIsBookmarked(
                        toggleStoredId(
                          draft.id,
                          bookmarkedIds,
                          setBookmarkedIds,
                          "pinicon-bookmarked",
                        ),
                      );
                    }}
                  >
                    <BookmarkIcon size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Compartilhar ${kind === "collection" ? "coleção" : "favorito"}`}
                    title="Compartilhar"
                    onClick={() => {
                      void navigator.clipboard?.writeText(
                        draft.url || location.href,
                      );
                      setNotice("Link copiado.");
                    }}
                  >
                    <Share2 size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={
                      draft.isPublic ? "Tornar privado" : "Tornar público"
                    }
                    title={draft.isPublic ? "Privar" : "Exibir"}
                    className={!draft.isPublic ? "active" : ""}
                    onClick={() =>
                      setDraft({ ...draft, isPublic: !draft.isPublic })
                    }
                  >
                    {draft.isPublic ? (
                      <LockOpen size={16} />
                    ) : (
                      <Lock size={16} />
                    )}
                  </button>
                  {kind === "bookmark" && (
                    <button
                      type="button"
                      className="danger-icon"
                      aria-label="Excluir favorito"
                      title="Excluir"
                      onClick={() =>
                        setPendingDeleteBookmark({
                          id: draft.id as string,
                          collectionId: draft.collectionId,
                          name: draft.name,
                          url: draft.url,
                          description: draft.description,
                          favicon: draft.favicon,
                          color: draft.color,
                          isPublic: draft.isPublic,
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
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
          <form
            className={kind === "bookmark" ? "bookmark-form" : ""}
            onSubmit={save}
          >
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
              <label
                className={kind === "bookmark" ? "bookmark-description" : ""}
              >
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
                          <li
                            key={bookmark.id}
                            className="collection-bookmark-row"
                          >
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
                                onClick={() =>
                                  editBookmarkFromCollection(bookmark)
                                }
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                aria-label={`Remover favicon ${bookmark.name}`}
                                title="Remover favorito"
                                onClick={() =>
                                  editBookmarkFromCollection(bookmark, true)
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="help">
                        Esta coleção ainda não tem favicons.
                      </p>
                    )}
                  </section>
                  <div className="shape-options">
                    <span>Formato da Moldura</span>
                    <div>
                      {[
                        ["circle", "Redondo"],
                        ["square", "Quadrado"],
                        ["rounded", "Arredondado"],
                      ].map(([shape, label]) => (
                        <button
                          type="button"
                          key={shape}
                          className={draft.shape === shape ? "active" : ""}
                          aria-pressed={draft.shape === shape}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              shape: shape as Draft["shape"],
                            })
                          }
                        >
                          <span className={`shape-sample ${shape}`} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="shape-options">
                    <span>Comportamento</span>
                    <div>
                      {[
                        ["fixed", "Fixo"],
                        ["expansive", "Expansível"],
                      ].map(([behavior, label]) => (
                        <button
                          type="button"
                          key={behavior}
                          className={
                            draft.behavior === behavior ? "active" : ""
                          }
                          aria-pressed={draft.behavior === behavior}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              behavior: behavior as Draft["behavior"],
                            })
                          }
                        >
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
                  Excluir esta coleção e todos os seus favoritos? Esta ação
                  não pode ser desfeita.
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
                {draft.id && kind === "collection" && (
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
                    setCollectionDraft({
                      ...collectionDraft,
                      name: e.target.value,
                    })
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
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
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
      <dialog
        ref={deleteBookmarkDialog}
        className="confirm-dialog"
        aria-labelledby="delete-bookmark-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setPendingDeleteBookmark(null);
        }}
        onClick={(e) => {
          if (e.target === deleteBookmarkDialog.current && !busy)
            setPendingDeleteBookmark(null);
        }}
      >
        <div className="modal-content">
          <div className="modal-heading">
            <h2 id="delete-bookmark-title">Excluir favorito</h2>
            <button
              className="icon-button"
              type="button"
              disabled={busy}
              aria-label="Fechar modal"
              onClick={() => setPendingDeleteBookmark(null)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="delete-confirm">
            <p>
              Excluir "{pendingDeleteBookmark?.name}"? Esta ação não pode ser
              desfeita.
            </p>
            <button
              type="button"
              disabled={busy}
              className="danger"
              onClick={confirmRemoveBookmark}
            >
              Confirmar exclusão
            </button>
            <button
              type="button"
              disabled={busy}
              className="secondary"
              onClick={() => setPendingDeleteBookmark(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
