import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ArrowUpRight,
  Ban,
  Bookmark as BookmarkIcon,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleUser,
  Construction,
  Flag,
  Folder,
  Globe2,
  GripVertical,
  Heart,
  Info,
  Link2,
  Lock,
  LockOpen,
  LogOut,
  MessageCircle,
  Moon,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sun,
  Trash2,
  User,
  VolumeX,
  X,
  Upload,
  Copy,
  Download,
} from "lucide-react";
import type { Account, Bookmark, BookmarkGroup, Collection } from "./types";
import PasswordField from "./PasswordField";
import ShareButton from "./ShareButton";
import { useIsSmallSource } from "./PosterRow";
import CommunityFeed from "./Community";
import CollectionDots from "./CollectionDots";
import { LegalDialog, type LegalDocKind } from "./LegalDocs";
import { useLanguage } from "./i18n";
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
    .catch(() => ({ error: "Não foi possível conectar ao Linkable." }));
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
// Card grande tipo pôster (mesmo visual do feed da Comunidade, ver
// PosterRow.tsx) usado no lugar da Sphere pequena e redonda pros favoritos
// soltos de "Suas coleções"/perfil público (não dentro do painel de grupo,
// que continua com Sphere pequena — ver comentário em ".favorites .sphere"
// no CSS). "shape" (círculo/quadrado/arredondado, configurável por coleção)
// não faz mais sentido como CÍRCULO num pôster 2:3, então cai no mesmo canto
// arredondado de "rounded"; só "square" (cantos retos) continua distinto.
function PosterThumb({
  bookmark,
  shape = "circle",
}: {
  bookmark: Pick<Bookmark, "favicon" | "color" | "name" | "linkStatus">;
  shape?: string;
}) {
  const [failed, setFailed] = useState(false);
  const { isSmallSource, onLoad } = useIsSmallSource();
  const broken = bookmark.linkStatus === "broken";
  useEffect(() => setFailed(false), [bookmark.favicon]);
  return (
    <span
      className={`poster-tile ${shape === "square" ? "poster-tile-square" : ""} ${broken ? "link-broken" : ""}`}
      style={{ "--orb": bookmark.color } as React.CSSProperties}
    >
      {bookmark.favicon && !failed ? (
        <img
          src={bookmark.favicon}
          alt=""
          className={isSmallSource ? "is-small-source" : ""}
          onLoad={onLoad}
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{bookmark.name.slice(0, 1).toUpperCase() || <Globe2 />}</span>
      )}
    </span>
  );
}
// Ícone de grupo (estilo pasta do menu Iniciar do Windows 11): um card do
// mesmo tamanho do pôster de um favorito comum (ver PosterThumb), com fundo
// discreto e uma grade 2x2 dos favicons de dentro. Não participa do sistema de hover-toolbar/preview-card
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
  const preview = group.bookmarks.slice(0, 4);
  const extra = group.bookmarks.length - preview.length;
  return (
    <button
      type="button"
      className={`group-tile ${shape === "square" ? "group-tile-square" : ""} ${expanded ? "is-expanded" : ""}`}
      style={{ "--orb": group.color } as React.CSSProperties}
      aria-label={`Abrir grupo ${group.name}`}
      aria-pressed={expanded}
      title={group.name}
      onClick={onOpen}
    >
      <span className="group-tile-grid">
        {preview.map((b) => (
          <span key={b.id} className="group-tile-cell">
            {b.favicon ? (
              <img src={b.favicon} alt="" />
            ) : (
              <span
                className="group-tile-letter"
                style={{ "--orb": b.color } as React.CSSProperties}
              >
                {b.name.slice(0, 1).toUpperCase() || <Globe2 size={12} />}
              </span>
            )}
          </span>
        ))}
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
  // de precisar da seta pra ver o resto — 7 é o valor de sempre em "Suas
  // coleções" (card grande tipo pôster, ver PosterThumb: cabem menos por
  // linha que os ícones pequenos de antes); o feed da Comunidade usa um
  // valor próprio (ver Community.tsx) porque o card ali é bem mais estreito.
  pageSize = 7,
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
  onUnsave,
  refreshIcons,
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
    parentId?: string | null,
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
      isPublic: boolean;
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
  // Só passado ao renderizar a aba "Itens Salvos" (ver App): remove a
  // referência inteira (coleção alheia seguida, cheia ou parcial) dos salvos
  // do dono logado — diferente de "remove" acima, que apaga uma coleção de
  // verdade e por isso nunca é usado nesse contexto (readOnly some com ele).
  onUnsave?: () => void;
  // "Atualizar imagens" (ver POST /api/collections/:id/refresh-icons) — só
  // passado em "Suas coleções"; sem ele, o botão não aparece.
  refreshIcons?: () => Promise<void>;
}) {
  const { t } = useLanguage();
  const [page, setPage] = useState(0);
  const [refreshingIcons, setRefreshingIcons] = useState(false);
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
  type GridItem =
    | { kind: "bookmark"; id: string; sortKey: string; bookmark: Bookmark }
    | { kind: "group"; id: string; sortKey: string; group: BookmarkGroup };
  // Tile vazio (0 favoritos) some — ninguém cria um "tile" sem conteúdo, e um
  // grupo assim só sobra por perder favoritos um a um. Seção vazia, por outro
  // lado, é um estado válido (nasce vazia, do editor da coleção) e precisa
  // continuar visível pro dono poder adicionar favoritos a ela pelo "+" da
  // própria seção — só é escondida no perfil público (readOnly) quando não
  // sobra nenhum favorito visível lá dentro.
  // Agrupamentos de um container: a coleção (sectionId null) ou uma seção —
  // um agrupamento criado dentro de uma seção continua nela (parentId).
  const tilesIn = (sectionId: string | null) =>
    collection.groups.filter(
      (g) =>
        g.display !== "section" &&
        (g.parentId || null) === sectionId &&
        g.bookmarks.length,
    );
  const tileGroups = tilesIn(null);
  const sectionGroups = collection.groups.filter(
    (g) =>
      g.display === "section" &&
      (g.bookmarks.length || tilesIn(g.id).length || !readOnly),
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
  const draggedIsTile = collection.groups.some(
    (g) => g.id === draggedId && g.display !== "section",
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
    setExpandedGroup(null);
  }, [toolbarsEnabled]);
  // O painel do agrupamento só fecha com um clique fora dele (ou Esc, ou o X)
  // — nunca por o cursor sair: o cartão de prévia de um link de dentro dele
  // (e a barra de edição, e os diálogos abertos a partir dela) é desenhado
  // FORA do painel, então fechar no mouseleave derrubava o painel justo ao
  // usar um desses links. Cliques nesses elementos também não contam como
  // "fora".
  useEffect(() => {
    if (!expandedGroup) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          ".group-expand-panel, .group-tile, .favorite-preview-anchor, .favorite-controls, dialog",
        )
      )
        return;
      setExpandedGroup(null);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setExpandedGroup(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
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
  // Some rápido (ver duração da animação "poster-expand-out-plain" no CSS):
  // o cartão continua montado durante essa saída (com a classe "is-leaving")
  // e só é removido de fato depois que a animação termina.
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
    groupExpandTimer.current = window.setTimeout(
      () => setExpandedGroup(next),
      250,
    );
  };
  // Cursor saiu do card antes do painel abrir: desiste de abrir. Depois de
  // aberto, sair do card não fecha nada (ver o useEffect de pointerdown).
  const cancelGroupExpandOpen = () => {
    if (groupExpandTimer.current) window.clearTimeout(groupExpandTimer.current);
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
    // Agrupamento não entra em outro agrupamento nem vira item de um.
    if (draggedIsTile) return;
    if (target.kind === "group" || zone === "center" || !zone) {
      if (target.kind === "group") {
        void moveToGroup(sourceId, target.id);
      } else {
        // Nasce no container do ícone de destino — dentro de uma seção, fica
        // na seção (ver parentId no schema.prisma).
        void createGroup(collection.id, [sourceId, target.id], containerGroupId).then(
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
    if (!sourceId || draggedIsTile) return;
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
  // Visibilidade da seção/agrupamento (ver comentário em BookmarkGroup no
  // schema.prisma) — só tem efeito de verdade quando a própria coleção
  // também é pública; dentro de uma coleção privada fica sempre escondido,
  // não importa o valor aqui.
  const [groupIsPublic, setGroupIsPublic] = useState(true);
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
      setGroupIsPublic(openGroupLive.isPublic);
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
    useState<Pick<BookmarkGroup, "id" | "name" | "display" | "parentId"> | null>(null);
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
  // Painel com os favoritos de um agrupamento, aberto ao passar o mouse no
  // card dele — renderizado dentro do mesmo ".favorite-anchor" do card (o
  // pill principal, anchorKey "main", ou a seção onde ele vive), já que x/y
  // são relativos a esse container.
  function renderGroupExpandPanel(anchorKey: string) {
    if (!expandedGroupLive) return null;
    if ((expandedGroupLive.parentId || "main") !== anchorKey) return null;
    return (
      <div
        className="group-expand-anchor"
        style={{ left: expandedGroup?.x, top: expandedGroup?.y }}
      >
        <div
          className="group-expand-panel"
          role="dialog"
          aria-label={expandedGroupLive.name}
        >
          <div className="group-expand-heading">
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => setExpandedGroup(null)}
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
                      containerKey: `group-expand:${anchorKey}`,
                      x,
                      y: containerRect
                        ? favoriteRect.top - containerRect.top - 16
                        : undefined,
                    });
                  } else {
                    schedulePreviewCard({
                      bookmark: b,
                      containerKey: `group-expand:${anchorKey}`,
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
    );
  }
  function openGroupExpandFrom(
    event: React.MouseEvent<HTMLElement>,
    groupId: string,
  ) {
    // Mesma lógica do cartão de prévia, só que pra abrir o painel de
    // favoritos do grupo em vez de um cartão — ver scheduleGroupExpand.
    const container = event.currentTarget.closest(".favorite-anchor");
    const tileRect = event.currentTarget.getBoundingClientRect();
    const containerRect = container?.getBoundingClientRect();
    const x = containerRect
      ? tileRect.left - containerRect.left + tileRect.width / 2
      : undefined;
    // Topo do tile menos uma folga (não o centro): o painel cresce pra CIMA a
    // partir daqui (ver transform em .group-expand-anchor), então isso
    // precisa ficar acima do ícone inteiro, senão o painel cobre o próprio tile.
    const y = containerRect ? tileRect.top - containerRect.top - 10 : undefined;
    scheduleGroupExpand({ groupId, x, y });
  }
  function renderGroupTile(group: BookmarkGroup) {
    return (
      <>
        <GroupTile
          group={group}
          shape={group.shape || collection.shape}
          expanded={expandedGroup?.groupId === group.id}
          onOpen={() => {
            // Sem o lápis, o painel já abre sozinho ao passar o mouse —
            // clicar não faz nada.
            if (toolbarsEnabled) setOpenGroup(group);
          }}
        />
        {group.showName ? (
          <span className="favorite-name">{group.name}</span>
        ) : (
          <span className="sr-only">{group.name}</span>
        )}
      </>
    );
  }
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
            {/* Mesmo layout/animação do card grande do feed da Comunidade
                (".poster-expanded", ver PosterRow.tsx) — só o posicionamento
                muda (aqui é a âncora acima, calculada em JS a partir do card
                de repouso, ver schedulePreviewCard). */}
            <div
              key={preview.bookmark.id}
              className={`poster-expanded ${previewCardLeaving ? "is-leaving" : ""}`}
              aria-label={`Prévia do favorito ${preview.bookmark.name}`}
              onMouseEnter={keepPreviewCardVisible}
              onMouseLeave={deferPreviewCardClear}
            >
              <span
                className="poster-expanded-media"
                style={{ background: preview.bookmark.color }}
              >
                <a
                  className="poster-media-link"
                  href={preview.bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Abrir favorito ${preview.bookmark.name}`}
                  onClick={() => openBookmark(preview.bookmark)}
                />
                {preview.bookmark.favicon ? (
                  <PreviewFavicon src={preview.bookmark.favicon} />
                ) : (
                  <Globe2 />
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
                <span className="poster-expanded-title">
                  {preview.bookmark.name}
                </span>
              </span>
              <div className="poster-expanded-panel">
                {preview.bookmark.description && (
                  <p className="poster-expanded-description">
                    {preview.bookmark.description}
                  </p>
                )}
                <div className="poster-expanded-actions">
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
                    <Heart
                      size={14}
                      fill={likedIds.includes(preview.bookmark.id) ? "currentColor" : "none"}
                    />
                    {preview.bookmark.likes !== undefined && preview.bookmark.likes}
                  </button>
                  <button
                    type="button"
                    aria-label={`Favoritar ${preview.bookmark.name}`}
                    aria-pressed={bookmarkedIds.includes(
                      preview.bookmark.savedFromId || preview.bookmark.id,
                    )}
                    title="Favoritar"
                    className={
                      bookmarkedIds.includes(
                        preview.bookmark.savedFromId || preview.bookmark.id,
                      )
                        ? "active"
                        : ""
                    }
                    onClick={() => toggleBookmarked(preview.bookmark)}
                  >
                    <BookmarkIcon
                      size={14}
                      fill={
                        bookmarkedIds.includes(
                          preview.bookmark.savedFromId || preview.bookmark.id,
                        )
                          ? "currentColor"
                          : "none"
                      }
                    />
                    {preview.bookmark.saves !== undefined && preview.bookmark.saves}
                  </button>
                  <ShareButton
                    url={preview.bookmark.url}
                    title={preview.bookmark.name}
                    label={`Compartilhar favorito ${preview.bookmark.name}`}
                    size={14}
                    onCopyLink={() => shareBookmark(preview.bookmark)}
                  >
                    {preview.bookmark.shares !== undefined && preview.bookmark.shares}
                  </ShareButton>
                </div>
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
      data-collection-id={collection.id}
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
          <h3>
            {collection.name}
            {collection.savedFromAuthorName && (
              <span className="collection-saved-from">
                {" "}
                por{" "}
                <a href={`/?perfil=${collection.savedFromAuthorId}`}>
                  {collection.savedFromAuthorName}
                </a>
              </span>
            )}
          </h3>
          <span className="count">{totalBookmarks}</span>
        </div>
        <div className="collection-heading-actions">
          {onUnsave && (
            <button
              type="button"
              className="collection-unsave"
              aria-label={t("collection_unsave_aria", { name: collection.name })}
              onClick={onUnsave}
            >
              {t("collection_unsave")}
            </button>
          )}
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
              {refreshIcons && (
                <button
                  type="button"
                  className={refreshingIcons ? "is-refreshing" : undefined}
                  aria-label={t("collection_refresh_icons_aria", {
                    name: collection.name,
                  })}
                  title={
                    refreshingIcons
                      ? t("collection_refresh_icons_running")
                      : t("collection_refresh_icons")
                  }
                  aria-busy={refreshingIcons}
                  disabled={refreshingIcons}
                  onClick={async () => {
                    setRefreshingIcons(true);
                    try {
                      await refreshIcons();
                    } finally {
                      setRefreshingIcons(false);
                    }
                  }}
                >
                  <RefreshCw size={13} />
                </button>
              )}
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
                className="collection-control-remove"
                aria-label={`Excluir coleção ${collection.name}`}
                title="Excluir coleção"
                onClick={remove}
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
          </div>
        </div>
      </div>
      {collection.description && (
        <p className="collection-description">{collection.description}</p>
      )}
      <div
        className={`collection-frame ${sectionGroups.length ? "has-sections" : ""}`}
      >
      <div className={`pill favorite-anchor ${isExpanded ? "is-expanded" : ""}`}>
        {renderFavoriteOverlays("main")}
        {renderFavoriteOverlays("group-expand:main")}
        {renderGroupExpandPanel("main")}
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
                    // Topo do card (não o centro): com o card grande tipo
                    // pôster (ver PosterThumb), ancorar no centro fazia o
                    // cartão de prévia nascer bem mais baixo quanto mais alto
                    // o card ficava — ancorado no topo, cresce pra baixo a
                    // partir dali sempre do mesmo jeito, independente da
                    // altura do card (mesma ideia do ".poster-expanded" no
                    // feed da Comunidade, que também nasce do topo).
                    schedulePreviewCard({
                      bookmark: b,
                      containerKey: "main",
                      x,
                      y: containerRect
                        ? favoriteRect.top - containerRect.top
                        : undefined,
                    });
                  }
                } else {
                  openGroupExpandFrom(event, item.group.id);
                }
              }}
              onMouseLeave={(event) => {
                if (item.kind === "bookmark") {
                  if (toolbarsEnabled) clearBookmarkToolbar(event);
                  else deferPreviewCardClear();
                } else {
                  cancelGroupExpandOpen();
                }
              }}
            >
              {item.kind === "bookmark" ? (
                <a
                  className="favorite-poster-link"
                  href={item.bookmark.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={item.bookmark.name}
                  onClick={() => openBookmark(item.bookmark)}
                >
                  <PosterThumb bookmark={item.bookmark} shape={collection.shape} />
                  <span className="favorite-name">{item.bookmark.name}</span>
                </a>
              ) : (
                renderGroupTile(item.group)
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
        const sectionTiles = tilesIn(section.id);
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
          {renderFavoriteOverlays(`group-expand:${section.id}`)}
          {renderGroupExpandPanel(section.id)}
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
                    // Topo do card, não o centro — mesmo motivo da grade
                    // principal logo acima (ver comentário lá): ancorar no
                    // centro cresce junto com a altura do card grande tipo
                    // pôster, fazendo o cartão de prévia nascer bem mais
                    // baixo do que devia.
                    schedulePreviewCard({
                      bookmark: b,
                      containerKey: section.id,
                      x,
                      y: containerRect
                        ? favoriteRect.top - containerRect.top
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
                  className="favorite-poster-link"
                  href={b.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={b.name}
                  onClick={() => openBookmark(b)}
                >
                  <PosterThumb bookmark={b} shape={collection.shape} />
                  <span className="favorite-name">{b.name}</span>
                </a>
              </div>
            ))}
            {sectionTiles.map((g) => (
              <div
                className={`favorite ${
                  dragOverId === g.id && draggedId !== g.id ? "drop-target" : ""
                }`}
                key={g.id}
                draggable={toolbarsEnabled}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  setDraggedId(g.id);
                }}
                onDragOver={(event) => {
                  if (
                    !toolbarsEnabled ||
                    !draggedId ||
                    draggedId === g.id ||
                    draggedIsTile
                  )
                    return;
                  event.preventDefault();
                  event.stopPropagation();
                  setDragOverSectionId(section.id);
                  setDragOverId(g.id);
                  setDragOverZone("center");
                }}
                onDragLeave={() =>
                  setDragOverId((id) => (id === g.id ? null : id))
                }
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleFavoriteDrop({ kind: "group", id: g.id }, section.id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverId(null);
                  setDragOverZone(null);
                  setDragOverSectionId(null);
                }}
                onMouseEnter={(event) => openGroupExpandFrom(event, g.id)}
                onMouseLeave={cancelGroupExpandOpen}
              >
                {renderGroupTile(g)}
              </div>
            ))}
            {!section.bookmarks.length && !sectionTiles.length && (
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
                      onClick={() =>
                        void moveToGroup(
                          bookmark.id,
                          openGroupLive.parentId || null,
                        )
                      }
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
            <div>
              <label>
                Visibilidade{" "}
                {!collection.isPublic && (
                  <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                    (a coleção é privada — a seção só fica visível se a coleção virar pública)
                  </span>
                )}
              </label>
              <button
                type="button"
                aria-label={groupIsPublic ? "Tornar seção privada" : "Tornar seção pública"}
                aria-pressed={!groupIsPublic}
                title={groupIsPublic ? "Privar" : "Exibir"}
                className={!groupIsPublic ? "active" : ""}
                onClick={() => setGroupIsPublic((current) => !current)}
              >
                {groupIsPublic ? <LockOpen size={16} /> : <Lock size={16} />}
                {groupIsPublic ? "Pública" : "Privada"}
              </button>
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
                    isPublic: groupIsPublic,
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
              {pendingDeleteGroup.display === "section"
                ? t("section_delete_confirm", { name: pendingDeleteGroup.name })
                : pendingDeleteGroup.parentId
                  ? t("group_delete_confirm_section", {
                      name: pendingDeleteGroup.name,
                      section:
                        collection.groups.find(
                          (g) => g.id === pendingDeleteGroup.parentId,
                        )?.name || "",
                    })
                  : t("group_delete_confirm_collection", {
                      name: pendingDeleteGroup.name,
                    })}
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
// Reduz uma foto (ex: 3840x2160 direto da câmera) antes de mandar pro
// servidor — sem isso, qualquer foto um pouco grande batia num limite de
// tamanho arbitrário e obrigava a pessoa a ir reduzir a imagem em outro
// programa antes de conseguir trocar avatar/capa. O servidor já redimensiona
// a imagem de qualquer forma (ver imageData em server/metadata.mjs), então
// não há motivo pra mandar mais pixels do que o necessário: um <canvas> fora
// da tela reduz localmente pro maior lado não passar de "maxDimension" (nunca
// amplia uma imagem menor) e reexporta como JPEG (mantém PNG só quando a
// original já era PNG, pra não perder transparência de um logo/ícone).
// "size" acima de MAX_SOURCE_BYTES é rejeitado ANTES de tentar decodificar —
// uma imagem gigantesca (ex: 100MB) pode travar a aba tentando abrir no
// <img>/<canvas>, então esse teto é só uma proteção contra esse caso extremo,
// bem folgado em relação a qualquer foto de celular/câmera normal.
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
function downscaleImage(file: File, maxDimension: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_SOURCE_BYTES) {
      reject(new Error("Escolha uma imagem de até 25 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Não foi possível processar a imagem."));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
        const width = Math.max(1, Math.round(img.naturalWidth * scale));
        const height = Math.max(1, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Não foi possível processar a imagem."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
        resolve(canvas.toDataURL(mime, 0.85));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível processar a imagem."));
    img.src = url;
  });
}
// Mesma proporção de ".public-profile-banner" (styles.css) — não os 1500x500
// guardados antes (ver POST /api/auth/banner): aquele valor foi escolhido
// solto, sem olhar a caixa onde a capa realmente aparece (1100x180 no
// cabeçalho, bem mais larga/baixa que 3:1), então a imagem salva ficava mais
// "alta" que a caixa e acabava sendo recortada DE NOVO ali (object-fit:cover
// com posição central), empurrando o enquadramento escolhido no slider pro
// centro. Cortar aqui já nesta proporção — e guardar no servidor nela também
// — faz o "cover" do servidor virar só um resize, e o "cover" da própria
// exibição não ter mais nada sobrando pra recortar.
const BANNER_ASPECT = 1100 / 180;
async function cropBannerImage(file: File, offsetY: number): Promise<string> {
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Escolha uma imagem de até 25 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImageFromUrl(url);
    const srcAspect = img.naturalWidth / img.naturalHeight;
    // Fonte mais larga que a capa: sobra largura, corta as laterais (mantém
    // centralizado — só o slider vertical foi pedido). Fonte mais estreita
    // (o caso comum: qualquer foto normal é bem menos larga que 3:1): sobra
    // altura, e é essa sobra que o slider percorre.
    const sw = srcAspect > BANNER_ASPECT ? img.naturalHeight * BANNER_ASPECT : img.naturalWidth;
    const sh = srcAspect > BANNER_ASPECT ? img.naturalHeight : img.naturalWidth / BANNER_ASPECT;
    const sx = (img.naturalWidth - sw) / 2;
    const sy = (img.naturalHeight - sh) * (offsetY / 100);
    const outWidth = Math.round(Math.min(1920, sw));
    const outHeight = Math.round(outWidth / BANNER_ASPECT);
    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível processar a imagem.");
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
    const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
    return canvas.toDataURL(mime, 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
export default function App({
  account,
  onLogout,
  googleClientId,
}: { account?: Account; onLogout?: () => void; googleClientId?: string } = {}) {
  const { t } = useLanguage();
  // Id do perfil sendo visitado — estado (não um const recalculado a cada
  // render a partir da URL) porque a navegação entre perfis agora acontece
  // sem recarregar a página (ver navigateToProfile/navigateHome abaixo):
  // history.pushState muda a URL, mas só atualizar esse estado é que faz a
  // página re-renderizar mostrando o novo perfil.
  const [sharedId, setSharedId] = useState(
    () => new URLSearchParams(location.search).get("perfil"),
  );
  const readOnly = Boolean(sharedId);
  // Fallback de exibição (nome/usuário/cor/avatar) pro cabeçalho do perfil
  // público quando o id não é de uma conta real — ver comentário em
  // GET /api/public/:id (server/index.mjs) e publicProfileHref (Community.tsx).
  // Continua lido direto da URL (não é estado): toda navegação client-side
  // dá pushState ANTES de mudar "sharedId", então esses parâmetros já estão
  // corretos em location.search no momento em que este componente re-renderiza.
  const shareParams = new URLSearchParams(location.search);
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
    banner: string;
    followerCount: number;
    followingCount: number;
    memberSince: string | null;
  } | null>(null);
  // Liga/desliga os controles de trocar avatar/capa direto na própria página
  // de perfil (ver isSelf mais abaixo) — só existe enquanto isSelf for true;
  // navegar pra outro perfil (ou pra fora do perfil) sempre desliga de novo.
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  // Capa escolhida mas ainda não salva — mostra o slider de reposicionamento
  // (ver cropBannerImage) em vez de subir a imagem na hora, pra dar chance de
  // escolher qual parte dela aparece antes de confirmar. "url" é um object
  // URL (URL.createObjectURL) que precisa ser revogado quando descartado.
  const [bannerDraft, setBannerDraft] = useState<{
    file: File;
    url: string;
    offsetY: number;
  } | null>(null);
  // Minha relação com o perfil sendo visitado (sigo/bloqueei) — separada de
  // "viewedProfile" (dados públicos do dono) porque só existe pra visitante
  // autenticado; segue o mesmo par de listas usado no feed da Comunidade
  // (ver loadCommunityState logo abaixo e followedAuthorIds/blockedAuthorIds
  // em GET /api/community/state, server/community.mjs).
  const [followedAuthorIds, setFollowedAuthorIds] = useState<string[]>([]);
  const [blockedAuthorIds, setBlockedAuthorIds] = useState<string[]>([]);
  const [relationBusy, setRelationBusy] = useState(false);
  const [isProfileActionsMenuOpen, setIsProfileActionsMenuOpen] = useState(false);
  const profileActionsMenu = useRef<HTMLDivElement>(null);
  // Painel "Sobre esta conta" do menu "⋮" do perfil público — mesma ideia do
  // painel homônimo da Comunidade (Community.tsx), só que sem precisar
  // buscar nada à parte: os dados já estão em "viewedProfile"/"collections"
  // (o próprio motivo de estar nesta página).
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const aboutDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (isAboutOpen) aboutDialog.current?.showModal();
    else aboutDialog.current?.close();
  }, [isAboutOpen]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [ownerId, setOwnerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState("");
  const [notice, setNotice] = useState("");
  const [url, setUrl] = useState("");
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("linkable-theme") || "dark";
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
  // Curtir um favorito persiste de verdade no servidor (CommunityItemLike,
  // ver POST /api/community/items/:id/like) — igual a bookmarkedIds abaixo,
  // por isso começa vazio e é carregado de /api/community/state, não do
  // localStorage. Curtir a coleção inteira (ver toggleCollectionLiked) marca
  // todos os favoritos dela aqui também, via cascata no servidor.
  const [likedIds, setLikedIds] = useState<string[]>([]);
  // Diferente de likedIds (era só local antes): favoritar um item persiste de
  // verdade no servidor, dentro da coleção reservada "Itens Salvos" (ver
  // toggleBookmarkBookmarked) — por isso começa vazio e é carregado de
  // /api/saved-items, não do localStorage.
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  // Curtir/favoritar uma COLEÇÃO (diferente de likedIds/bookmarkedIds acima,
  // que são de favorito individual) usa o mesmo mecanismo de "publicação" da
  // aba Comunidade (CommunityPostLike/Save, ver server/community.mjs) — vale
  // pra qualquer coleção, própria ou alheia, e é o que faz "curtir uma
  // coleção marca todos os itens dela como curtidos" (curtir) e "salvar uma
  // coleção alheia cria uma cópia editável em Suas coleções" (favoritar)
  // funcionarem também a partir deste modal, não só do feed (ver
  // Community.tsx, que usa a mesma rota).
  const [communityPostLikes, setCommunityPostLikes] = useState<string[]>([]);
  const [communityPostSaves, setCommunityPostSaves] = useState<string[]>([]);
  // Dados completos dos favoritos ALHEIOS curtidos na Comunidade (ver GET
  // /api/community/items/liked) — curtir nunca cria cópia (diferente de
  // favoritar, que sempre cria em "Itens Salvos"), então sem isto o filtro
  // "Com gostei" só via os curtidos que por acaso já eram do próprio dono.
  const [likedForeignBookmarks, setLikedForeignBookmarks] = useState<
    Bookmark[]
  >([]);
  const [usage, setUsage] = useState<Record<string, number>>(() =>
    JSON.parse(localStorage.getItem("linkable-usage") || "{}"),
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
  // Quatro abas na home: "collections" é a própria "Suas coleções"; "saved" é
  // "Itens Salvos" (coleções alheias seguidas, ver loadSavedCollections
  // abaixo); "community" e "discover" ainda não existem de verdade —
  // "discover" só mostra um aviso de "em construção" até ser desenvolvida.
  const [homeTab, setHomeTab] = useState<
    "collections" | "saved" | "community" | "discover"
  >("collections");
  // Coleções alheias que o dono logado salvou (inteiras ou só alguns links) —
  // sempre lidas ao vivo do servidor (ver GET /api/saved-collections), nunca
  // uma cópia local: reflete edição de quem criou sem precisar recarregar.
  const [savedCollections, setSavedCollections] = useState<Collection[]>([]);
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
  const [usernameDraft, setUsernameDraft] = useState("");
  const [legalDoc, setLegalDoc] = useState<LegalDocKind | null>(null);
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
        // Curtir (diferente de favoritar) nunca cria cópia — um link ALHEIO
        // curtido na Comunidade não existe em nenhuma coleção própria, então
        // sem somar likedForeignBookmarks aqui ele nunca apareceria neste
        // filtro, mesmo já persistido no servidor (ver GET
        // /api/community/items/liked). Só entra no pool quando o filtro
        // "Com gostei" está ativo, pra não vazar pros outros filtros.
        const ownIds = new Set(all.map((bookmark) => bookmark.id));
        const pool = activeFilters.includes("liked")
          ? [
              ...all,
              ...likedForeignBookmarks.filter(
                (bookmark) => !ownIds.has(bookmark.id),
              ),
            ]
          : all;
        let bookmarks = [...pool];
        if (activeFilters.includes("liked"))
          bookmarks = bookmarks.filter((bookmark) =>
            likedIds.includes(bookmark.id),
          );
        if (activeFilters.includes("bookmarked"))
          bookmarks = bookmarks.filter((bookmark) =>
            bookmarkedIds.includes(bookmark.savedFromId || bookmark.id),
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
  function registerUsage(id: string) {
    const next = { ...usage, [id]: (usage[id] || 0) + 1 };
    setUsage(next);
    localStorage.setItem("linkable-usage", JSON.stringify(next));
  }
  // Curtir persiste no servidor (CommunityItemLike) — funciona igual pro
  // próprio favorito ou pro de outro dono (perfil público, feed da
  // Comunidade), já que o servidor só grava a interação, sem exigir posse.
  async function toggleBookmarkLiked(bookmark: Bookmark): Promise<boolean | undefined> {
    const wasLiked = likedIds.includes(bookmark.id);
    setLikedIds((current) =>
      wasLiked ? current.filter((id) => id !== bookmark.id) : [...current, bookmark.id],
    );
    try {
      const result = await api(`/community/items/${encodeURIComponent(bookmark.id)}/like`, "POST");
      setLikedIds((current) =>
        result.active
          ? current.includes(bookmark.id)
            ? current
            : [...current, bookmark.id]
          : current.filter((id) => id !== bookmark.id),
      );
      // Curtir nunca cria cópia (diferente de favoritar): sem isto, um link
      // ALHEIO recém-curtido só apareceria no filtro "Com gostei" depois de
      // um reload (ver loadLikedItems) — aqui já se tem os dados completos
      // em mãos, então atualiza a lista na hora.
      setLikedForeignBookmarks((current) =>
        result.active
          ? current.some((b) => b.id === bookmark.id)
            ? current
            : [...current, bookmark]
          : current.filter((b) => b.id !== bookmark.id),
      );
      return result.active;
    } catch (e) {
      setLikedIds((current) =>
        wasLiked ? [...current, bookmark.id] : current.filter((id) => id !== bookmark.id),
      );
      setNotice((e as Error).message);
      return undefined;
    }
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
  // Dados da aba "Itens Salvos" — sempre lidos ao vivo do servidor (ver GET
  // /api/saved-collections), nunca guardados como cópia local: refeito a cada
  // troca de aba/carregamento pra refletir edições recentes de quem criou.
  async function loadSavedCollections() {
    try {
      const data = await api("/saved-collections");
      setSavedCollections(data.collections || []);
    } catch {}
  }
  // Remove uma referência inteira (coleção alheia seguida, cheia ou parcial)
  // dos salvos — botão "Remover dos salvos" em CollectionRow, só aparece na
  // aba "Itens Salvos". Diferente de desfavoritar um item avulso (coração),
  // que só tira um link por vez quando a referência é parcial.
  async function unsaveCollection(collectionId: string) {
    setSavedCollections((current) => current.filter((c) => c.id !== collectionId));
    try {
      await api(`/saved-collections/${encodeURIComponent(collectionId)}`, "DELETE");
      void loadSavedItems();
    } catch (e) {
      setNotice((e as Error).message);
      void loadSavedCollections();
    }
  }
  // Expandir/recolher um card de "Itens Salvos" não pode persistir via PATCH
  // /collections/:id (a coleção nem é do dono logado) — fica só de exibição,
  // local a esta sessão, igual ao expandir/recolher do "Resultados do filtro"
  // (ver filterExpanded acima).
  function toggleSavedCollectionBehavior(collection: Collection) {
    setSavedCollections((current) =>
      current.map((c) =>
        c.id === collection.id
          ? { ...c, behavior: c.behavior === "expansive" ? "fixed" : "expansive" }
          : c,
      ),
    );
  }
  // Favoritar um item específico (o coração de cada favicon) liga/desliga uma
  // REFERÊNCIA a ele na aba "Itens Salvos" do próprio visitante — nunca uma
  // cópia — funciona tanto pros favoritos que ele mesmo criou (BookmarkSaveMark,
  // sem virar referência) quanto pros públicos de outro dono (perfil
  // compartilhado, ?perfil=), já que o servidor só precisa do id do favorito,
  // sem exigir que o visitante seja dono do original (ver POST
  // /api/saved-items/:sourceId). Devolve o novo estado (ativo/inativo) pra
  // quem chamou poder refletir na hora, sem esperar um segundo round-trip.
  async function toggleBookmarkBookmarked(
    bookmark: Pick<
      Bookmark,
      "id" | "name" | "url" | "description" | "favicon" | "color" | "savedFromId"
    >,
  ): Promise<boolean | undefined> {
    // Se "bookmark" já vem de dentro da própria aba "Itens Salvos", o alvo do
    // toggle é o original (savedFromId) — não o id do favorito de verdade
    // renderizado ali, que já É o original nesse caso (savedFromId fica
    // undefined), então cai direto em bookmark.id de qualquer forma.
    const sourceId = bookmark.savedFromId || bookmark.id;
    try {
      const result = await api(`/saved-items/${encodeURIComponent(sourceId)}`, "POST");
      setBookmarkedIds((current) =>
        result.active
          ? [...current, sourceId]
          : current.filter((id) => id !== sourceId),
      );
      // Só recarrega "Suas coleções"/"Itens Salvos" quando é a própria sessão
      // — favoritar algo enquanto se visita o perfil de outra pessoa não deve
      // reconsultar as coleções PÚBLICAS dela (readOnly), já que "Itens
      // Salvos" vive na conta do visitante, não na de quem está sendo visitado.
      if (!readOnly) {
        void silentReload();
        void loadSavedCollections();
      }
      return result.active;
    } catch (e) {
      setNotice((e as Error).message);
      return undefined;
    }
  }
  function shareBookmark(bookmark: Bookmark) {
    void navigator.clipboard?.writeText(bookmark.url);
    setNotice("Link copiado.");
    // Fogo-e-esqueça: só alimenta a contagem/relevância de compartilhamentos
    // (ver POST /api/community/items/:id/share em server/community.mjs) — o
    // link já foi copiado acima, então uma falha aqui não precisa de aviso.
    void api(`/community/items/${encodeURIComponent(bookmark.id)}/share`, "POST").catch(() => {});
  }
  async function loadCommunityState() {
    try {
      const data = await api("/community/state");
      setCommunityPostLikes(data.likedPostIds || []);
      setCommunityPostSaves(data.savedPostIds || []);
      setLikedIds(data.likedItemIds || []);
      setFollowedAuthorIds(data.followedAuthorIds || []);
      setBlockedAuthorIds(data.blockedAuthorIds || []);
    } catch {}
  }
  async function loadLikedItems() {
    try {
      const data = await api("/community/items/liked");
      setLikedForeignBookmarks(data.items || []);
    } catch {}
  }
  // Seguir/deixar de seguir o dono do perfil público sendo visitado (ver
  // seção "public-profile-header" mais abaixo) — mesmo endpoint usado pelo
  // botão "Seguir" do cartão de perfil da Comunidade (Community.tsx).
  // Atualiza a contagem de seguidores exibida de forma otimista, desfazendo
  // os dois lados em caso de erro.
  async function toggleFollowViewed() {
    if (!sharedId || relationBusy) return;
    const wasFollowing = followedAuthorIds.includes(sharedId);
    setRelationBusy(true);
    setFollowedAuthorIds((current) =>
      wasFollowing ? current.filter((id) => id !== sharedId) : [...current, sharedId],
    );
    setViewedProfile((current) =>
      current
        ? { ...current, followerCount: current.followerCount + (wasFollowing ? -1 : 1) }
        : current,
    );
    try {
      await api(`/community/users/${encodeURIComponent(sharedId)}/follow`, "POST");
    } catch (e) {
      setFollowedAuthorIds((current) =>
        wasFollowing ? [...current, sharedId] : current.filter((id) => id !== sharedId),
      );
      setViewedProfile((current) =>
        current
          ? { ...current, followerCount: current.followerCount + (wasFollowing ? 1 : -1) }
          : current,
      );
      setNotice((e as Error).message);
    } finally {
      setRelationBusy(false);
    }
  }
  // Bloquear a partir do próprio perfil público (menu "⋮" no cabeçalho) —
  // mesmo endpoint/efeito do bloqueio feito a partir do feed da Comunidade:
  // esconde as publicações e comentários desse autor lá (ver blockedAuthorIds
  // em Community.tsx), só que iniciado daqui.
  async function toggleBlockViewed() {
    if (!sharedId || relationBusy) return;
    const wasBlocked = blockedAuthorIds.includes(sharedId);
    setRelationBusy(true);
    setBlockedAuthorIds((current) =>
      wasBlocked ? current.filter((id) => id !== sharedId) : [...current, sharedId],
    );
    try {
      await api(`/community/users/${encodeURIComponent(sharedId)}/block`, "POST");
      setNotice(wasBlocked ? "Conta desbloqueada." : "Conta bloqueada.");
      setIsProfileActionsMenuOpen(false);
    } catch (e) {
      setBlockedAuthorIds((current) =>
        wasBlocked ? [...current, sharedId] : current.filter((id) => id !== sharedId),
      );
      setNotice((e as Error).message);
    } finally {
      setRelationBusy(false);
    }
  }
  function copyPublicProfileLink() {
    if (!sharedId) return;
    void navigator.clipboard
      ?.writeText(`${location.origin}/?perfil=${encodeURIComponent(sharedId)}`)
      .then(() => setNotice("Link do perfil copiado."))
      .catch(() => setNotice("Não foi possível copiar o link."));
    setIsProfileActionsMenuOpen(false);
  }
  // Troca de perfil dentro da mesma aba/instância do app, sem recarregar a
  // página — pushState atualiza a URL (pra continuar copiável/compartilhável
  // e funcionar com voltar/avançar do navegador, ver o listener de
  // "popstate" abaixo) e "sharedId" vira estado pra disparar o re-fetch do
  // perfil (ver o useEffect de "sharedId" logo depois do de montagem).
  function navigateToProfile(
    id: string,
    fallback?: { name?: string; username?: string; color?: string; avatar?: string },
  ) {
    const params = new URLSearchParams({ perfil: id });
    if (fallback?.name) params.set("nome", fallback.name);
    if (fallback?.username) params.set("usuario", fallback.username);
    if (fallback?.color) params.set("cor", fallback.color);
    if (fallback?.avatar) params.set("avatar", fallback.avatar);
    history.pushState({}, "", `/?${params.toString()}`);
    setSharedId(id);
    setIsEditingProfile(false);
    cancelBannerDraft();
  }
  function navigateHome() {
    history.pushState({}, "", "/");
    setSharedId(null);
    setIsEditingProfile(false);
    cancelBannerDraft();
  }
  // Deixa cliques com modificador (abrir em aba nova, aba em segundo plano
  // etc.) seguirem o comportamento padrão do navegador pelo href de verdade
  // — só um clique simples do botão esquerdo é interceptado pra navegar sem
  // recarregar.
  function handleProfileNav(
    id: string,
    fallback: { name?: string; username?: string; color?: string; avatar?: string } | undefined,
    e: React.MouseEvent,
  ) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    e.preventDefault();
    navigateToProfile(id, fallback);
  }
  function handleHomeNav(e: React.MouseEvent) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    e.preventDefault();
    navigateHome();
  }
  // Curtir uma coleção marca todos os favoritos dela como curtidos também
  // (cascata feita no servidor, ver POST /api/community/posts/:id/like) —
  // funciona pra coleção própria ou alheia (só a relevância distingue os
  // dois casos).
  async function toggleCollectionLiked(collectionId: string) {
    const wasLiked = communityPostLikes.includes(collectionId);
    setCommunityPostLikes((current) =>
      wasLiked ? current.filter((id) => id !== collectionId) : [...current, collectionId],
    );
    setIsLiked(!wasLiked);
    try {
      await api(`/community/posts/${encodeURIComponent(collectionId)}/like`, "POST");
    } catch (e) {
      setCommunityPostLikes((current) =>
        wasLiked ? [...current, collectionId] : current.filter((id) => id !== collectionId),
      );
      setIsLiked(wasLiked);
      setNotice((e as Error).message);
    }
  }
  // Favoritar a PRÓPRIA coleção só marca os itens dela como salvos (sem
  // referência nenhuma); favoritar a de OUTRO dono passa a "seguir" ela por
  // completo na aba "Itens Salvos" — os dois casos são resolvidos no servidor
  // (ver POST /api/community/posts/:id/save), por isso recarrega essa aba nos
  // dois sentidos (salvar cria a referência, desfazer pode apagá-la).
  async function toggleCollectionSaved(collectionId: string) {
    const wasSaved = communityPostSaves.includes(collectionId);
    setCommunityPostSaves((current) =>
      wasSaved ? current.filter((id) => id !== collectionId) : [...current, collectionId],
    );
    setIsBookmarked(!wasSaved);
    try {
      await api(`/community/posts/${encodeURIComponent(collectionId)}/save`, "POST");
      void loadSavedCollections();
      if (!wasSaved) void silentReload();
    } catch (e) {
      setCommunityPostSaves((current) =>
        wasSaved ? [...current, collectionId] : current.filter((id) => id !== collectionId),
      );
      setIsBookmarked(wasSaved);
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
  async function createGroup(
    collectionId: string,
    bookmarkIds: string[],
    parentId?: string | null,
  ) {
    try {
      const created = await api("/groups", "POST", {
        collectionId,
        name: "Novo grupo",
        color: "#8b5cf6",
        showName: true,
        bookmarkIds,
        parentId: parentId || null,
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
      isPublic: boolean;
    },
  ) {
    try {
      await api(`/groups/${groupId}`, "PATCH", data);
      await silentReload();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function refreshCollectionIcons(collectionId: string) {
    try {
      const { total, updated } = (await api(
        `/collections/${collectionId}/refresh-icons`,
        "POST",
      )) as { total: number; updated: number };
      setNotice(
        updated
          ? t("collection_refresh_icons_done", { updated, total })
          : t("collection_refresh_icons_none"),
      );
      if (updated) await silentReload();
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  async function deleteGroup(groupId: string) {
    try {
      const data = (await api(`/groups/${groupId}`, "DELETE")) as {
        returnedTo?: { kind: "section" | "collection"; name?: string };
      } | null;
      setNotice(
        data?.returnedTo?.kind === "section"
          ? t("group_deleted_to_section", { name: data.returnedTo.name || "" })
          : t("group_deleted_to_collection"),
      );
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
    void loadSavedCollections();
    void loadCommunityState();
    void loadLikedItems();
  }, []);
  // Navegar entre perfis (ou entre um perfil e o início) agora acontece sem
  // recarregar a página (ver navigateToProfile/navigateHome) — "sharedId" é
  // que dispara o re-fetch do perfil visitado. A primeira execução
  // (montagem) já é coberta pelo efeito acima, então é pulada aqui.
  const didMountSharedId = useRef(false);
  useEffect(() => {
    if (!didMountSharedId.current) {
      didMountSharedId.current = true;
      return;
    }
    void reload();
  }, [sharedId]);
  // pushState (usado por navigateToProfile/navigateHome) não dispara nenhum
  // evento sozinho — sem este listener, voltar/avançar pelo navegador mudaria
  // a URL mas deixaria a tela presa no perfil visto antes.
  useEffect(() => {
    function onPopState() {
      setSharedId(new URLSearchParams(location.search).get("perfil"));
      setIsEditingProfile(false);
      cancelBannerDraft();
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  // Trocar de aba (Suas coleções/Comunidade/Descobrir) não muda a URL nem
  // remonta a página "Suas coleções", então sem isto um favorito salvo por
  // fora (ex: pela extensão) enquanto o visitante estava em outra aba só
  // apareceria depois de um F5 manual. A primeira execução (montagem) já é
  // coberta pelo efeito acima, então é pulada aqui.
  const didMountHomeTab = useRef(false);
  useEffect(() => {
    if (!didMountHomeTab.current) {
      didMountHomeTab.current = true;
      return;
    }
    void silentReload();
    void loadSavedItems();
    void loadSavedCollections();
    void loadCommunityState();
    void loadLikedItems();
  }, [homeTab]);
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
      localStorage.setItem("linkable-theme", theme);
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
      setUsernameDraft(profile?.username || "");
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
    if (!isProfileActionsMenuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (!profileActionsMenu.current?.contains(e.target as Node))
        setIsProfileActionsMenuOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsProfileActionsMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProfileActionsMenuOpen]);
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
    setIsLiked(
      Boolean(
        data?.id &&
          (type === "collection" ? communityPostLikes : likedIds).includes(data.id),
      ),
    );
    setIsBookmarked(
      Boolean(
        data?.id &&
          (type === "collection" ? communityPostSaves : bookmarkedIds).includes(data.id),
      ),
    );
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
  // "viewedProfile" é um estado separado de "profile" (dados de quem está
  // sendo visitado vs. a própria conta) — sem esta sincronização, editar o
  // avatar/capa na própria página de perfil só refletiria ali depois de um F5.
  function syncViewedProfileFromAccount(user: Account) {
    setViewedProfile((current) =>
      current && sharedId === user.id
        ? { ...current, avatar: user.avatar, banner: user.banner }
        : current,
    );
  }
  async function saveAvatar(avatar: string) {
    setProfileBusy(true);
    setProfileError("");
    try {
      const data = await api("/auth/avatar", "POST", { avatar });
      setProfile(data.user);
      syncViewedProfileFromAccount(data.user);
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }
  async function uploadAvatar(file?: File) {
    if (!file) return;
    // 512px: bem acima do que o avatar chega a mostrar (84px na própria
    // página de perfil, o maior uso) e do que o servidor guarda (256x256,
    // ver imageData) — sobra pra tela retina sem carregar mais que isso.
    try {
      await saveAvatar(await downscaleImage(file, 512));
    } catch (e) {
      setProfileError((e as Error).message);
    }
  }
  async function saveBanner(banner: string) {
    setProfileBusy(true);
    setProfileError("");
    try {
      const data = await api("/auth/banner", "POST", { banner });
      setProfile(data.user);
      syncViewedProfileFromAccount(data.user);
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }
  // Escolher o arquivo só abre o slider de reposicionamento (bannerDraft) —
  // o upload de verdade só acontece em confirmBannerDraft, depois que a
  // pessoa escolhe qual parte da imagem aparece.
  function selectBannerFile(file?: File) {
    if (!file) return;
    if (file.size > MAX_SOURCE_BYTES) {
      setProfileError("Escolha uma imagem de até 25 MB.");
      return;
    }
    setBannerDraft((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return { file, url: URL.createObjectURL(file), offsetY: 50 };
    });
  }
  function cancelBannerDraft() {
    setBannerDraft((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }
  async function confirmBannerDraft() {
    if (!bannerDraft) return;
    try {
      const cropped = await cropBannerImage(bannerDraft.file, bannerDraft.offsetY);
      await saveBanner(cropped);
      cancelBannerDraft();
    } catch (e) {
      setProfileError((e as Error).message);
    }
  }
  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    setProfileNotice("");
    try {
      const data = await api("/auth/me", "PATCH", { displayName: nameDraft });
      setProfile(data.user);
      setProfileNotice(t("account_display_name_saved"));
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }
  async function saveUsername(e: React.FormEvent) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    setProfileNotice("");
    try {
      const data = await api("/auth/me", "PATCH", { username: usernameDraft });
      setProfile(data.user);
      setUsernameDraft(data.user.username || "");
      setProfileNotice(t("account_username_saved"));
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
  // Sem fallback de sharedFallback: autores fictícios do feed da Comunidade
  // (ver communityMock.ts) não têm capa, só nome/usuário/cor/avatar.
  const publicProfileBanner = viewedProfile?.banner || "";
  // Usado dentro do cabeçalho do próprio perfil público (botão "Editar
  // Perfil" só aparece pro dono).
  const isSelf = !!profile && profile.id === sharedId;
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="/"
          aria-label="Linkable, início"
          onClick={handleHomeNav}
        >
          <img
            src={theme === "dark" ? "/linkable-logotype-2.png" : "/linkable-logotype-1.png"}
            alt="Linkable"
          />
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
                      {t("account")}
                    </button>
                    <a
                      href={`/?perfil=${profile?.id ?? ""}`}
                      role="menuitem"
                      onClick={(e) => {
                        setIsAccountMenuOpen(false);
                        if (!profile?.id) return;
                        // Sai da página "Conta" (se estiver aberta) — senão
                        // ela continua cobrindo o perfil público no <main>.
                        if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey)
                          setIsProfileOpen(false);
                        handleProfileNav(profile.id, undefined, e);
                      }}
                    >
                      <CircleUser size={16} />
                      {t("profile")}
                    </a>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        setTheme(theme === "dark" ? "light" : "dark");
                      }}
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
        {!isProfileOpen &&
          !loading &&
          !connectionError &&
          (readOnly || homeTab === "collections" ? (
            <CollectionDots collections={displayedCollections} />
          ) : homeTab === "saved" ? (
            <CollectionDots collections={savedCollections} />
          ) : null)}
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
                <h2 id="profile-title">{t("account")}</h2>
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
                <h3>{t("account_display_name")}</h3>
                <label>
                  <input
                    aria-label={t("account_display_name")}
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    required
                    maxLength={60}
                    disabled={profileBusy}
                  />
                </label>
                <p className="help">{t("account_display_name_help")}</p>
                <button
                  className="primary"
                  type="submit"
                  disabled={profileBusy}
                >
                  {profileBusy ? t("account_saving") : t("account_display_name_save")}
                </button>
              </form>
              <form className="profile-section" onSubmit={saveUsername}>
                <h3>{t("account_username")}</h3>
                <label>
                  <input
                    aria-label={t("account_username")}
                    value={usernameDraft}
                    onChange={(e) => setUsernameDraft(e.target.value.toLowerCase())}
                    required
                    minLength={3}
                    maxLength={32}
                    pattern="[a-z0-9_.\-]{3,32}"
                    autoCapitalize="none"
                    autoComplete="username"
                    spellCheck={false}
                    disabled={profileBusy}
                  />
                </label>
                <p className="help">{t("account_username_help")}</p>
                <button
                  className="primary"
                  type="submit"
                  disabled={profileBusy || usernameDraft === (profile?.username || "")}
                >
                  {profileBusy ? t("account_saving") : t("account_username_save")}
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
              <div className="profile-section">
                <h3>{t("legal_section")}</h3>
                <p className="help">
                  {profile?.termsAcceptedAt
                    ? t("legal_accepted_on", {
                        date: new Date(profile.termsAcceptedAt).toLocaleDateString(),
                      })
                    : t("legal_section_help")}
                </p>
                <div className="legal-actions">
                  {/* Rota GET autenticada pelo cookie de sessão — o próprio
                      navegador baixa o JSON (Content-Disposition). */}
                  <a
                    className="secondary legal-download"
                    href="/api/auth/me/export"
                    download
                  >
                    <Download size={15} />
                    {t("legal_download_data")}
                  </a>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setLegalDoc("privacy")}
                  >
                    {t("legal_privacy")}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setLegalDoc("terms")}
                  >
                    {t("legal_terms")}
                  </button>
                </div>
                <p className="help">{t("legal_download_help")}</p>
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
            {readOnly && (() => {
              const isFollowing = !!sharedId && followedAuthorIds.includes(sharedId);
              const isBlocked = !!sharedId && blockedAuthorIds.includes(sharedId);
              const canEditProfile = isSelf && isEditingProfile;
              return (
                <section className="public-profile-header">
                  <div className="public-profile-banner">
                    {bannerDraft ? (
                      <>
                        <img
                          src={bannerDraft.url}
                          alt=""
                          style={{ objectPosition: `50% ${bannerDraft.offsetY}%` }}
                        />
                        <div className="public-profile-banner-adjust">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={bannerDraft.offsetY}
                            aria-label={t("profile_banner_position")}
                            onChange={(e) => {
                              const offsetY = Number(e.target.value);
                              setBannerDraft((current) => (current ? { ...current, offsetY } : current));
                            }}
                          />
                          <div className="public-profile-banner-adjust-actions">
                            <button
                              type="button"
                              className="secondary"
                              disabled={profileBusy}
                              onClick={cancelBannerDraft}
                            >
                              {t("profile_banner_cancel")}
                            </button>
                            <button
                              type="button"
                              className="primary"
                              disabled={profileBusy}
                              onClick={() => void confirmBannerDraft()}
                            >
                              {t("profile_banner_save")}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        {publicProfileBanner && <img src={publicProfileBanner} alt="" />}
                        {canEditProfile && (
                          <label className="public-profile-banner-edit">
                            <Camera size={16} />
                            {t("profile_edit_banner")}
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              disabled={profileBusy}
                              onChange={(e) => selectBannerFile(e.target.files?.[0])}
                            />
                          </label>
                        )}
                      </>
                    )}
                  </div>
                  <div className={`public-profile-main${profile ? " public-profile-main-actions" : ""}`}>
                    <span
                      className="public-profile-avatar"
                      style={{ "--orb": sharedFallback.color || "#9aa0a6" } as React.CSSProperties}
                    >
                      {publicProfileAvatar ? (
                        <img src={publicProfileAvatar} alt="" />
                      ) : (
                        publicProfileName.slice(0, 1).toUpperCase()
                      )}
                      {canEditProfile && (
                        <label
                          className="public-profile-avatar-edit"
                          aria-label={t("profile_edit_avatar")}
                          title={t("profile_edit_avatar")}
                        >
                          <Camera size={16} />
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            disabled={profileBusy}
                            onChange={(e) => void uploadAvatar(e.target.files?.[0])}
                          />
                        </label>
                      )}
                    </span>
                    {profile && isSelf && (
                      <div className="public-profile-actions public-profile-actions-top">
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setIsEditingProfile((value) => !value)}
                        >
                          {isEditingProfile ? t("profile_edit_done") : t("profile_edit")}
                        </button>
                      </div>
                    )}
                    {profile && !isSelf && (
                      <div className="public-profile-actions public-profile-actions-top">
                        <button
                          type="button"
                          className="secondary"
                          disabled
                          title="Mensagens diretas ainda não estão disponíveis"
                        >
                          <MessageCircle size={15} />
                          Mensagem
                        </button>
                        <button
                          type="button"
                          className={isFollowing ? "secondary" : "primary"}
                          disabled={relationBusy}
                          onClick={toggleFollowViewed}
                        >
                          {isFollowing ? "Seguindo" : "Seguir"}
                        </button>
                      </div>
                    )}
                    {profile && !isSelf && (
                      <div className="public-profile-actions-top public-profile-menu-standalone">
                        <div className="account-menu public-profile-menu" ref={profileActionsMenu}>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Mais opções sobre esta conta"
                            aria-expanded={isProfileActionsMenuOpen}
                            onClick={() => setIsProfileActionsMenuOpen((open) => !open)}
                          >
                            <MoreVertical size={18} />
                          </button>
                          {isProfileActionsMenuOpen && (
                            <div
                              className="comment-menu-panel public-profile-menu-panel"
                              role="menu"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className="menu-danger"
                                disabled
                                title="Em breve"
                              >
                                <Flag size={15} />
                                Denunciar conta
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setIsProfileActionsMenuOpen(false);
                                  setIsAboutOpen(true);
                                }}
                              >
                                <Info size={15} />
                                Sobre esta conta
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={copyPublicProfileLink}
                              >
                                <Link2 size={15} />
                                Copiar link do perfil
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="menu-danger"
                                disabled={relationBusy}
                                onClick={toggleBlockViewed}
                              >
                                <Ban size={15} />
                                {isBlocked ? "Desbloquear" : "Bloquear"}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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
                    <div className="public-profile-stats">
                      <span>
                        <strong>{viewedProfile?.followingCount ?? 0}</strong> Seguindo
                      </span>
                      <span>
                        <strong>{viewedProfile?.followerCount ?? 0}</strong>{" "}
                        {viewedProfile?.followerCount === 1 ? "Seguidor" : "Seguidores"}
                      </span>
                    </div>
                  </div>
                </section>
              );
            })()}
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
                    aria-selected={homeTab === "saved"}
                    className={homeTab === "saved" ? "active" : undefined}
                    onClick={() => setHomeTab("saved")}
                  >
                    {t("home_tab_saved")}
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
            {homeTab === "saved" && !readOnly ? (
              <section className="library">
                <div className="collections-frame">
                  {savedCollections.length ? (
                    savedCollections.map((c) => (
                      <CollectionRow
                        key={c.id}
                        collection={c}
                        readOnly
                        toolbarsEnabled={toolbarsEnabled}
                        likedIds={likedIds}
                        bookmarkedIds={bookmarkedIds}
                        edit={() => {}}
                        remove={() => {}}
                        add={() => {}}
                        editBookmark={() => {}}
                        removeBookmark={() => {}}
                        openBookmark={(bookmark) => registerUsage(bookmark.id)}
                        toggleLiked={toggleBookmarkLiked}
                        toggleBookmarked={toggleBookmarkBookmarked}
                        shareBookmark={shareBookmark}
                        toggleBehavior={toggleSavedCollectionBehavior}
                        createGroup={async () => null}
                        moveToGroup={async () => {}}
                        reorderBookmarks={async () => {}}
                        renameGroup={async () => {}}
                        deleteGroup={async () => {}}
                        sectionsBulkAction={null}
                        dragHandle={{
                          dragging: false,
                          dragOver: false,
                          onDragStart: () => {},
                          onDragOver: () => {},
                          onDragLeave: () => {},
                          onDrop: () => {},
                          onDragEnd: () => {},
                        }}
                        onUnsave={() => void unsaveCollection(c.id)}
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
                      <h3>{t("saved_empty_title")}</h3>
                      <p>{t("saved_empty_body")}</p>
                    </div>
                  )}
                </div>
              </section>
            ) : homeTab === "community" && !readOnly ? (
              <section className="library">
                <CommunityFeed
                  notify={setNotice}
                  profile={profile}
                  onOpenProfile={(author, e) => handleProfileNav(author.id, author, e)}
                />
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
                      refreshIcons={
                        c.id === "temporary-filter"
                          ? undefined
                          : () => refreshCollectionIcons(c.id)
                      }
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
        <img
          className="footer-logotype"
          src={theme === "dark" ? "/linkable-logotype-2.png" : "/linkable-logotype-1.png"}
          alt="Linkable"
        />
      </footer>
      <LegalDialog doc={legalDoc} onClose={() => setLegalDoc(null)} />
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
                      if (kind === "collection") void toggleCollectionLiked(draft.id);
                      else
                        void toggleBookmarkLiked(draft as Bookmark).then((active) => {
                          if (active !== undefined) setIsLiked(active);
                        });
                    }}
                  >
                    <Heart size={16} fill={isLiked ? "currentColor" : "none"} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Favoritar ${kind === "collection" ? "coleção" : "página"}`}
                    title="Favoritar"
                    aria-pressed={isBookmarked}
                    className={isBookmarked ? "active" : ""}
                    onClick={() => {
                      if (!draft.id) return;
                      if (kind === "bookmark") {
                        void toggleBookmarkBookmarked(draft as Bookmark).then(
                          (active) => {
                            if (active !== undefined) setIsBookmarked(active);
                          },
                        );
                      } else {
                        void toggleCollectionSaved(draft.id);
                      }
                    }}
                  >
                    <BookmarkIcon size={16} fill={isBookmarked ? "currentColor" : "none"} />
                  </button>
                  <ShareButton
                    url={draft.url || location.href}
                    title={draft.name}
                    label={`Compartilhar ${kind === "collection" ? "coleção" : "favorito"}`}
                    size={16}
                    onCopyLink={() => {
                      void navigator.clipboard?.writeText(
                        draft.url || location.href,
                      );
                      setNotice("Link copiado.");
                      if (!draft.id) return;
                      const path =
                        kind === "collection"
                          ? `/community/posts/${encodeURIComponent(draft.id)}/share`
                          : `/community/items/${encodeURIComponent(draft.id)}/share`;
                      void api(path, "POST").catch(() => {});
                    }}
                  />
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
              {pendingDeleteSection?.display === "section"
                ? t("section_delete_confirm", { name: pendingDeleteSection.name })
                : t("group_delete_confirm_collection", {
                    name: pendingDeleteSection?.name || "",
                  })}
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
      <dialog
        ref={aboutDialog}
        aria-labelledby="about-account-title"
        onClose={() => setIsAboutOpen(false)}
        onClick={(e) => {
          if (e.target === aboutDialog.current) setIsAboutOpen(false);
        }}
      >
        {readOnly && (
          <div className="modal-content">
            <div className="modal-heading">
              <h2 id="about-account-title">Sobre esta conta</h2>
              <button
                className="icon-button"
                type="button"
                aria-label="Fechar"
                onClick={() => setIsAboutOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="about-account">
              <span
                className="feed-avatar"
                style={{ "--orb": sharedFallback.color || "#9aa0a6" } as React.CSSProperties}
              >
                {publicProfileAvatar ? (
                  <img src={publicProfileAvatar} alt="" />
                ) : (
                  publicProfileName.slice(0, 1).toUpperCase()
                )}
              </span>
              <div className="feed-post-meta">
                <strong>{publicProfileName}</strong>
                {publicProfileUsername && (
                  <span className="feed-post-sub">@{publicProfileUsername}</span>
                )}
              </div>
            </div>
            <ul className="about-account-facts">
              <li>
                <span>Publicações no Linkable</span>
                <strong>{collections.length}</strong>
              </li>
              <li>
                <span>Seguidores</span>
                <strong>{viewedProfile?.followerCount ?? 0}</strong>
              </li>
              <li>
                <span>Conta desde</span>
                <strong>
                  {viewedProfile?.memberSince
                    ? new Date(viewedProfile.memberSince).toLocaleDateString("pt-BR", {
                        month: "long",
                        year: "numeric",
                      })
                    : "Conta de demonstração"}
                </strong>
              </li>
            </ul>
          </div>
        )}
      </dialog>
    </div>
  );
}
