import React, { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Globe2,
  Heart,
  Bookmark as BookmarkIcon,
} from "lucide-react";
import ShareButton from "./ShareButton";
import type { Bookmark, Collection } from "./types";

// Layout de cards grandes tipo pôster de streaming (Netflix/Disney+), usado
// tanto no feed da Comunidade (este arquivo) quanto nos tiles de "Suas
// coleções"/perfil público (ver PosterThumb em App.tsx, que importa
// useIsSmallSource daqui) — mesmo tratamento de imagem pequena/borrada nos
// dois lugares, um só lugar pra manter.

// Um favicon pequeno (ex.: um .ico de 16px, sem apple-touch-icon nem manifest
// disponíveis) esticado pra cobrir o pôster inteiro fica borrado (foi o que
// aconteceu com a Epic Games) — mesmo limiar fixo do PreviewFavicon em
// App.tsx (96px), não uma medida dinâmica contra o card: medir contra
// "img.parentElement.clientWidth" no próprio onLoad é uma corrida contra o
// layout — se o layout do grid ainda não tinha resolvido a largura da coluna
// nesse instante (ex.: imagem servida do cache do navegador, cujo onLoad
// pode disparar quase instantaneamente), a comparação saía errada e a
// imagem pequena continuava sendo esticada/borrada mesmo em repouso. Abaixo
// de 96px de origem, mostra em tamanho real (sem upscale), centralizada no
// fundo colorido; do contrário estica/cobre normalmente.
export const SMALL_SOURCE_THRESHOLD = 96;
export function useIsSmallSource() {
  const [isSmallSource, setIsSmallSource] = useState(false);
  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setIsSmallSource(
      img.naturalWidth < SMALL_SOURCE_THRESHOLD ||
        img.naturalHeight < SMALL_SOURCE_THRESHOLD,
    );
  };
  return { isSmallSource, onLoad };
}

// Delay entre o cursor parar sobre o card e o card "reagir" (abrir a versão
// grande) — rápido o bastante pra não parecer travado, devagar o bastante
// pra não disparar só de o cursor passar de raspão indo pra outro lugar.
const LONG_HOVER_DELAY_MS = 450;

function PosterCard({
  bookmark,
  liked,
  bookmarked,
  onToggleLiked,
  onToggleBookmarked,
  onShare,
}: {
  bookmark: Bookmark;
  liked: boolean;
  bookmarked: boolean;
  onToggleLiked: () => void;
  onToggleBookmarked: () => void;
  onShare: () => void;
}) {
  // "visible"/"closing" (não só true/false): ao tirar o cursor, o card some
  // com uma animação de saída (ver ".poster-expanded.is-leaving" no CSS,
  // mesma duração/ideia do cartão de prévia de "Suas coleções" em App.tsx) —
  // "closing" mantém o card montado (com essa classe) até a animação acabar,
  // só então desmonta de vez.
  const [expandState, setExpandState] = useState<"hidden" | "visible" | "closing">(
    "hidden",
  );
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const smallThumb = useIsSmallSource();
  const smallExpandedThumb = useIsSmallSource();
  function clearTimers() {
    if (openTimer.current) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }
  const longHover = expandState !== "hidden";
  return (
    <div
      className="poster-card"
      onMouseEnter={() => {
        clearTimers();
        openTimer.current = window.setTimeout(
          () => setExpandState("visible"),
          LONG_HOVER_DELAY_MS,
        );
      }}
      onMouseLeave={() => {
        clearTimers();
        setExpandState((current) => {
          if (current !== "visible") return "hidden";
          closeTimer.current = window.setTimeout(
            () => setExpandState("hidden"),
            220,
          );
          return "closing";
        });
      }}
    >
      {/* Card de repouso: só a imagem (com zoom + borda no passar rápido do
          cursor) e o nome embaixo, FORA da imagem — vira a base sobre a qual
          o card grande (abaixo) aparece por cima quando o hover demora. */}
      <span className="poster-media">
        <a
          className="poster-media-link"
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Abrir favorito ${bookmark.name}`}
        />
        <span className="poster-media-fill" style={{ background: bookmark.color }}>
          {bookmark.favicon ? (
            <img
              src={bookmark.favicon}
              alt=""
              className={smallThumb.isSmallSource ? "is-small-source" : ""}
              onLoad={smallThumb.onLoad}
            />
          ) : (
            <Globe2 />
          )}
        </span>
      </span>
      <span className="poster-name">{bookmark.name}</span>
      {/* Card grande: some sobre o de repouso (position: absolute, mais
          largo) — "surge por cima do card normal", como no hover da Netflix.
          A entrada em si (pequeno+transparente crescendo até o tamanho/
          opacidade final) é a animação "poster-expand-in" no CSS, disparada
          sozinha assim que este elemento é inserido no DOM. Sem borda (essa
          é só do card pequeno, no hover rápido) — o painel escuro embaixo é
          quem separa a imagem do resto, ocupando uns bons "um terço" do
          card, como no rascunho. */}
      {longHover && (
        <div
          className={`poster-expanded ${expandState === "closing" ? "is-leaving" : ""}`}
        >
          <span
            className="poster-expanded-media"
            style={{ background: bookmark.color }}
          >
            <a
              className="poster-media-link"
              href={bookmark.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir favorito ${bookmark.name}`}
            />
            {bookmark.favicon ? (
              <img
                src={bookmark.favicon}
                alt=""
                className={
                  smallExpandedThumb.isSmallSource ? "is-small-source" : ""
                }
                onLoad={smallExpandedThumb.onLoad}
              />
            ) : (
              <Globe2 />
            )}
            <span className="poster-expanded-title">{bookmark.name}</span>
          </span>
          <div className="poster-expanded-panel">
            {bookmark.description && (
              <p className="poster-expanded-description">
                {bookmark.description}
              </p>
            )}
            <div className="poster-expanded-actions">
              <button
                type="button"
                className={liked ? "active" : ""}
                aria-label={`Curtir favorito ${bookmark.name}`}
                aria-pressed={liked}
                onClick={onToggleLiked}
              >
                <Heart size={14} fill={liked ? "currentColor" : "none"} />
                {bookmark.likes ?? 0}
              </button>
              <button
                type="button"
                className={bookmarked ? "active" : ""}
                aria-label={`Favoritar ${bookmark.name}`}
                aria-pressed={bookmarked}
                onClick={onToggleBookmarked}
              >
                <BookmarkIcon size={14} fill={bookmarked ? "currentColor" : "none"} />
                {bookmark.saves ?? 0}
              </button>
              <ShareButton
                url={bookmark.url}
                title={bookmark.name}
                label={`Compartilhar favorito ${bookmark.name}`}
                size={14}
                onCopyLink={onShare}
              >
                {bookmark.shares ?? 0}
              </ShareButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PosterRow({
  collection,
  pageSize = 4,
  likedIds,
  bookmarkedIds,
  toggleLiked,
  toggleBookmarked,
  shareBookmark,
}: {
  collection: Collection;
  pageSize?: number;
  likedIds: string[];
  bookmarkedIds: string[];
  toggleLiked: (bookmark: Bookmark) => void;
  toggleBookmarked: (bookmark: Bookmark) => void;
  shareBookmark: (bookmark: Bookmark) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [active, setActive] = useState(0);
  const items: Bookmark[] = [
    ...collection.bookmarks,
    ...collection.groups.flatMap((group) => group.bookmarks),
  ];
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const shown = expanded
    ? items
    : items.slice(active * pageSize, active * pageSize + pageSize);
  return (
    <div className="poster-frame">
      <div className="poster-header">
        <h3 className="poster-title">{collection.name}</h3>
        {collection.description && (
          <p className="poster-description">{collection.description}</p>
        )}
      </div>
      <div className="poster-row-wrap">
        <button
          type="button"
          className="poster-expand-toggle"
          aria-label={`${expanded ? "Recolher" : "Expandir"} coleção ${collection.name}`}
          aria-expanded={expanded}
          title={expanded ? "Recolher coleção" : "Expandir coleção"}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
        <div className={`poster-row ${expanded ? "is-expanded" : ""}`}>
          {shown.map((bookmark) => (
            <PosterCard
              key={bookmark.id}
              bookmark={bookmark}
              liked={likedIds.includes(bookmark.id)}
              bookmarked={bookmarkedIds.includes(
                bookmark.savedFromId || bookmark.id,
              )}
              onToggleLiked={() => toggleLiked(bookmark)}
              onToggleBookmarked={() => toggleBookmarked(bookmark)}
              onShare={() => shareBookmark(bookmark)}
            />
          ))}
          {!items.length && <span className="empty-row">Coleção vazia</span>}
        </div>
      </div>
      {!expanded && pages > 1 && (
        <div className="poster-page-controls">
          <button
            className="page-arrow"
            aria-label={`Página anterior de ${collection.name}`}
            disabled={active === 0}
            onClick={() => setActive((value) => value - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="page-info">
            {active * pageSize + 1}–
            {Math.min(active * pageSize + pageSize, items.length)} de{" "}
            {items.length}
          </span>
          <button
            className="page-arrow"
            aria-label={`Próxima página de ${collection.name}`}
            disabled={active >= pages - 1}
            onClick={() => setActive((value) => value + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
