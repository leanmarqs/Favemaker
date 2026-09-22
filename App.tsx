import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ArrowUpRight,
  Bookmark as BookmarkIcon,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Construction,
  Folder,
  Globe2,
  GripVertical,
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
  Users,
  X,
  Upload,
  Copy,
  Download,
} from "lucide-react";
import type { Account, Bookmark, BookmarkGroup, Collection } from "./types";
import PasswordField from "./PasswordField";
import CommunityFeed from "./Community";
import { mockCollectionsByAuthor } from "./communityMock";
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

export async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res
    .json()
    .catch(() => ({ error: "Não foi possível conectar ao Like My Links." }));
  if (!res.ok)
    throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}
const blank = {
  name: "",
  description: "",
  color: "#8b5cf6",
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
  // Só presente quando o favorito está sendo criado a partir do "+" de uma
  // seção específica (ver CollectionRow) — o servidor só mexe no grupo do
  // favorito quando essa chave é enviada, então o formulário normal de edição
  // (que nunca define isso) não corre o risco de tirar um favorito do grupo
  // sem querer.
  groupId?: string | null;
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
  bookmark: Pick<Bookmark, "favicon" | "color" | "name" | "linkStatus">;
  shape?: string;
}) {
  const [failed, setFailed] = useState(false);
  const borderRadius =
    shape === "square" ? 0 : shape === "rounded" ? "28%" : "50%";
  const broken = bookmark.linkStatus === "broken";
  useEffect(() => setFailed(false), [bookmark.favicon]);
  return (
    <span
      className={`sphere sphere-${shape} ${broken ? "link-broken" : ""}`}
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
  expanded,
  onOpen,
}: {
  group: Pick<BookmarkGroup, "id" | "name" | "color" | "bookmarks">;
  shape?: string;
  expanded?: boolean;
  onOpen: () => void;
}) {
  const borderRadius =
    shape === "square" ? 0 : shape === "rounded" ? "28%" : "50%";
  const preview = group.bookmarks.slice(0, 4);
  const extra = group.bookmarks.length - preview.length;
  return (
    <button
      type="button"
      className={`sphere sphere-${shape} group-tile ${expanded ? "is-expanded" : ""}`}
      style={{ "--orb": group.color, borderRadius } as React.CSSProperties}
      aria-label={`Abrir grupo ${group.name}`}
      aria-pressed={expanded}
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
export function CollectionRow({
  collection,
  readOnly,
  toolbarsEnabled,
  // Quantos itens cabem numa "página" do pill fixo (setas de navegação) antes
  // de precisar da seta pra ver o resto — 10 é o valor de sempre em "Suas
  // coleções"; o feed da Comunidade usa um valor menor (ver Community.tsx)
  // porque o card ali é bem mais estreito.
  pageSize = 10,
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
  toggleBehavior,
  createGroup,
  moveToGroup,
  reorderBookmarks,
  renameGroup,
  deleteGroup,
  sectionsBulkAction,
  dragHandle,
}: {
  collection: Collection;
  readOnly: boolean;
  toolbarsEnabled: boolean;
  pageSize?: number;
  likedIds: string[];
  bookmarkedIds: string[];
  edit: () => void;
  remove: () => void;
  add: (groupId?: string) => void;
  editBookmark: (bookmark: Bookmark) => void;
  removeBookmark: (bookmark: Bookmark) => void;
  openBookmark: (bookmark: Bookmark) => void;
  toggleLiked: (bookmark: Bookmark) => void;
  toggleBookmarked: (bookmark: Bookmark) => void;
  shareBookmark: (bookmark: Bookmark) => void;
  toggleBehavior: (collection: Collection) => void;
  createGroup: (
    collectionId: string,
    bookmarkIds: string[],
  ) => Promise<BookmarkGroup | null>;
  moveToGroup: (bookmarkId: string, groupId: string | null) => Promise<void>;
  reorderBookmarks: (
    collectionId: string,
    groupId: string | null,
    orderedIds: string[],
  ) => Promise<void>;
  renameGroup: (
    groupId: string,
    data: {
      name: string;
      color: string;
      description: string;
      showName: boolean;
      shape: string | null;
    },
  ) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  // Comando disparado pela barra de ações em massa (ver App): "collapse"
  // decide se recolhe (true) ou expande (false) TODAS as próprias seções;
  // "token" muda a cada clique (mesmo repetindo a mesma ação) só pra sempre
  // disparar o efeito abaixo, já que collapsedSections é estado local daqui.
  sectionsBulkAction: { collapse: boolean; token: number } | null;
  // Arrastar pelo "grip" na barra de ferramentas da coleção pra reordenar a
  // lista "Suas coleções" — ver handleCollectionDrop no App.
  dragHandle: {
    dragging: boolean;
    dragOver: boolean;
    onDragStart: () => void;
    onDragOver: () => void;
    onDragLeave: () => void;
    onDrop: () => void;
    onDragEnd: () => void;
  };
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
  // Ordenação, recolher/expandir: por seção (chave = id do grupo), não
  // persistido no servidor — cada seção começa aberta e na ordem de criação.
  const [sectionSort, setSectionSort] = useState<
    Record<string, "asc" | "desc">
  >({});
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});
  // Reage ao comando de "expandir/recolher todas" disparado pela barra de
  // ações em massa (ver App) — ignora o primeiro render (token null) pra não
  // recolher/expandir nada sem o usuário ter clicado em nada ainda.
  useEffect(() => {
    if (!sectionsBulkAction) return;
    if (sectionsBulkAction.collapse) {
      const next: Record<string, boolean> = {};
      for (const g of collection.groups)
        if (g.display === "section") next[g.id] = true;
      setCollapsedSections(next);
    } else {
      setCollapsedSections({});
    }
  }, [sectionsBulkAction]);
  // containerKey identifica de onde veio o hover — "main" (pill principal) ou
  // o id de uma seção — pra cada container só desenhar a barra/prévia quando
  // ela é a dona do item passado o mouse (ver renderFavoriteOverlays), já que
  // as coordenadas x/y são sempre relativas ao container de origem.
  const [bookmarkToolbar, setBookmarkToolbar] = useState<{
    bookmark: Bookmark;
    containerKey: string;
    x?: number;
    y?: number;
  } | null>(null);
  const [previewCard, setPreviewCard] = useState<{
    bookmark: Bookmark;
    containerKey: string;
    x?: number;
    y?: number;
  } | null>(null);
  const [previewCardLeaving, setPreviewCardLeaving] = useState(false);
  // Arrastar um ícone (só com o lápis ligado) tem três desfechos possíveis,
  // decididos pela posição horizontal do cursor sobre o ícone-alvo: soltar no
  // terço central "sobre" o ícone agrupa os dois (dragOverZone "center");
  // soltar no terço da esquerda/direita reordena a lista sem agrupar
  // ("before"/"after"); soltar dentro do corpo de uma seção (sem alvo
  // específico) move o ícone pra dentro dela, no fim da lista.
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverZone, setDragOverZone] = useState<
    "before" | "center" | "after" | null
  >(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(
    null,
  );
  const [openGroup, setOpenGroup] = useState<BookmarkGroup | null>(null);
  // Clicar num "tile" sem o lápis ligado não abre modal nenhum — expande um
  // painel ancorado bem onde o ícone está (mesma técnica do cartão de prévia:
  // x/y relativos ao ".favorite-anchor"), mostrando os favoritos de dentro
  // dele prontos pra usar. Guardamos só o id (não o grupo inteiro) pra sempre
  // refletir a versão mais atual dele, igual openGroupLive.
  const [expandedGroup, setExpandedGroup] = useState<{
    groupId: string;
    x?: number;
    y?: number;
  } | null>(null);
  const pageTransitionTimer = useRef<number | null>(null);
  const bookmarkToolbarTimer = useRef<number | null>(null);
  const previewCardTimer = useRef<number | null>(null);
  const previewCardExitTimer = useRef<number | null>(null);
  const groupExpandTimer = useRef<number | null>(null);
  const groupExpandExitTimer = useRef<number | null>(null);
  type GridItem =
    | { kind: "bookmark"; id: string; sortKey: string; bookmark: Bookmark }
    | { kind: "group"; id: string; sortKey: string; group: BookmarkGroup };
  // Tile vazio (0 favoritos) some — ninguém cria um "tile" sem conteúdo, e um
  // grupo assim só sobra por perder favoritos um a um. Seção vazia, por outro
  // lado, é um estado válido (nasce vazia, do editor da coleção) e precisa
  // continuar visível pro dono poder adicionar favoritos a ela pelo "+" da
  // própria seção — só é escondida no perfil público (readOnly) quando não
  // sobra nenhum favorito visível lá dentro.
  const tileGroups = collection.groups.filter(
    (g) => g.display !== "section" && g.bookmarks.length,
  );
  const sectionGroups = collection.groups.filter(
    (g) => g.display === "section" && (g.bookmarks.length || !readOnly),
  );
  const items: GridItem[] = [
    ...collection.bookmarks.map((b) => ({
      kind: "bookmark" as const,
      id: b.id,
      sortKey: b.name,
      bookmark: b,
    })),
    ...tileGroups.map((g) => ({
      kind: "group" as const,
      id: g.id,
      sortKey: g.name,
      group: g,
    })),
  ];
  // Um "tile" (ícone de grupo) não tem posição própria na lista de favoritos
  // — arrastá-lo sobre outro ícone só pode agrupar, nunca reordenar, mesmo
  // soltando numa ponta (que noutro caso significaria "entre dois ícones").
  const draggedIsTile = items.some(
    (i) => i.id === draggedId && i.kind === "group",
  );
  // Contagem de favoritos de verdade (inclusive os de dentro de grupos) é
  // diferente da contagem de "slots" na grade (um grupo conta como 1 slot).
  const totalBookmarks =
    collection.bookmarks.length +
    collection.groups.reduce((sum, g) => sum + g.bookmarks.length, 0);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
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
      if (groupExpandTimer.current) window.clearTimeout(groupExpandTimer.current);
      if (groupExpandExitTimer.current)
        window.clearTimeout(groupExpandExitTimer.current);
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
  // Ligar o lápis muda o clique no tile pra abrir o modal de edição em vez de
  // passar a depender do hover — fecha o painel expandido (e cancela timers
  // pendentes) pra não deixar os dois abertos ao mesmo tempo.
  useEffect(() => {
    if (!toolbarsEnabled) return;
    if (groupExpandTimer.current) window.clearTimeout(groupExpandTimer.current);
    if (groupExpandExitTimer.current)
      window.clearTimeout(groupExpandExitTimer.current);
    setExpandedGroup(null);
  }, [toolbarsEnabled]);
  // Rede de segurança pra fechar em cliques que não passam por um mouseleave
  // (ex: clicar num link dentro da própria página sem mover o mouse antes).
  useEffect(() => {
    if (!expandedGroup) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement;
      if (target.closest(".group-expand-panel") || target.closest(".group-tile"))
        return;
      setExpandedGroup(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [expandedGroup]);
  const scheduleBookmarkToolbar = (next: {
    bookmark: Bookmark;
    containerKey: string;
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
    containerKey: string;
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
  // Mesma ideia do cartão de prévia (cursor parado sobre o ícone por um
  // instante, não clique) — só que pra um "tile", em vez do cartão, mostra os
  // favoritos de dentro dele (ver expandedGroup). Só faz sentido sem o lápis
  // ligado: com ele, clicar no tile abre o modal de edição normalmente.
  const scheduleGroupExpand = (next: {
    groupId: string;
    x?: number;
    y?: number;
  }) => {
    if (toolbarsEnabled) return;
    if (groupExpandTimer.current) window.clearTimeout(groupExpandTimer.current);
    if (groupExpandExitTimer.current)
      window.clearTimeout(groupExpandExitTimer.current);
    groupExpandTimer.current = window.setTimeout(
      () => setExpandedGroup(next),
      250,
    );
  };
  const deferGroupExpandClear = () => {
    if (groupExpandTimer.current) window.clearTimeout(groupExpandTimer.current);
    groupExpandExitTimer.current = window.setTimeout(
      () => setExpandedGroup(null),
      250,
    );
  };
  const keepGroupExpandVisible = () => {
    if (groupExpandTimer.current) window.clearTimeout(groupExpandTimer.current);
    if (groupExpandExitTimer.current)
      window.clearTimeout(groupExpandExitTimer.current);
  };
  // Em qual terço horizontal do ícone-alvo o cursor está: os terços das
  // pontas reordenam a lista (não agrupam), o terço central agrupa — é essa
  // posição que distingue "soltar sobre" de "soltar entre dois ícones".
  function dropZone(
    event: React.DragEvent<HTMLDivElement>,
  ): "before" | "center" | "after" {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    if (ratio < 1 / 3) return "before";
    if (ratio > 2 / 3) return "after";
    return "center";
  }
  // Ids (na ordem exibida no momento) da lista de favoritos "soltos" da
  // coleção (containerGroupId null) ou dos favoritos de uma seção — a mesma
  // lista que o servidor grava como `order` ao reordenar/mover.
  function bookmarkIdsInContainer(containerGroupId: string | null): string[] {
    if (containerGroupId === null) {
      const list = sortDirection
        ? [...collection.bookmarks].sort((a, b) =>
            sortDirection === "asc"
              ? a.name.localeCompare(b.name, "pt-BR")
              : b.name.localeCompare(a.name, "pt-BR"),
          )
        : collection.bookmarks;
      return list.map((b) => b.id);
    }
    const section = collection.groups.find((g) => g.id === containerGroupId);
    if (!section) return [];
    const direction = sectionSort[containerGroupId];
    const list = direction
      ? [...section.bookmarks].sort((a, b) =>
          direction === "asc"
            ? a.name.localeCompare(b.name, "pt-BR")
            : b.name.localeCompare(a.name, "pt-BR"),
        )
      : section.bookmarks;
    return list.map((b) => b.id);
  }
  function insertedOrder(
    containerGroupId: string | null,
    sourceId: string,
    targetId: string,
    edge: "before" | "after",
  ): string[] {
    const ids = bookmarkIdsInContainer(containerGroupId).filter(
      (id) => id !== sourceId,
    );
    const targetIndex = ids.indexOf(targetId);
    const insertAt = edge === "before" ? targetIndex : targetIndex + 1;
    ids.splice(insertAt, 0, sourceId);
    return ids;
  }
  // Soltar sobre o terço central de outro ícone cria (ou adiciona a) um grupo
  // — igual antes. Soltar num dos terços das pontas reposiciona o favorito
  // arrastado naquele ponto da lista do container de chegada (a coleção ou
  // uma seção), sem agrupar — funciona mesmo vindo de outro container.
  function handleFavoriteDrop(
    target: { kind: "bookmark" | "group"; id: string },
    containerGroupId: string | null,
  ) {
    const sourceId = draggedId;
    const zone = dragOverZone;
    setDraggedId(null);
    setDragOverId(null);
    setDragOverZone(null);
    setDragOverSectionId(null);
    if (!sourceId || sourceId === target.id) return;
    if (target.kind === "group" || zone === "center" || !zone) {
      if (target.kind === "group") {
        void moveToGroup(sourceId, target.id);
      } else {
        void createGroup(collection.id, [sourceId, target.id]).then(
          (created) => {
            if (created) setOpenGroup(created);
          },
        );
      }
      return;
    }
    const orderedIds = insertedOrder(containerGroupId, sourceId, target.id, zone);
    void reorderBookmarks(collection.id, containerGroupId, orderedIds);
  }
  // Soltar num espaço vazio dentro do "corpo" de uma seção (sem mirar num
  // ícone específico) move o favorito arrastado pra dentro dela, no fim da
  // lista — cobre tanto uma seção ainda vazia quanto soltar depois do último
  // ícone visível.
  function handleSectionContainerDrop(containerGroupId: string) {
    const sourceId = draggedId;
    setDraggedId(null);
    setDragOverId(null);
    setDragOverZone(null);
    setDragOverSectionId(null);
    if (!sourceId) return;
    const ids = bookmarkIdsInContainer(containerGroupId).filter(
      (id) => id !== sourceId,
    );
    void reorderBookmarks(collection.id, containerGroupId, [...ids, sourceId]);
  }
  // Sempre a versão mais atual do grupo aberto (não o objeto capturado no
  // momento do clique) — assim a lista dentro do popover reflete remoções/
  // renomeações na hora, sem precisar fechar e abrir de novo.
  const openGroupLive = openGroup
    ? collection.groups.find((g) => g.id === openGroup.id) || null
    : null;
  const expandedGroupLive = expandedGroup
    ? collection.groups.find((g) => g.id === expandedGroup.groupId) || null
    : null;
  // Clicar num "tile" (ícone de grupo) com o lápis ligado abre o modal de
  // edição (nome, cor, remover item, excluir grupo); sem o lápis, só expande
  // o painel de favoritos pra usar (ver expandedGroup) — nunca os dois ao
  // mesmo tempo.
  const canEditGroup = !readOnly && toolbarsEnabled;
  const groupDialog = useRef<HTMLDialogElement>(null);
  const [groupName, setGroupName] = useState("");
  const [groupColor, setGroupColor] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupShowName, setGroupShowName] = useState(false);
  const [groupShape, setGroupShape] = useState<string | null>(null);
  const [groupBusy, setGroupBusy] = useState(false);
  useEffect(() => {
    // Depende só de "openGroup" (não do id, nem de openGroupLive): os campos
    // agora só salvam quando "Salvar" é clicado, então reabrir a MESMA seção
    // depois de cancelar precisa mesmo re-sincronizar com o servidor — senão
    // a edição descartada reaparece, como se tivesse sido salva. Não pode
    // depender de openGroupLive porque essa referência muda a cada reload dos
    // dados (mesmo sem o usuário reabrir nada), o que resetaria uma edição
    // ainda não salva enquanto o modal está aberto.
    if (openGroupLive) {
      setGroupName(openGroupLive.name);
      setGroupColor(openGroupLive.color);
      setGroupDescription(openGroupLive.description);
      setGroupShowName(openGroupLive.showName);
      setGroupShape(openGroupLive.shape || null);
    }
  }, [openGroup]);
  useEffect(() => {
    if (openGroup && !groupDialog.current?.open) groupDialog.current?.showModal();
    else if (!openGroup && groupDialog.current?.open) groupDialog.current.close();
  }, [openGroup]);
  useEffect(() => {
    // O grupo foi excluído (por essa aba ou por um reload) enquanto o popover
    // estava aberto — fecha em vez de mostrar uma lista vazia órfã.
    if (openGroup && !openGroupLive) setOpenGroup(null);
  }, [openGroup, openGroupLive]);
  // Confirmação enxuta antes de excluir uma seção/grupo — igual já existe pra
  // favorito e coleção. Estado local (não no App): o diálogo de editar
  // seção/grupo também é local a este CollectionRow.
  const [pendingDeleteGroup, setPendingDeleteGroup] =
    useState<Pick<BookmarkGroup, "id" | "name" | "display"> | null>(null);
  const deleteGroupDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (pendingDeleteGroup && !deleteGroupDialog.current?.open)
      deleteGroupDialog.current?.showModal();
    else if (!pendingDeleteGroup && deleteGroupDialog.current?.open)
      deleteGroupDialog.current.close();
  }, [pendingDeleteGroup]);
  async function confirmDeleteGroup() {
    if (!pendingDeleteGroup) return;
    await deleteGroup(pendingDeleteGroup.id);
    // Se o modal de editar essa mesma seção/grupo também estiver aberto,
    // fecha os dois juntos em vez de deixar um popover órfão pra trás.
    if (openGroup?.id === pendingDeleteGroup.id) setOpenGroup(null);
    setPendingDeleteGroup(null);
  }
  // Barra de edição + cartão de prévia de um favorito: reaproveitada tanto
  // pelo pill principal ("main") quanto por cada seção (containerKey = id da
  // seção), já que bookmarkToolbar/previewCard guardam de qual container elas
  // vieram — só desenha aqui quando bate com o container que está chamando.
  function renderFavoriteOverlays(containerKey: string) {
    const toolbar =
      bookmarkToolbar?.containerKey === containerKey ? bookmarkToolbar : null;
    const preview =
      previewCard?.containerKey === containerKey ? previewCard : null;
    return (
      <>
        {!readOnly && toolbar && (
          <div
            className="collection-controls favorite-controls"
            style={{ left: toolbar.x, top: toolbar.y }}
            aria-label={`Ações do favorito ${toolbar.bookmark.name}`}
            onMouseEnter={keepBookmarkToolbarVisible}
            onMouseLeave={deferBookmarkToolbarClear}
          >
            <button
              type="button"
              aria-label={`Editar favorito ${toolbar.bookmark.name}`}
              title="Editar"
              onClick={() => editBookmark(toolbar.bookmark)}
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              aria-label={`Excluir favorito ${toolbar.bookmark.name}`}
              title="Excluir"
              onClick={() => removeBookmark(toolbar.bookmark)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
        {!toolbarsEnabled && preview && (
          <div
            className="favorite-preview-anchor"
            style={{ left: preview.x, top: preview.y }}
          >
            <div
              key={preview.bookmark.id}
              className={`favorite-preview ${previewCardLeaving ? "is-leaving" : ""}`}
              aria-label={`Prévia do favorito ${preview.bookmark.name}`}
              onMouseEnter={keepPreviewCardVisible}
              onMouseLeave={deferPreviewCardClear}
            >
              <a
                className="favorite-preview-link"
                href={preview.bookmark.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Abrir favorito ${preview.bookmark.name}`}
                onClick={() => openBookmark(preview.bookmark)}
              />
              <div
                className="favorite-preview-media"
                style={{ background: preview.bookmark.color }}
              >
                {preview.bookmark.favicon ? (
                  <PreviewFavicon src={preview.bookmark.favicon} />
                ) : (
                  <span>
                    {preview.bookmark.name.slice(0, 1).toUpperCase() || (
                      <Globe2 />
                    )}
                  </span>
                )}
                {!readOnly && (
                  <button
                    type="button"
                    className="favorite-preview-edit"
                    aria-label={`Editar favorito ${preview.bookmark.name}`}
                    title="Editar"
                    onClick={() => editBookmark(preview.bookmark)}
                  >
                    <Pencil size={13} />
                  </button>
                )}
                <strong className="favorite-preview-name">
                  {preview.bookmark.name}
                </strong>
              </div>
              <div className="favorite-preview-footer">
                <div className="favorite-preview-actions">
                  <button
                    type="button"
                    aria-label={`Curtir favorito ${preview.bookmark.name}`}
                    aria-pressed={likedIds.includes(preview.bookmark.id)}
                    title="Curtir"
                    className={
                      likedIds.includes(preview.bookmark.id) ? "active" : ""
                    }
                    onClick={() => toggleLiked(preview.bookmark)}
                  >
                    <Heart size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Favoritar ${preview.bookmark.name}`}
                    aria-pressed={bookmarkedIds.includes(preview.bookmark.id)}
                    title="Favoritar"
                    className={
                      bookmarkedIds.includes(preview.bookmark.id)
                        ? "active"
                        : ""
                    }
                    onClick={() => toggleBookmarked(preview.bookmark)}
                  >
                    <BookmarkIcon size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Compartilhar favorito ${preview.bookmark.name}`}
                    title="Compartilhar"
                    onClick={() => shareBookmark(preview.bookmark)}
                  >
                    <Share2 size={15} />
                  </button>
                </div>
                {preview.bookmark.description && (
                  <div className="favorite-preview-meta">
                    <span>{preview.bookmark.description}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </>
    );
  }
  return (
    <>
    <article
      className={`collection ${bookmarkToolbar || toolbarsEnabled || previewCard ? "has-visible-toolbar" : ""} ${dragHandle.dragOver ? "drop-target-collection" : ""}`}
      onDragOver={(event) => {
        if (!toolbarsEnabled) return;
        event.preventDefault();
        dragHandle.onDragOver();
      }}
      onDragLeave={dragHandle.onDragLeave}
      onDrop={(event) => {
        event.preventDefault();
        dragHandle.onDrop();
      }}
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
        {(!readOnly || collection.id === "temporary-filter") && (
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
            {!readOnly && toolbarsEnabled && (
              <>
                <span
                  role="button"
                  tabIndex={0}
                  className={`drag-handle ${dragHandle.dragging ? "is-dragging" : ""}`}
                  aria-label={`Arrastar para reordenar a coleção ${collection.name}`}
                  title="Arrastar para reordenar"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    dragHandle.onDragStart();
                  }}
                  onDragEnd={dragHandle.onDragEnd}
                >
                  <GripVertical size={13} />
                </span>
                <button
                  type="button"
                  aria-label={`Ordenar favoritos de ${collection.name} de ${sortDirection === "asc" ? "Z a A" : "A a Z"}`}
                  title={
                    sortDirection === "asc"
                      ? "Ordenar de Z a A"
                      : "Ordenar de A a Z"
                  }
                  onClick={() =>
                    setSortDirection((value) =>
                      value === "asc" ? "desc" : "asc",
                    )
                  }
                >
                  {sortDirection === "desc" ? (
                    <ArrowDownAZ size={13} />
                  ) : (
                    <ArrowUpAZ size={13} />
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`Adicionar favorito à coleção ${collection.name}`}
                  title="Adicionar favorito"
                  onClick={() => add()}
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
              </>
            )}
          </div>
        )}
      </div>
      {collection.description && (
        <p className="collection-description">{collection.description}</p>
      )}
      <div
        className={`collection-frame ${sectionGroups.length ? "has-sections" : ""}`}
      >
      <div className={`pill favorite-anchor ${isExpanded ? "is-expanded" : ""}`}>
        {renderFavoriteOverlays("main")}
        {renderFavoriteOverlays("group-expand")}
        {expandedGroupLive && (
          <div
            className="group-expand-anchor"
            style={{ left: expandedGroup?.x, top: expandedGroup?.y }}
          >
            <div
              className="group-expand-panel"
              onMouseEnter={keepGroupExpandVisible}
              onMouseLeave={deferGroupExpandClear}
            >
              <div className="group-expand-heading">
                <span>{expandedGroupLive.name}</span>
                <button
                  type="button"
                  aria-label="Fechar"
                  onClick={() => {
                    keepGroupExpandVisible();
                    setExpandedGroup(null);
                  }}
                >
                  <X size={13} />
                </button>
              </div>
              <div className="group-expand-icons">
                {expandedGroupLive.bookmarks.map((b) => (
                  <div
                    className="favorite"
                    key={b.id}
                    onMouseEnter={(event) => {
                      const container =
                        event.currentTarget.closest(".favorite-anchor");
                      const favoriteRect =
                        event.currentTarget.getBoundingClientRect();
                      const containerRect = container?.getBoundingClientRect();
                      const x = containerRect
                        ? favoriteRect.left -
                          containerRect.left +
                          favoriteRect.width / 2
                        : undefined;
                      if (toolbarsEnabled) {
                        scheduleBookmarkToolbar({
                          bookmark: b,
                          containerKey: "group-expand",
                          x,
                          y: containerRect
                            ? favoriteRect.top - containerRect.top - 16
                            : undefined,
                        });
                      } else {
                        schedulePreviewCard({
                          bookmark: b,
                          containerKey: "group-expand",
                          x,
                          y: containerRect
                            ? favoriteRect.top -
                              containerRect.top +
                              favoriteRect.height / 2
                            : undefined,
                        });
                      }
                    }}
                    onMouseLeave={(event) => {
                      if (toolbarsEnabled) clearBookmarkToolbar(event);
                      else deferPreviewCardClear();
                    }}
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
          // Nº de colunas do grid = pageSize: sem isso, uma página com menos de
          // 10 itens (ver pageSize) ainda dividia a pílula em 10 células fixas,
          // espremendo os itens reais nas primeiras colunas em vez de usar a
          // largura toda disponível pra eles.
          style={{ "--page-size": pageSize } as React.CSSProperties}
          aria-live="polite"
        >
          {(isExpanded
            ? sortedItems
            : sortedItems.slice(active * pageSize, active * pageSize + pageSize)
          ).map((item) => (
            <div
              className={`favorite ${
                dragOverId === item.id && draggedId !== item.id
                  ? item.kind === "group"
                    ? "drop-target"
                    : dragOverZone === "before"
                      ? "drop-before"
                      : dragOverZone === "after"
                        ? "drop-after"
                        : "drop-target"
                  : ""
              }`}
              key={item.id}
              draggable={toolbarsEnabled}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                setDraggedId(item.id);
              }}
              onDragOver={(event) => {
                if (!toolbarsEnabled || !draggedId || draggedId === item.id)
                  return;
                event.preventDefault();
                event.stopPropagation();
                setDragOverId(item.id);
                setDragOverZone(
                  item.kind === "group" || draggedIsTile
                    ? "center"
                    : dropZone(event),
                );
              }}
              onDragLeave={() =>
                setDragOverId((id) => (id === item.id ? null : id))
              }
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleFavoriteDrop(item, null);
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDragOverId(null);
                setDragOverZone(null);
              }}
              onMouseEnter={(event) => {
                if (item.kind === "bookmark") {
                  const b = item.bookmark;
                  const container =
                    event.currentTarget.closest(".favorite-anchor");
                  const favoriteRect =
                    event.currentTarget.getBoundingClientRect();
                  const containerRect = container?.getBoundingClientRect();
                  const x = containerRect
                    ? favoriteRect.left -
                      containerRect.left +
                      favoriteRect.width / 2
                    : undefined;
                  if (toolbarsEnabled) {
                    scheduleBookmarkToolbar({
                      bookmark: b,
                      containerKey: "main",
                      x,
                      y: containerRect
                        ? favoriteRect.top - containerRect.top - 16
                        : undefined,
                    });
                  } else {
                    // Centro do ícone (não o topo): o cartão de prévia se ancora por
                    // esse ponto pra crescer ao redor do ícone, não acima dele.
                    schedulePreviewCard({
                      bookmark: b,
                      containerKey: "main",
                      x,
                      y: containerRect
                        ? favoriteRect.top -
                          containerRect.top +
                          favoriteRect.height / 2
                        : undefined,
                    });
                  }
                } else {
                  // Mesma lógica do cartão de prévia, só que pra abrir o painel
                  // de favoritos do grupo em vez de um cartão — ver
                  // scheduleGroupExpand. Não faz nada com o lápis ligado (nesse
                  // modo, clicar no tile abre o modal de edição em vez disso).
                  const container =
                    event.currentTarget.closest(".favorite-anchor");
                  const tileRect =
                    event.currentTarget.getBoundingClientRect();
                  const containerRect = container?.getBoundingClientRect();
                  const x = containerRect
                    ? tileRect.left - containerRect.left + tileRect.width / 2
                    : undefined;
                  // Topo do tile menos uma folga (não o centro): o painel
                  // cresce pra CIMA a partir daqui (ver transform em
                  // .group-expand-anchor), então isso precisa ficar acima do
                  // ícone inteiro, senão o painel cobre o próprio tile.
                  const y = containerRect
                    ? tileRect.top - containerRect.top - 10
                    : undefined;
                  scheduleGroupExpand({ groupId: item.group.id, x, y });
                }
              }}
              onMouseLeave={(event) => {
                if (item.kind === "bookmark") {
                  if (toolbarsEnabled) clearBookmarkToolbar(event);
                  else deferPreviewCardClear();
                } else {
                  deferGroupExpandClear();
                }
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
                    shape={item.group.shape || collection.shape}
                    expanded={expandedGroup?.groupId === item.group.id}
                    onOpen={() => {
                      // Sem o lápis, o painel já abre sozinho ao passar o
                      // mouse (ver onMouseEnter acima) — clicar não faz nada.
                      if (toolbarsEnabled) setOpenGroup(item.group);
                    }}
                  />
                  {item.group.showName ? (
                    <span className="favorite-name">
                      {item.group.name.length > 24
                        ? `${item.group.name.slice(0, 24)}…`
                        : item.group.name}
                    </span>
                  ) : (
                    <span className="sr-only">{item.group.name}</span>
                  )}
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
          {active * pageSize + 1}–
          {Math.min(active * pageSize + pageSize, items.length)} de{" "}
          {items.length} favoritos
        </p>
      )}
      {sectionGroups.map((section) => {
        const sectionIsCollapsed = Boolean(collapsedSections[section.id]);
        const sectionSortDirection = sectionSort[section.id];
        const sortedSectionBookmarks = sectionSortDirection
          ? [...section.bookmarks].sort((a, b) =>
              sectionSortDirection === "asc"
                ? a.name.localeCompare(b.name, "pt-BR")
                : b.name.localeCompare(a.name, "pt-BR"),
            )
          : section.bookmarks;
        return (
        <div
          className={`collection-section favorite-anchor ${
            dragOverSectionId === section.id ? "drop-target-section" : ""
          }`}
          key={section.id}
          onDragOver={(event) => {
            if (!toolbarsEnabled || !draggedId) return;
            event.preventDefault();
            setDragOverSectionId(section.id);
          }}
          onDragLeave={(event) => {
            const nextTarget = event.relatedTarget as HTMLElement | null;
            if (!nextTarget?.closest(`.collection-section`)) {
              setDragOverSectionId((id) => (id === section.id ? null : id));
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            handleSectionContainerDrop(section.id);
          }}
        >
          <div className="collection-section-divider">
            <span
              className="collection-section-dot"
              style={{ background: section.color }}
            />
            <span className="collection-section-name">{section.name}</span>
            <span className="collection-section-line" />
            {!readOnly && (
              <div
                className="collection-controls"
                aria-label={`Ações da seção ${section.name}`}
              >
                <button
                  type="button"
                  aria-label={`${sectionIsCollapsed ? "Expandir" : "Recolher"} seção ${section.name}`}
                  aria-expanded={!sectionIsCollapsed}
                  title={sectionIsCollapsed ? "Expandir seção" : "Recolher seção"}
                  onClick={() =>
                    setCollapsedSections((current) => ({
                      ...current,
                      [section.id]: !current[section.id],
                    }))
                  }
                >
                  {sectionIsCollapsed ? (
                    <ChevronDown size={13} />
                  ) : (
                    <ChevronUp size={13} />
                  )}
                </button>
                {toolbarsEnabled && (
                  <>
                    <button
                      type="button"
                      aria-label={`Ordenar favoritos de ${section.name} de ${sectionSortDirection === "asc" ? "Z a A" : "A a Z"}`}
                      title={
                        sectionSortDirection === "asc"
                          ? "Ordenar de Z a A"
                          : "Ordenar de A a Z"
                      }
                      onClick={() =>
                        setSectionSort((current) => ({
                          ...current,
                          [section.id]:
                            current[section.id] === "asc" ? "desc" : "asc",
                        }))
                      }
                    >
                      {sectionSortDirection === "desc" ? (
                        <ArrowDownAZ size={13} />
                      ) : (
                        <ArrowUpAZ size={13} />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={`Adicionar favorito à seção ${section.name}`}
                      title="Adicionar favorito"
                      onClick={() => add(section.id)}
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Editar seção ${section.name}`}
                      title="Editar seção"
                      onClick={() => setOpenGroup(section)}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Excluir seção ${section.name}`}
                      title="Excluir seção"
                      onClick={() => setPendingDeleteGroup(section)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {renderFavoriteOverlays(section.id)}
          {!sectionIsCollapsed && (
          <div className="favorites collection-section-favorites">
            {sortedSectionBookmarks.map((b) => (
              <div
                className={`favorite ${
                  dragOverId === b.id && draggedId !== b.id
                    ? dragOverZone === "before"
                      ? "drop-before"
                      : dragOverZone === "after"
                        ? "drop-after"
                        : "drop-target"
                    : ""
                }`}
                key={b.id}
                draggable={toolbarsEnabled}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  setDraggedId(b.id);
                }}
                onDragOver={(event) => {
                  if (!toolbarsEnabled || !draggedId || draggedId === b.id)
                    return;
                  event.preventDefault();
                  event.stopPropagation();
                  setDragOverSectionId(section.id);
                  setDragOverId(b.id);
                  setDragOverZone(draggedIsTile ? "center" : dropZone(event));
                }}
                onDragLeave={() =>
                  setDragOverId((id) => (id === b.id ? null : id))
                }
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleFavoriteDrop({ kind: "bookmark", id: b.id }, section.id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverId(null);
                  setDragOverZone(null);
                  setDragOverSectionId(null);
                }}
                onMouseEnter={(event) => {
                  const container =
                    event.currentTarget.closest(".favorite-anchor");
                  const favoriteRect =
                    event.currentTarget.getBoundingClientRect();
                  const containerRect = container?.getBoundingClientRect();
                  const x = containerRect
                    ? favoriteRect.left -
                      containerRect.left +
                      favoriteRect.width / 2
                    : undefined;
                  if (toolbarsEnabled) {
                    scheduleBookmarkToolbar({
                      bookmark: b,
                      containerKey: section.id,
                      x,
                      y: containerRect
                        ? favoriteRect.top - containerRect.top - 16
                        : undefined,
                    });
                  } else {
                    schedulePreviewCard({
                      bookmark: b,
                      containerKey: section.id,
                      x,
                      y: containerRect
                        ? favoriteRect.top -
                          containerRect.top +
                          favoriteRect.height / 2
                        : undefined,
                    });
                  }
                }}
                onMouseLeave={(event) => {
                  if (toolbarsEnabled) clearBookmarkToolbar(event);
                  else deferPreviewCardClear();
                }}
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
            {!section.bookmarks.length && (
              <span className="empty-row">Seção vazia</span>
            )}
          </div>
          )}
        </div>
        );
      })}
      </div>
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
            <div>
              <h2 id="group-dialog-title">
                {canEditGroup
                  ? openGroupLive.display === "section"
                    ? "Editar seção"
                    : "Editar grupo"
                  : openGroupLive.name}
              </h2>
            </div>
            <div className="modal-heading-actions">
              {canEditGroup && (
                <div
                  className="bookmark-actions"
                  aria-label={`Ações da ${openGroupLive.display === "section" ? "seção" : "grupo"}`}
                >
                  <button
                    type="button"
                    className="danger-icon"
                    disabled={groupBusy}
                    aria-label={
                      openGroupLive.display === "section"
                        ? "Excluir seção"
                        : "Excluir grupo"
                    }
                    title="Excluir"
                    onClick={() => setPendingDeleteGroup(openGroupLive)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
              <button
                className="icon-button"
                type="button"
                aria-label="Fechar modal"
                onClick={() => setOpenGroup(null)}
              >
                <X size={20} />
              </button>
            </div>
          </div>
          {canEditGroup && (
            <div className="group-dialog-fields">
              <label>
                Nome{openGroupLive.display === "section" && " *"}
                <input
                  maxLength={120}
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </label>
              {openGroupLive.display !== "section" && (
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={groupShowName}
                    onChange={(e) => setGroupShowName(e.target.checked)}
                  />
                  Exibir nome
                </label>
              )}
              <label>
                <span>
                  Descrição
                  {openGroupLive.display !== "section" && (
                    <span className="optional">opcional</span>
                  )}
                </span>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                />
              </label>
            </div>
          )}
          {canEditGroup && (
            <div className="collection-bookmarks-heading">
              <h3 id="group-bookmarks-title">Favicons</h3>
              <span>{openGroupLive.bookmarks.length}</span>
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
                {canEditGroup && (
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
          {canEditGroup && (
            <div className="shape-options">
              <span>Formato da Moldura</span>
              <div>
                <button
                  type="button"
                  className={groupShape === null ? "active" : ""}
                  aria-pressed={groupShape === null}
                  onClick={() => setGroupShape(null)}
                >
                  Padrão da coleção
                </button>
                {[
                  ["circle", "Redondo"],
                  ["square", "Quadrado"],
                  ["rounded", "Arredondado"],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={groupShape === value ? "active" : ""}
                    aria-pressed={groupShape === value}
                    onClick={() => setGroupShape(value)}
                  >
                    <span className={`shape-sample ${value}`} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {canEditGroup && (
            <div>
              <label>
                Estilo de cor
              </label>
              <div className="color-picker">
                {[
                  "#8b5cf6",
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
                    onClick={() => setGroupColor(color)}
                  >
                    {groupColor === color && <Check size={18} />}
                  </button>
                ))}
                <input
                  type="color"
                  aria-label="Escolher outra cor"
                  value={groupColor}
                  onChange={(e) => setGroupColor(e.target.value)}
                />
              </div>
            </div>
          )}
          {canEditGroup && (
            <div className="modal-footer">
              <button
                className="secondary cancel"
                type="button"
                disabled={groupBusy}
                onClick={() => setOpenGroup(null)}
              >
                Cancelar
              </button>
              <button
                className="primary"
                type="button"
                disabled={groupBusy || !groupName.trim()}
                onClick={async () => {
                  setGroupBusy(true);
                  await renameGroup(openGroupLive.id, {
                    name: groupName.trim(),
                    color: groupColor,
                    description: groupDescription,
                    showName: groupShowName,
                    shape: groupShape,
                  });
                  setGroupBusy(false);
                  setOpenGroup(null);
                }}
              >
                {groupBusy ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          )}
        </div>
      )}
    </dialog>
    <dialog
      ref={deleteGroupDialog}
      className="confirm-dialog"
      aria-labelledby="delete-group-title"
      onCancel={() => setPendingDeleteGroup(null)}
      onClick={(e) => {
        if (e.target === deleteGroupDialog.current) setPendingDeleteGroup(null);
      }}
    >
      {pendingDeleteGroup && (
        <div className="modal-content">
          <div className="modal-heading">
            <h2 id="delete-group-title">
              {pendingDeleteGroup.display === "section"
                ? "Excluir seção"
                : "Excluir grupo"}
            </h2>
            <button
              className="icon-button"
              type="button"
              aria-label="Fechar modal"
              onClick={() => setPendingDeleteGroup(null)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="delete-confirm">
            <p>
              Excluir "{pendingDeleteGroup.name}"? Os favoritos que estão nela
              não são apagados — só voltam a ficar fora de qualquer{" "}
              {pendingDeleteGroup.display === "section" ? "seção" : "grupo"}.
            </p>
            <button
              type="button"
              className="danger"
              onClick={() => void confirmDeleteGroup()}
            >
              Confirmar exclusão
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setPendingDeleteGroup(null)}
            >
              Cancelar
            </button>
          </div>
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
  const shareParams = new URLSearchParams(location.search);
  const sharedId = shareParams.get("perfil");
  const readOnly = Boolean(sharedId);
  // Fallback de exibição (nome/usuário/cor/avatar) pro cabeçalho do perfil
  // público quando o id não é de uma conta real — ver comentário em
  // GET /api/public/:id (server/index.mjs) e publicProfileHref (Community.tsx).
  const sharedFallback = {
    name: shareParams.get("nome") || "",
    username: shareParams.get("usuario") || "",
    color: shareParams.get("cor") || "",
    avatar: shareParams.get("avatar") || "",
  };
  // Perfil de QUEM está sendo visitado no modo somente leitura — não confundir
  // com "profile", o Account do próprio dono logado usado no resto do app.
  const [viewedProfile, setViewedProfile] = useState<{
    name: string;
    username: string;
    avatar: string;
    followerCount: number;
    memberSince: string | null;
  } | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [notice, setNotice] = useState("");
  const [url, setUrl] = useState("");
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("likemylinks-theme") || "dark";
    } catch {
      return "dark";
    }
  });
  const [kind, setKind] = useState<"collection" | "bookmark" | null>(null);
  const [draft, setDraft] = useState<Draft>({ ...blank });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [newSectionName, setNewSectionName] = useState("");
  // Excluir pela barra de ferramentas do ícone não deve abrir a janela de edição
  // inteira — só uma confirmação enxuta. Estado à parte do "draft"/"kind" usados
  // pelo modal de edição, pra não precisar montar esse modal só pra excluir.
  const [pendingDeleteBookmark, setPendingDeleteBookmark] =
    useState<Bookmark | null>(null);
  // Mesma ideia pra "Excluir coleção" — tanto na barra de ferramentas da
  // coleção quanto no rodapé do próprio modal de edição. Só id/name porque é
  // tudo que a confirmação precisa; a barra passa a coleção inteira e o
  // modal passa só um recorte do "draft" que está sendo editado.
  const [pendingDeleteCollection, setPendingDeleteCollection] = useState<Pick<
    Collection,
    "id" | "name"
  > | null>(null);
  // Mesma ideia, pra "Excluir seção" na lista de seções do editor de coleção
  // (diferente da confirmação equivalente dentro de CollectionRow, que cobre
  // a barra de ferramentas da própria seção e o diálogo de editar seção —
  // este aqui é só pro editor de coleção, que vive neste componente).
  const [pendingDeleteSection, setPendingDeleteSection] = useState<Pick<
    BookmarkGroup,
    "id" | "name" | "display"
  > | null>(null);
  const [lockedBookmarkCollectionId, setLockedBookmarkCollectionId] =
    useState("");
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [likedIds, setLikedIds] = useState<string[]>(() =>
    JSON.parse(localStorage.getItem("likemylinks-liked") || "[]"),
  );
  // Diferente de likedIds (só local): favoritar um item persiste de verdade no
  // servidor, dentro da coleção reservada "Itens Salvos" (ver
  // toggleBookmarkBookmarked) — por isso começa vazio e é carregado de
  // /api/saved-items, não do localStorage.
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>(() =>
    JSON.parse(localStorage.getItem("likemylinks-usage") || "{}"),
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterKey[]>([]);
  // Busca (Postgres full text search em nome/descrição/URL, ver /api/search)
  // — separada da barra "cole um link" do topo, que serve só pra ADICIONAR
  // um favorito novo, não pra achar um já salvo.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    (Bookmark & { collectionName: string })[]
  >([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const searchTimer = useRef<number | null>(null);
  // "Resultados do filtro" é uma coleção sintética (recalculada a cada render,
  // nunca salva no servidor) — expandir/recolher ela não pode passar por
  // toggleCollectionBehavior (que faria PATCH /collections/temporary-filter,
  // um id que não existe de verdade), então tem seu próprio estado local.
  const [filterExpanded, setFilterExpanded] = useState(true);
  // Três abas na home: "collections" é a página atual (inalterada); "community"
  // e "discover" ainda não existem — mostram só um aviso de "em construção" até
  // serem desenvolvidas.
  const [homeTab, setHomeTab] = useState<
    "collections" | "community" | "discover"
  >("collections");
  // Controla se as barras de ferramentas (da coleção e dos favoritos) aparecem ao
  // passar o mouse. Desligado por padrão para não atrapalhar quem só quer navegar.
  const [toolbarsEnabled, setToolbarsEnabled] = useState(false);
  // Botão "expandir/recolher todas" da barra de ações em massa: não é
  // derivado (nem toda coleção precisa estar no mesmo estado o tempo todo),
  // só lembra qual foi o último comando disparado daqui.
  const [allCollectionsExpanded, setAllCollectionsExpanded] = useState(true);
  // Igual ao sortDirection de cada coleção/seção: null = ainda não ordenou
  // nada por aqui (seta pra cima, próximo clique ordena A-Z).
  const [collectionsSortDirection, setCollectionsSortDirection] = useState<
    "asc" | "desc" | null
  >(null);
  // "Sinal" que cada CollectionRow escuta pra recolher/expandir todas as
  // PRÓPRIAS seções de uma vez — precisa ser um objeto novo a cada clique
  // (mesmo repetindo o mesmo "collapse") pra sempre disparar o efeito, já
  // que collapsedSections é estado local de cada linha, não vem por prop.
  const [sectionsBulkAction, setSectionsBulkAction] = useState<{
    collapse: boolean;
    token: number;
  } | null>(null);
  // Arrastar uma coleção pelo "grip" da própria barra de ferramentas pra
  // reordenar a lista "Suas coleções" — mesma ideia do arrastar favoritos,
  // só que sem terços/zonas: aqui é só "solta antes desta".
  const [draggedCollectionId, setDraggedCollectionId] = useState<
    string | null
  >(null);
  const [dragOverCollectionId, setDragOverCollectionId] = useState<
    string | null
  >(null);
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
  const deleteCollectionDialog = useRef<HTMLDialogElement>(null);
  const searchDialog = useRef<HTMLDialogElement>(null);
  const filterDialog = useRef<HTMLDialogElement>(null);
  const deleteSectionDialog = useRef<HTMLDialogElement>(null);
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
        // Um favorito não tem visibilidade própria (sempre herda da coleção —
        // ver comentário no schema.prisma), então "isPublic" aqui é calculado
        // na hora a partir da coleção dona de cada favorito, só pros filtros
        // "Públicos"/"Privados" abaixo, que continuam fazendo sentido cruzando
        // TODAS as coleções do dono (algumas públicas, outras não).
        const all = collections.flatMap((collection) => [
          ...collection.bookmarks,
          ...collection.groups.flatMap((group) => group.bookmarks),
        ].map((bookmark) => ({ ...bookmark, isPublic: collection.isPublic })));
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
        // "Mais/menos usados" e "mais recentes/antigos" ordenam a coleção
        // inteira do dono — sem limite, uma biblioteca grande deixaria essa
        // visão pesada pra pouco ganho prático (ninguém rola até o item nº
        // 500 "mais usado"). Os filtros que só restringem (curtido, público,
        // etc.) não têm esse teto — lá o total já é naturalmente pequeno.
        if (
          activeFilters.includes("newest") ||
          activeFilters.includes("oldest") ||
          activeFilters.includes("mostUsed") ||
          activeFilters.includes("leastUsed")
        )
          bookmarks = bookmarks.slice(0, 100);
        return {
          id: "temporary-filter",
          name: "Resultados do filtro",
          description: activeFilters
            .map((filter) => filterLabels[filter])
            .join(" · "),
          color: "#8b5cf6",
          isPublic: false,
          behavior: filterExpanded ? "expansive" : "fixed",
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
  const editingCollectionSections =
    kind === "collection" && draft.id
      ? (
          collections.find((collection) => collection.id === draft.id)
            ?.groups || []
        ).filter((g) => g.display === "section")
      : [];
  async function reload() {
    setLoading(true);
    setConnectionError("");
    try {
      const data = await api(
        sharedId ? `/public/${encodeURIComponent(sharedId)}` : "/collections",
      );
      if (sharedId) {
        setViewedProfile(data.profile || null);
        // Autor fictício (sem Owner de verdade, ver GET /api/public/:id): mostra
        // as mesmas coleções mockadas já exibidas no card dele no feed, em vez
        // de uma página "sem coleções" pra quem só existe no communityMock.ts.
        setCollections(data.profile ? data.collections : mockCollectionsByAuthor(sharedId));
      } else {
        setCollections(data.collections);
      }
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
      if (sharedId) {
        setViewedProfile(data.profile || null);
        setCollections(data.profile ? data.collections : mockCollectionsByAuthor(sharedId));
      } else {
        setCollections(data.collections);
      }
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
    localStorage.setItem("likemylinks-usage", JSON.stringify(next));
  }
  function toggleBookmarkLiked(bookmark: Bookmark) {
    toggleStoredId(bookmark.id, likedIds, setLikedIds, "likemylinks-liked");
  }
  // Lista de ids já favoritados pelo VISITANTE logado (sempre o próprio dono
  // da sessão, nunca de quem está sendo visitado) — carregada uma vez ao
  // montar e de novo depois de cada favoritar/desfavoritar bem-sucedido.
  // Falha silenciosa: num perfil compartilhado (?perfil=) o visitante pode
  // nem estar logado (ver Auth.tsx), e aí o coração simplesmente não acende
  // pra ele, sem quebrar o resto da página.
  async function loadSavedItems() {
    try {
      const data = await api("/saved-items");
      setBookmarkedIds(data.savedFromIds || []);
    } catch {}
  }
  // Favoritar um item específico (o coração de cada favicon) cria ou remove
  // uma CÓPIA dele dentro da coleção reservada "Itens Salvos" do próprio
  // visitante — funciona tanto pros favoritos que ele mesmo criou quanto pros
  // públicos de outro dono (perfil compartilhado, ?perfil=), já que o
  // servidor recebe os dados do favorito direto do card que o usuário está
  // vendo, sem precisar que ele seja dono do original (ver POST
  // /api/saved-items/:sourceId). Devolve o novo estado (ativo/inativo) pra
  // quem chamou poder refletir na hora, sem esperar um segundo round-trip.
  async function toggleBookmarkBookmarked(
    bookmark: Pick<Bookmark, "id" | "name" | "url" | "description" | "favicon" | "color">,
  ): Promise<boolean | undefined> {
    try {
      const result = await api(
        `/saved-items/${encodeURIComponent(bookmark.id)}`,
        "POST",
        {
          name: bookmark.name,
          url: bookmark.url,
          description: bookmark.description,
          favicon: bookmark.favicon,
          color: bookmark.color,
        },
      );
      setBookmarkedIds((current) =>
        result.active
          ? [...current, bookmark.id]
          : current.filter((id) => id !== bookmark.id),
      );
      // Só recarrega "Suas coleções" quando é a própria — favoritar algo
      // enquanto se visita o perfil de outra pessoa não deve reconsultar as
      // coleções PÚBLICAS dela (readOnly), já que "Itens Salvos" vive na
      // conta do visitante, não na de quem está sendo visitado.
      if (!readOnly) void silentReload();
      return result.active;
    } catch (e) {
      setNotice((e as Error).message);
      return undefined;
    }
  }
  function shareBookmark(bookmark: Bookmark) {
    void navigator.clipboard?.writeText(bookmark.url);
    setNotice("Link copiado.");
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
  // Expande/recolhe TODAS as coleções de uma vez (persiste, é o mesmo campo
  // do chevron individual) e avisa cada CollectionRow (via sectionsBulkAction)
  // pra fazer o mesmo com as próprias seções, que são estado local de cada
  // linha e não vêm do servidor.
  async function toggleAllCollections() {
    const nextExpanded = !allCollectionsExpanded;
    setAllCollectionsExpanded(nextExpanded);
    setSectionsBulkAction({ collapse: !nextExpanded, token: Date.now() });
    try {
      await Promise.all(
        collections.map((c) =>
          api(`/collections/${c.id}`, "PATCH", {
            name: c.name,
            description: c.description,
            color: c.color,
            isPublic: c.isPublic,
            shape: c.shape,
            behavior: nextExpanded ? "expansive" : "fixed",
          }),
        ),
      );
      await silentReload();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function reorderCollections(orderedIds: string[]) {
    try {
      await api("/collections/reorder", "PATCH", { orderedIds });
      await silentReload();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  // Reordena os CONTAINERS pelo nome — não mexe nos favoritos/seções de
  // dentro de cada coleção, só na posição das coleções entre si. Alterna
  // A-Z/Z-A a cada clique, igual ao sort de favoritos de uma coleção/seção.
  function sortCollectionsAlphabetically() {
    const next = collectionsSortDirection === "asc" ? "desc" : "asc";
    setCollectionsSortDirection(next);
    const orderedIds = [...collections]
      .sort((a, b) =>
        next === "asc"
          ? a.name.localeCompare(b.name, "pt-BR")
          : b.name.localeCompare(a.name, "pt-BR"),
      )
      .map((c) => c.id);
    void reorderCollections(orderedIds);
  }
  function handleCollectionDrop(targetId: string) {
    const sourceId = draggedCollectionId;
    setDraggedCollectionId(null);
    setDragOverCollectionId(null);
    // "Resultados do filtro" não é uma coleção de verdade (não tem grip pra
    // iniciar um arrasto, mas ainda pode ser um alvo de drop já que o
    // onDragOver/onDrop do <article> não distingue as duas).
    if (!sourceId || sourceId === targetId || targetId === "temporary-filter")
      return;
    const ids = collections.map((c) => c.id).filter((id) => id !== sourceId);
    const targetIndex = ids.indexOf(targetId);
    ids.splice(targetIndex, 0, sourceId);
    void reorderCollections(ids);
  }
  async function createGroup(collectionId: string, bookmarkIds: string[]) {
    try {
      const created = await api("/groups", "POST", {
        collectionId,
        name: "Novo grupo",
        color: "#8b5cf6",
        bookmarkIds,
      });
      await silentReload();
      return created as BookmarkGroup;
    } catch (e) {
      setNotice((e as Error).message);
      return null;
    }
  }
  // Diferente de createGroup (agrupamento manual, arrastando um ícone sobre
  // outro, sempre com 2+ favoritos de cara): uma seção pode nascer vazia — o
  // usuário adiciona favoritos a ela depois, pelo "+" da própria seção.
  async function createSection(collectionId: string, name: string) {
    try {
      const created = await api("/groups", "POST", {
        collectionId,
        name,
        color: "#8b5cf6",
        display: "section",
        bookmarkIds: [],
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
  // Reposiciona um favorito dentro de uma lista (a da coleção ou a de uma
  // seção) sem agrupá-lo com ninguém — usado ao soltar um ícone arrastado
  // entre dois outros, ou dentro do corpo de uma seção. orderedIds já vem com
  // o item arrastado na posição final desejada.
  async function reorderBookmarks(
    collectionId: string,
    groupId: string | null,
    orderedIds: string[],
  ) {
    try {
      await api("/bookmarks/reorder", "PATCH", {
        collectionId,
        groupId,
        orderedIds,
      });
      await silentReload();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function renameGroup(
    groupId: string,
    data: {
      name: string;
      color: string;
      description: string;
      showName: boolean;
      shape: string | null;
    },
  ) {
    try {
      await api(`/groups/${groupId}`, "PATCH", data);
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
  async function confirmRemoveSection() {
    if (!pendingDeleteSection) return;
    await deleteGroup(pendingDeleteSection.id);
    setPendingDeleteSection(null);
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
    void loadSavedItems();
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
      localStorage.setItem("likemylinks-theme", theme);
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
    if (pendingDeleteCollection && !deleteCollectionDialog.current?.open)
      deleteCollectionDialog.current?.showModal();
    else if (!pendingDeleteCollection && deleteCollectionDialog.current?.open)
      deleteCollectionDialog.current.close();
  }, [pendingDeleteCollection]);
  useEffect(() => {
    if (pendingDeleteSection && !deleteSectionDialog.current?.open)
      deleteSectionDialog.current?.showModal();
    else if (!pendingDeleteSection && deleteSectionDialog.current?.open)
      deleteSectionDialog.current.close();
  }, [pendingDeleteSection]);
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
  // Busca com debounce: espera o usuário parar de digitar por 300ms antes de
  // consultar o servidor, em vez de uma requisição a cada tecla.
  useEffect(() => {
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchBusy(false);
      return;
    }
    setSearchBusy(true);
    searchTimer.current = window.setTimeout(async () => {
      try {
        const data = await api(`/search?q=${encodeURIComponent(query)}`);
        setSearchResults(data.results || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchBusy(false);
      }
    }, 300);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [searchQuery]);
  // Busca e filtro agora são modais de verdade (<dialog>), não painéis soltos
  // — abrir um sempre fecha o outro na hora (ver os onClick dos botões que
  // abrem cada um). Fechar a busca limpa a consulta, pra não reabrir com um
  // resultado velho na tela.
  useEffect(() => {
    if (searchOpen && !searchDialog.current?.open) {
      searchDialog.current?.showModal();
    } else if (!searchOpen && searchDialog.current?.open) {
      searchDialog.current.close();
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [searchOpen]);
  useEffect(() => {
    if (filterOpen && !filterDialog.current?.open)
      filterDialog.current?.showModal();
    else if (!filterOpen && filterDialog.current?.open)
      filterDialog.current.close();
  }, [filterOpen]);
  function open(
    type: "collection" | "bookmark",
    data?: Partial<Draft>,
    lockedCollectionId = "",
  ) {
    setError("");
    setIconUrl("");
    setNewSectionName("");
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
  async function confirmRemoveCollection() {
    if (!pendingDeleteCollection) return;
    setBusy(true);
    try {
      await api(`/collections/${pendingDeleteCollection.id}`, "DELETE");
      setPendingDeleteCollection(null);
      // Mesma lógica do confirmRemoveBookmark: só fecha a janela de edição se
      // ela estiver mesmo aberta nessa coleção.
      if (kind === "collection" && draft.id === pendingDeleteCollection.id)
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
  // Servidor manda a palavra final quando o id é de uma conta real (owner
  // não-nulo em GET /api/public/:id); o fallback da URL só entra em cena
  // antes da resposta chegar, ou pro id fictício que nunca vai ter dono.
  const publicProfileName = viewedProfile?.name || sharedFallback.name || "Usuário";
  const publicProfileUsername = viewedProfile?.username || sharedFallback.username;
  const publicProfileAvatar = viewedProfile?.avatar || sharedFallback.avatar;
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Like My Links, início">
          <img src="/likemylinks-logo-1.png" alt="" />
          <span className="brand-name">
            Like <span className="brand-my">My</span> <span className="brand-links">Links</span>
          </span>
        </a>
        {!readOnly && (
          <form className="search-bar header-add-bar" onSubmit={submitUrl}>
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
                busy ? "Buscando informações do site" : "Adicionar favorito"
              }
              title={
                busy ? "Buscando informações do site" : "Adicionar favorito"
              }
            >
              {busy ? <span className="loader" /> : <Plus size={18} />}
            </button>
          </form>
        )}
        <div className="header-actions">
          <button
            type="button"
            className="theme-toggle"
            aria-label={
              theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"
            }
            title={theme === "dark" ? "Tema claro" : "Tema escuro"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
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
            {readOnly && (
              <section className="public-profile-header">
                <div className="public-profile-banner" />
                <div className="public-profile-main">
                  <span
                    className="public-profile-avatar"
                    style={{ "--orb": sharedFallback.color || "#9aa0a6" } as React.CSSProperties}
                  >
                    {publicProfileAvatar ? (
                      <img src={publicProfileAvatar} alt="" />
                    ) : (
                      publicProfileName.slice(0, 1).toUpperCase()
                    )}
                  </span>
                  <div className="public-profile-info">
                    <h2>{publicProfileName}</h2>
                    {publicProfileUsername && (
                      <span className="public-profile-username">@{publicProfileUsername}</span>
                    )}
                    <span className="public-profile-meta">
                      <CalendarDays size={14} />
                      {viewedProfile?.memberSince
                        ? `Entrou em ${new Date(viewedProfile.memberSince).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`
                        : "Conta de demonstração"}
                    </span>
                    <span className="public-profile-meta">
                      <Users size={14} />
                      <strong>{viewedProfile?.followerCount ?? 0}</strong>{" "}
                      {viewedProfile?.followerCount === 1 ? "seguidor" : "seguidores"}
                    </span>
                  </div>
                </div>
              </section>
            )}
            <div className="sticky-header">
              {!readOnly && (
                <div className="home-tabs" role="tablist" aria-label="Seções da página inicial">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={homeTab === "collections"}
                    className={homeTab === "collections" ? "active" : undefined}
                    onClick={() => setHomeTab("collections")}
                  >
                    Suas coleções
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={homeTab === "community"}
                    className={homeTab === "community" ? "active" : undefined}
                    onClick={() => setHomeTab("community")}
                  >
                    Comunidade
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={homeTab === "discover"}
                    className={homeTab === "discover" ? "active" : undefined}
                    onClick={() => setHomeTab("discover")}
                  >
                    Descobrir
                  </button>
                </div>
              )}
              {(readOnly || homeTab === "collections") && (
              <div className="library-heading">
                <div className="library-summary">
                  <span>
                    {collections.length} {collections.length === 1 ? "Coleção" : "Coleções"}
                  </span>
                  <span className="library-summary-divider" aria-hidden="true" />
                  <span>
                    {total} {total === 1 ? "Favorito" : "Favoritos"}
                  </span>
                </div>
                {!readOnly && (
                  <div
                    className="bulk-collections-toolbar"
                    aria-label="Ações em todas as coleções"
                  >
                    <button
                      type="button"
                      onClick={() => void toggleAllCollections()}
                      aria-label={
                        allCollectionsExpanded
                          ? "Recolher todas as coleções"
                          : "Expandir todas as coleções"
                      }
                      title={
                        allCollectionsExpanded
                          ? "Recolher todas as coleções"
                          : "Expandir todas as coleções"
                      }
                    >
                      {allCollectionsExpanded ? (
                        <ChevronUp size={13} />
                      ) : (
                        <ChevronDown size={13} />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-expanded={filterOpen}
                      aria-label="Filtrar"
                      title="Filtrar"
                      onClick={() => {
                        setSearchOpen(false);
                        setFilterOpen((value) => !value);
                      }}
                    >
                      <SlidersHorizontal size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={sortCollectionsAlphabetically}
                      aria-label={`Ordenar as coleções de ${collectionsSortDirection === "asc" ? "Z a A" : "A a Z"}`}
                      title={
                        (collectionsSortDirection === "asc"
                          ? "Ordenar de Z a A"
                          : "Ordenar de A a Z") +
                        " (só a ordem das coleções, não os itens de dentro)"
                      }
                    >
                      {collectionsSortDirection === "desc" ? (
                        <ArrowDownAZ size={13} />
                      ) : (
                        <ArrowUpAZ size={13} />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-expanded={searchOpen}
                      aria-label="Buscar favoritos"
                      title="Buscar favoritos"
                      onClick={() => {
                        setFilterOpen(false);
                        setSearchOpen((value) => !value);
                      }}
                    >
                      <Search size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="Nova coleção"
                      title="Nova coleção"
                      disabled={loading || !!connectionError}
                      onClick={() => open("collection")}
                    >
                      <Plus size={13} />
                    </button>
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
                  </div>
                )}
                <div className="library-meta">
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
              )}
            </div>
            {homeTab === "community" && !readOnly ? (
              <section className="library">
                <CommunityFeed notify={setNotice} profile={profile} />
              </section>
            ) : homeTab === "discover" && !readOnly ? (
              <section className="library">
                <div className="collections-frame">
                  <div className="empty-state under-construction">
                    <Construction size={34} />
                    <h3>Estamos trabalhando nisso!</h3>
                    <p>O Descobrir ainda está a caminho — volte em breve.</p>
                  </div>
                </div>
              </section>
            ) : (
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
                      remove={() => setPendingDeleteCollection(c)}
                      add={(groupId) =>
                        open(
                          "bookmark",
                          { collectionId: c.id, groupId },
                          c.id,
                        )
                      }
                      editBookmark={(bookmark) => open("bookmark", bookmark)}
                      removeBookmark={setPendingDeleteBookmark}
                      openBookmark={(bookmark) => registerUsage(bookmark.id)}
                      toggleLiked={toggleBookmarkLiked}
                      toggleBookmarked={toggleBookmarkBookmarked}
                      shareBookmark={shareBookmark}
                      toggleBehavior={(c) =>
                        c.id === "temporary-filter"
                          ? setFilterExpanded((value) => !value)
                          : toggleCollectionBehavior(c)
                      }
                      createGroup={createGroup}
                      moveToGroup={moveToGroup}
                      reorderBookmarks={reorderBookmarks}
                      renameGroup={renameGroup}
                      deleteGroup={deleteGroup}
                      sectionsBulkAction={sectionsBulkAction}
                      dragHandle={{
                        dragging: draggedCollectionId === c.id,
                        dragOver:
                          dragOverCollectionId === c.id &&
                          draggedCollectionId !== c.id,
                        onDragStart: () => setDraggedCollectionId(c.id),
                        onDragOver: () => {
                          if (
                            !draggedCollectionId ||
                            draggedCollectionId === c.id ||
                            c.id === "temporary-filter"
                          )
                            return;
                          setDragOverCollectionId(c.id);
                        },
                        onDragLeave: () =>
                          setDragOverCollectionId((id) =>
                            id === c.id ? null : id,
                          ),
                        onDrop: () => handleCollectionDrop(c.id),
                        onDragEnd: () => {
                          setDraggedCollectionId(null);
                          setDragOverCollectionId(null);
                        },
                      }}
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
            )}
          </>
        )}
      </main>
      <footer>
        <span className="brand-name">
          Like <span className="brand-my">My</span> <span className="brand-links">Links</span>
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
                          "likemylinks-liked",
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
                      // "Favoritar" uma coleção continua só local (não existe
                      // "Itens Salvos" de coleção, só de favorito individual —
                      // ver toggleBookmarkBookmarked); só o caso de favorito
                      // de verdade passa a persistir no servidor.
                      if (kind === "bookmark") {
                        void toggleBookmarkBookmarked(draft as Bookmark).then(
                          (active) => {
                            if (active !== undefined) setIsBookmarked(active);
                          },
                        );
                      } else {
                        setIsBookmarked(
                          toggleStoredId(
                            draft.id,
                            bookmarkedIds,
                            setBookmarkedIds,
                            "likemylinks-bookmarked",
                          ),
                        );
                      }
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
                  {kind === "collection" && (
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
                  )}
                  {(kind === "bookmark" || kind === "collection") && (
                    <button
                      type="button"
                      className="danger-icon"
                      aria-label={`Excluir ${kind === "collection" ? "coleção" : "favorito"}`}
                      title="Excluir"
                      onClick={() => {
                        if (kind === "bookmark") {
                          setPendingDeleteBookmark({
                            id: draft.id as string,
                            collectionId: draft.collectionId,
                            name: draft.name,
                            url: draft.url,
                            description: draft.description,
                            favicon: draft.favicon,
                            color: draft.color,
                            isPublic: draft.isPublic,
                          });
                        } else {
                          // Não fecha o modal de edição (diferente do antigo
                          // botão do rodapé): assim, se o usuário cancelar a
                          // exclusão, volta pra cá — o modal nunca chegou a
                          // sumir. confirmRemoveCollection() é quem fecha,
                          // e só se a exclusão for confirmada de verdade.
                          setPendingDeleteCollection({
                            id: draft.id as string,
                            name: draft.name,
                          });
                        }
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
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
                  onKeyDown={(e) => {
                    // Editando um item já existente, Enter no meio da digitação
                    // (ex: depois de selecionar o nome todo e reescrever) não
                    // deve submeter o formulário inteiro e fechar o modal de
                    // supetão — só o botão "Salvar alterações" faz isso. Pra
                    // criar um item novo, Enter continua confirmando normalmente.
                    if (e.key === "Enter" && draft.id) e.preventDefault();
                  }}
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
                  <section
                    className="collection-bookmarks-editor"
                    aria-labelledby="collection-sections-title"
                  >
                    <div className="collection-bookmarks-heading">
                      <h3 id="collection-sections-title">Seções</h3>
                      <span>{editingCollectionSections.length}</span>
                    </div>
                    {editingCollectionSections.length ? (
                      <ul className="collection-bookmarks-list">
                        {editingCollectionSections.map((section) => (
                          <li
                            key={section.id}
                            className="collection-bookmark-row"
                          >
                            <span className="collection-bookmark-favicon">
                              <span
                                className="collection-section-dot"
                                style={{ background: section.color }}
                              />
                            </span>
                            <span className="collection-bookmark-name">
                              {section.name}
                            </span>
                            <div className="collection-bookmark-actions">
                              <button
                                type="button"
                                aria-label={`Excluir seção ${section.name}`}
                                title="Excluir seção"
                                onClick={() => setPendingDeleteSection(section)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="help">
                        Esta coleção ainda não tem seções.
                      </p>
                    )}
                    <div className="collection-section-creator">
                      <input
                        type="text"
                        maxLength={120}
                        placeholder="Nome da nova seção"
                        value={newSectionName}
                        onChange={(e) => setNewSectionName(e.target.value)}
                      />
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy || !newSectionName.trim()}
                        onClick={async () => {
                          if (!draft.id) return;
                          const created = await createSection(
                            draft.id,
                            newSectionName.trim(),
                          );
                          if (created) setNewSectionName("");
                        }}
                      >
                        <Plus size={14} />
                        Criar seção
                      </button>
                    </div>
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
                        // Trocar de coleção invalida a seção escolhida — ela
                        // pertence só à coleção anterior, não à nova.
                        setDraft({ ...draft, collectionId, groupId: null });
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
                  {(() => {
                    const sections = (
                      collections.find((c) => c.id === draft.collectionId)
                        ?.groups || []
                    ).filter((g) => g.display === "section");
                    return (
                      <label className="bookmark-collection">
                        Seção <span className="optional">opcional</span>
                        <select
                          value={draft.groupId || ""}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              groupId: e.target.value || null,
                            })
                          }
                        >
                          <option value="">Nenhuma (direto na coleção)</option>
                          {sections.map((section) => (
                            <option key={section.id} value={section.id}>
                              {section.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    );
                  })()}
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
                    "#8b5cf6",
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
            <div className="modal-footer">
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
                  "#8b5cf6",
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
      <dialog
        ref={deleteCollectionDialog}
        className="confirm-dialog"
        aria-labelledby="delete-collection-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setPendingDeleteCollection(null);
        }}
        onClick={(e) => {
          if (e.target === deleteCollectionDialog.current && !busy)
            setPendingDeleteCollection(null);
        }}
      >
        <div className="modal-content">
          <div className="modal-heading">
            <h2 id="delete-collection-title">Excluir coleção</h2>
            <button
              className="icon-button"
              type="button"
              disabled={busy}
              aria-label="Fechar modal"
              onClick={() => setPendingDeleteCollection(null)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="delete-confirm">
            <p>
              Excluir "{pendingDeleteCollection?.name}" e todos os seus
              favoritos? Esta ação não pode ser desfeita.
            </p>
            <button
              type="button"
              disabled={busy}
              className="danger"
              onClick={confirmRemoveCollection}
            >
              Confirmar exclusão
            </button>
            <button
              type="button"
              disabled={busy}
              className="secondary"
              onClick={() => setPendingDeleteCollection(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      </dialog>
      <dialog
        ref={filterDialog}
        className="confirm-dialog filter-dialog"
        aria-labelledby="filter-dialog-title"
        onCancel={() => setFilterOpen(false)}
        onClick={(e) => {
          if (e.target === filterDialog.current) setFilterOpen(false);
        }}
      >
        <div className="modal-content">
          <div className="modal-heading">
            <h2 id="filter-dialog-title">Filtrar</h2>
            <button
              className="icon-button"
              type="button"
              aria-label="Fechar modal"
              onClick={() => setFilterOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
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
              <button
                type="button"
                className="clear-filter"
                onClick={() => setActiveFilters([])}
              >
                Limpar filtro
              </button>
            )}
          </div>
        </div>
      </dialog>
      <dialog
        ref={searchDialog}
        className="confirm-dialog search-dialog"
        aria-labelledby="search-dialog-title"
        onCancel={() => setSearchOpen(false)}
        onClick={(e) => {
          if (e.target === searchDialog.current) setSearchOpen(false);
        }}
      >
        <div className="modal-content">
          <div className="modal-heading">
            <h2 id="search-dialog-title">Buscar favoritos</h2>
            <button
              className="icon-button"
              type="button"
              aria-label="Fechar modal"
              onClick={() => setSearchOpen(false)}
            >
              <X size={20} />
            </button>
          </div>
          <label className="search-panel-field">
            <Search size={15} />
            <input
              autoFocus
              type="search"
              placeholder="Nome, descrição ou URL do favorito…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
          {(searchQuery.trim() || searchResults.length > 0) && (
            <ul className="search-results">
              {searchResults.map((bookmark) => (
                <li key={bookmark.id} className="search-result-row">
                  <span className="search-result-favicon">
                    {bookmark.favicon ? (
                      <img src={bookmark.favicon} alt="" />
                    ) : (
                      <Globe2 size={16} />
                    )}
                  </span>
                  <a
                    className="search-result-info"
                    href={bookmark.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      registerUsage(bookmark.id);
                      setSearchOpen(false);
                    }}
                  >
                    <strong>{bookmark.name}</strong>
                    <span>{bookmark.collectionName}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {searchBusy && <p className="help">Buscando…</p>}
          {!searchBusy && searchQuery.trim() && !searchResults.length && (
            <p className="help">Nenhum favorito encontrado.</p>
          )}
        </div>
      </dialog>
      <dialog
        ref={deleteSectionDialog}
        className="confirm-dialog"
        aria-labelledby="delete-section-title"
        onCancel={() => setPendingDeleteSection(null)}
        onClick={(e) => {
          if (e.target === deleteSectionDialog.current)
            setPendingDeleteSection(null);
        }}
      >
        <div className="modal-content">
          <div className="modal-heading">
            <h2 id="delete-section-title">
              {pendingDeleteSection?.display === "section"
                ? "Excluir seção"
                : "Excluir grupo"}
            </h2>
            <button
              className="icon-button"
              type="button"
              aria-label="Fechar modal"
              onClick={() => setPendingDeleteSection(null)}
            >
              <X size={20} />
            </button>
          </div>
          <div className="delete-confirm">
            <p>
              Excluir "{pendingDeleteSection?.name}"? Os favoritos que estão
              nela não são apagados — só voltam a ficar fora de qualquer{" "}
              {pendingDeleteSection?.display === "section" ? "seção" : "grupo"}.
            </p>
            <button
              type="button"
              className="danger"
              onClick={() => void confirmRemoveSection()}
            >
              Confirmar exclusão
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setPendingDeleteSection(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
