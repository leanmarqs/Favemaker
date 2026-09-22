import React, { useEffect, useRef, useState } from "react";
import {
  Heart,
  MessageCircle,
  Bookmark as BookmarkIcon,
  Share2,
  Reply,
  Flag,
  MoreVertical,
  Trash2,
  UserX,
  UserPlus,
  UserMinus,
  Info,
  Link as LinkIcon,
  X,
} from "lucide-react";
import { api, CollectionRow } from "./App";
import type { Account, Bookmark, Collection } from "./types";

// Autor de um comentário/publicação no feed: os usuários fictícios (ver
// communityMock.ts) só têm cor + inicial; um autor real (o próprio visitante,
// ver profileAuthor abaixo) traz o avatar de verdade do perfil — Avatar (mais
// abaixo) decide entre os dois a partir de qual campo veio preenchido.
interface FeedAuthor {
  id: string;
  name: string;
  username: string;
  avatar?: string;
  color?: string;
}
interface FeedComment {
  id: string;
  author: FeedAuthor;
  postedAt: string;
  text: string;
  likes: number;
}
// Publicação real: uma coleção pública de um dono de verdade (ver GET
// /api/community/feed em server/community.mjs) — o próprio id da coleção é o
// postId usado em curtir/salvar/comentar. postedAt vem cru do servidor (ISO,
// a data em que a coleção virou pública) e é formatado com
// formatRelativeTime, igual aos comentários.
interface FeedPost {
  id: string;
  user: FeedAuthor;
  postedAt: string;
  collection: Collection;
  likes: number;
}
interface CommunityState {
  likedPostIds: string[];
  savedPostIds: string[];
  likedItemIds: string[];
  savedItemIds: string[];
  likedCommentIds: string[];
  savedCommentIds: string[];
  comments: Record<string, FeedComment[]>;
  // Denúncias, bloqueios e ocultação automática (ver server/community.mjs) —
  // reportedCommentIds é só do próprio visitante (pra desabilitar o botão
  // depois de denunciar); hiddenCommentIds já vem filtrado por todo mundo que
  // denunciou o suficiente, então some do feed de qualquer um que o carregar.
  reportedCommentIds: string[];
  blockedAuthorIds: string[];
  hiddenCommentIds: string[];
  // Denúncia/ocultação de PUBLICAÇÃO (não do comentário) e "seguir" — ver
  // cartão de perfil (hover no nome) e o menu "⋮" da publicação mais abaixo.
  reportedPostIds: string[];
  hiddenPostIds: string[];
  followedAuthorIds: string[];
}
const emptyState: CommunityState = {
  likedPostIds: [],
  savedPostIds: [],
  likedItemIds: [],
  savedItemIds: [],
  likedCommentIds: [],
  savedCommentIds: [],
  comments: {},
  reportedCommentIds: [],
  blockedAuthorIds: [],
  hiddenCommentIds: [],
  reportedPostIds: [],
  hiddenPostIds: [],
  followedAuthorIds: [],
};
// Nº de seguidores e de publicações (coleções públicas, ver GET
// /api/community/users/:authorId em server/community.mjs) e data de criação
// da conta — buscado sob demanda ao abrir o cartão de perfil ou o painel
// "Sobre esta conta", não numa lista antecipada pra cada publicação do feed.
interface AccountInfo {
  followerCount: number;
  postCount: number;
  memberSince: string | null;
}
// O servidor devolve o comentário "cru" (createdAt em ISO, sem contagem de
// curtidas — ver asComment em server/community.mjs); FeedComment é o shape
// que o feed já sabe renderizar (postedAt formatado, likes de fábrica em 0,
// já que nenhum outro usuário real curte um comentário assim que ele nasce).
function toFeedComment(raw: {
  id: string;
  author: FeedAuthor;
  text: string;
  createdAt: string;
}): FeedComment {
  return {
    id: raw.id,
    author: raw.author,
    postedAt: formatRelativeTime(raw.createdAt),
    text: raw.text,
    likes: 0,
  };
}

function formatRelativeTime(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} dia${days > 1 ? "s" : ""}`;
  const weeks = Math.floor(days / 7);
  return `${weeks} semana${weeks > 1 ? "s" : ""}`;
}

// Autor real do visitante logado, no mesmo shape usado pelos comentários
// fictícios — é o que corrige o avatar mostrado ao comentar (ver App.tsx,
// onde "profile" já é o mesmo Account exibido no menu da conta/página de
// perfil, com a foto de verdade em vez de uma inicial genérica).
function profileAuthor(profile: Account | undefined): FeedAuthor {
  if (!profile) return { id: "me", name: "Você", username: "", color: "#9aa0a6" };
  return {
    id: profile.id,
    name: profile.displayName || profile.name,
    username: profile.username,
    avatar: profile.avatar,
  };
}

// Link pro perfil público do autor (App.tsx, ?perfil=<id>) — nome/usuário/cor
// vão na própria URL como fallback de exibição só pros autores fictícios
// (ver GET /api/public/:id em server/index.mjs, que devolve profile:null pra
// esses ids); um autor real sempre tem Owner de verdade, então a página busca
// os dados atualizados no servidor e ignora esse fallback.
function publicProfileHref(author: FeedAuthor): string {
  const params = new URLSearchParams({ perfil: author.id, nome: author.name, usuario: author.username });
  if (author.color) params.set("cor", author.color);
  if (author.avatar) params.set("avatar", author.avatar);
  return `/?${params.toString()}`;
}

function Avatar({ author, small }: { author: FeedAuthor; small?: boolean }) {
  return (
    <span
      className={`feed-avatar${small ? " feed-avatar-sm" : ""}`}
      style={{ "--orb": author.color || "#9aa0a6" } as React.CSSProperties}
    >
      {author.avatar ? <img src={author.avatar} alt="" /> : author.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

// Cartão de perfil ao passar o mouse no nome do autor da publicação — mesma
// ideia do Instagram: avatar, nome/usuário, contagem de publicações (coleções
// públicas)/seguidores (real)/seguindo e o botão de Seguir. onMouseEnter/
// onMouseLeave no cartão em si (não só no gatilho) permitem mover o mouse até
// o botão Seguir sem o cartão fechar.
function HoverCard({
  author,
  info,
  loading,
  isFollowing,
  onToggleFollow,
  onMouseEnter,
  onMouseLeave,
}: {
  author: FeedAuthor;
  info?: AccountInfo;
  loading: boolean;
  isFollowing: boolean;
  onToggleFollow: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  return (
    <div className="hover-card" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="hover-card-head">
        <Avatar author={author} />
        <div className="feed-post-meta">
          <strong>{author.name}</strong>
          <span className="feed-post-sub">@{author.username}</span>
        </div>
      </div>
      <div className="hover-card-stats">
        <div>
          <strong>{loading ? "…" : (info?.postCount ?? 0)}</strong>
          <span>{info?.postCount === 1 ? "publicação" : "publicações"}</span>
        </div>
        <div>
          <strong>{loading ? "…" : (info?.followerCount ?? 0)}</strong>
          <span>seguidores</span>
        </div>
        <div>
          <strong>0</strong>
          <span>seguindo</span>
        </div>
      </div>
      <button type="button" className={isFollowing ? "secondary" : "primary"} onClick={onToggleFollow}>
        {isFollowing ? "Seguindo" : "Seguir"}
      </button>
    </div>
  );
}

const noop = () => {};
const noopAsync = async () => {};
const dragHandleStub = {
  dragging: false,
  dragOver: false,
  onDragStart: noop,
  onDragOver: noop,
  onDragLeave: noop,
  onDrop: noop,
  onDragEnd: noop,
};

// Feed da aba Comunidade — protótipo com PUBLICAÇÕES fictícias (ver
// communityMock.ts): o card de cada uma é o mesmo CollectionRow usado em
// "Suas coleções" (mesma pílula, mesmo hover/prévia, mesmos links reais com
// favicon de verdade), só que em modo readOnly. Curtir/comentar/salvar a
// PUBLICAÇÃO em si (a barra abaixo do card) já não é só fachada: persiste no
// banco por dono (ver server/community.mjs), então sobrevive a trocar de
// navegador/dispositivo — só as publicações em si (autor, coleção, curtidas
// "de fábrica") continuam fixas no frontend, sem tabela própria ainda.
export default function CommunityFeed({
  notify,
  profile,
}: {
  notify: (message: string) => void;
  profile: Account | undefined;
}) {
  const me = profileAuthor(profile);
  const [state, setState] = useState<CommunityState>(emptyState);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  // Sub-abas da Comunidade: "feed" é o mural de todo mundo (inalterado);
  // "saved" mostra só as publicações em que o visitante clicou "Salvar" (ver
  // toggleSavePost e savedPostIds) — o "Salvar" do post inteiro nunca copiou
  // nada pra "Suas coleções" (isso é só o coração de cada favorito
  // individual, ver toggleBookmarked mais abaixo), então esta aba é onde essa
  // lista de publicações salvas passa a ter um lugar pra ser revisitada.
  const [feedTab, setFeedTab] = useState<"feed" | "saved">("feed");
  const commentInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sendingComment, setSendingComment] = useState<string | null>(null);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [openPostMenuFor, setOpenPostMenuFor] = useState<string | null>(null);
  // Chave por publicação (não por autor): o mesmo autor pode ter mais de uma
  // publicação no feed (ex: Marina tem duas), e cada cabeçalho é seu próprio
  // gatilho de hover — indexar por authorId faria passar o mouse numa
  // publicação abrir o cartão em TODAS as publicações desse autor de uma vez.
  const [hoverPostId, setHoverPostId] = useState<string | null>(null);
  const hoverHideTimer = useRef<number | null>(null);
  const [accountInfo, setAccountInfo] = useState<Record<string, AccountInfo>>({});
  const [accountInfoLoading, setAccountInfoLoading] = useState<Record<string, boolean>>({});
  const [aboutAccountId, setAboutAccountId] = useState<string | null>(null);
  const aboutDialog = useRef<HTMLDialogElement>(null);

  // Fecha o menu "⋮" (do comentário ou da publicação — mesma classe
  // ".comment-menu" pros dois) ao clicar fora ou apertar Esc — mesmo padrão
  // do menu da conta em App.tsx, só que com um id só por tipo (não uma ref
  // por item) porque qualquer clique fora de ".comment-menu" fecha, não
  // importa qual item estava aberto.
  useEffect(() => {
    if (!openMenuFor && !openPostMenuFor) return;
    function handlePointerDown(e: MouseEvent) {
      if (!(e.target as Element).closest?.(".comment-menu")) {
        setOpenMenuFor(null);
        setOpenPostMenuFor(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenMenuFor(null);
        setOpenPostMenuFor(null);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuFor, openPostMenuFor]);

  useEffect(() => {
    if (aboutAccountId) aboutDialog.current?.showModal();
    else aboutDialog.current?.close();
  }, [aboutAccountId]);

  // Busca sob demanda (ao abrir o cartão/painel), com cache simples em
  // memória — não faz sentido buscar de novo se o visitante passar o mouse
  // no mesmo autor de novo.
  async function ensureAccountInfo(authorId: string) {
    if (accountInfo[authorId] || accountInfoLoading[authorId]) return;
    setAccountInfoLoading((current) => ({ ...current, [authorId]: true }));
    try {
      const info = await api(`/community/users/${encodeURIComponent(authorId)}`);
      setAccountInfo((current) => ({ ...current, [authorId]: info }));
    } catch {
      // Silencioso: o cartão/painel ainda funciona sem seguidores/data — só
      // não é o fim do mundo perder essa informação secundária.
    } finally {
      setAccountInfoLoading((current) => ({ ...current, [authorId]: false }));
    }
  }

  function openHoverCard(postId: string, authorId: string) {
    if (hoverHideTimer.current) {
      window.clearTimeout(hoverHideTimer.current);
      hoverHideTimer.current = null;
    }
    setHoverPostId(postId);
    void ensureAccountInfo(authorId);
  }
  function scheduleHoverClose() {
    hoverHideTimer.current = window.setTimeout(() => setHoverPostId(null), 150);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await api("/community/state");
        if (!cancelled) {
          const comments: Record<string, FeedComment[]> = {};
          for (const postId of Object.keys(loaded.comments))
            comments[postId] = loaded.comments[postId].map(toFeedComment);
          setState({ ...loaded, comments });
        }
      } catch {
        if (!cancelled)
          notify("Não foi possível carregar suas interações da comunidade.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await api("/community/feed");
        if (!cancelled) setPosts(loaded.posts);
      } catch {
        if (!cancelled) notify("Não foi possível carregar o feed da comunidade.");
      } finally {
        if (!cancelled) setPostsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Comentário oculto por denúncia (ver hiddenCommentIds) ou de alguém
  // bloqueado (ver blockedAuthorIds) simplesmente não entra na lista — some
  // do feed de quem bloqueou/da ocultação automática sem precisar de nenhum
  // estado "escondido" na renderização em si.
  function mergedComments(postId: string): FeedComment[] {
    return (state.comments[postId] || []).filter(
      (comment) =>
        !state.hiddenCommentIds.includes(comment.id) &&
        !state.blockedAuthorIds.includes(comment.author.id),
    );
  }

  // Curtir/salvar liga e desliga no mesmo POST (ver toggleRoute em
  // server/community.mjs) — atualiza a tela na hora e desfaz se o servidor
  // recusar, em vez de esperar a resposta pra refletir o clique.
  async function toggleRemote(
    path: string,
    id: string,
    key:
      | "likedPostIds"
      | "savedPostIds"
      | "likedItemIds"
      | "savedItemIds"
      | "likedCommentIds"
      | "savedCommentIds",
  ) {
    const current = state[key];
    const wasActive = current.includes(id);
    const next = wasActive ? current.filter((value) => value !== id) : [...current, id];
    setState((prev) => ({ ...prev, [key]: next }));
    try {
      await api(path, "POST");
    } catch {
      setState((prev) => ({ ...prev, [key]: current }));
      notify("Não foi possível salvar. Tente novamente.");
    }
  }

  function toggleLikePost(postId: string) {
    void toggleRemote(`/community/posts/${encodeURIComponent(postId)}/like`, postId, "likedPostIds");
  }

  function toggleSavePost(postId: string, collectionName: string) {
    const wasSaved = state.savedPostIds.includes(postId);
    notify(
      wasSaved
        ? "Removido das suas coleções."
        : `"${collectionName}" adicionada às suas coleções.`,
    );
    void toggleRemote(`/community/posts/${encodeURIComponent(postId)}/save`, postId, "savedPostIds");
  }

  function sharePost(postId: string) {
    void navigator.clipboard?.writeText(`https://linkable.app/c/${postId}`);
    notify("Link copiado.");
  }

  async function addComment(postId: string) {
    const text = (drafts[postId] || "").trim();
    if (!text || sendingComment === postId) return;
    setSendingComment(postId);
    try {
      const created = await api(`/community/posts/${encodeURIComponent(postId)}/comments`, "POST", {
        text,
      });
      setState((prev) => ({
        ...prev,
        comments: {
          ...prev.comments,
          [postId]: [...(prev.comments[postId] || []), toFeedComment(created)],
        },
      }));
      setDrafts((current) => ({ ...current, [postId]: "" }));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível enviar o comentário.");
    } finally {
      setSendingComment(null);
    }
  }

  function toggleLikeComment(commentId: string) {
    void toggleRemote(`/community/comments/${encodeURIComponent(commentId)}/like`, commentId, "likedCommentIds");
  }

  function toggleSaveComment(commentId: string) {
    const wasSaved = state.savedCommentIds.includes(commentId);
    notify(wasSaved ? "Comentário removido dos salvos." : "Comentário salvo.");
    void toggleRemote(`/community/comments/${encodeURIComponent(commentId)}/save`, commentId, "savedCommentIds");
  }

  function shareComment(postId: string, commentId: string) {
    void navigator.clipboard?.writeText(`https://linkable.app/c/${postId}#${commentId}`);
    notify("Link copiado.");
  }

  async function reportComment(commentId: string) {
    if (state.reportedCommentIds.includes(commentId)) return;
    setState((prev) => ({
      ...prev,
      reportedCommentIds: [...prev.reportedCommentIds, commentId],
    }));
    try {
      await api(`/community/comments/${encodeURIComponent(commentId)}/report`, "POST");
      notify("Comentário denunciado. Obrigado por ajudar a manter a comunidade segura.");
    } catch (error) {
      setState((prev) => ({
        ...prev,
        reportedCommentIds: prev.reportedCommentIds.filter((id) => id !== commentId),
      }));
      notify(error instanceof Error ? error.message : "Não foi possível denunciar o comentário.");
    }
  }

  // Bloquear soma/remove o autor de blockedAuthorIds, que já filtra tanto as
  // publicações dele (ver visiblePosts) quanto os comentários (ver
  // mergedComments) — não precisa de mais nada pra sumir do feed (só pra
  // quem bloqueou; os outros continuam vendo normalmente).
  async function blockAuthor(authorId: string, label: string) {
    const wasBlocked = state.blockedAuthorIds.includes(authorId);
    setState((prev) => ({
      ...prev,
      blockedAuthorIds: wasBlocked
        ? prev.blockedAuthorIds.filter((id) => id !== authorId)
        : [...prev.blockedAuthorIds, authorId],
    }));
    try {
      await api(`/community/users/${encodeURIComponent(authorId)}/block`, "POST");
      notify(
        wasBlocked
          ? `Você deixou de bloquear @${label}.`
          : `Você bloqueou @${label}. As publicações e comentários dessa pessoa não vão mais aparecer pra você.`,
      );
    } catch (error) {
      setState((prev) => ({
        ...prev,
        blockedAuthorIds: wasBlocked
          ? [...prev.blockedAuthorIds, authorId]
          : prev.blockedAuthorIds.filter((id) => id !== authorId),
      }));
      notify(error instanceof Error ? error.message : "Não foi possível atualizar o bloqueio.");
    }
  }

  // "Seguir" é só informativo (não muda o feed — ele já mostra todo mundo),
  // então o único efeito colateral é a contagem de seguidores mostrada no
  // cartão de perfil/painel "Sobre esta conta", ajustada aqui de forma
  // otimista e desfeita se a chamada falhar.
  async function toggleFollow(authorId: string, label: string) {
    const wasFollowing = state.followedAuthorIds.includes(authorId);
    const delta = wasFollowing ? -1 : 1;
    setState((prev) => ({
      ...prev,
      followedAuthorIds: wasFollowing
        ? prev.followedAuthorIds.filter((id) => id !== authorId)
        : [...prev.followedAuthorIds, authorId],
    }));
    setAccountInfo((prev) =>
      prev[authorId]
        ? { ...prev, [authorId]: { ...prev[authorId], followerCount: Math.max(0, prev[authorId].followerCount + delta) } }
        : prev,
    );
    try {
      await api(`/community/users/${encodeURIComponent(authorId)}/follow`, "POST");
    } catch (error) {
      setState((prev) => ({
        ...prev,
        followedAuthorIds: wasFollowing
          ? [...prev.followedAuthorIds, authorId]
          : prev.followedAuthorIds.filter((id) => id !== authorId),
      }));
      setAccountInfo((prev) =>
        prev[authorId]
          ? { ...prev, [authorId]: { ...prev[authorId], followerCount: Math.max(0, prev[authorId].followerCount - delta) } }
          : prev,
      );
      notify(error instanceof Error ? error.message : `Não foi possível atualizar @${label}.`);
    }
  }

  async function reportPost(postId: string) {
    if (state.reportedPostIds.includes(postId)) return;
    setState((prev) => ({ ...prev, reportedPostIds: [...prev.reportedPostIds, postId] }));
    try {
      await api(`/community/posts/${encodeURIComponent(postId)}/report`, "POST");
      notify("Publicação denunciada. Obrigado por ajudar a manter a comunidade segura.");
    } catch (error) {
      setState((prev) => ({
        ...prev,
        reportedPostIds: prev.reportedPostIds.filter((id) => id !== postId),
      }));
      notify(error instanceof Error ? error.message : "Não foi possível denunciar a publicação.");
    }
  }

  async function deleteComment(postId: string, commentId: string) {
    const previous = state.comments[postId] || [];
    setState((prev) => ({
      ...prev,
      comments: { ...prev.comments, [postId]: previous.filter((c) => c.id !== commentId) },
    }));
    try {
      await api(`/community/comments/${encodeURIComponent(commentId)}`, "DELETE");
    } catch (error) {
      setState((prev) => ({ ...prev, comments: { ...prev.comments, [postId]: previous } }));
      notify(error instanceof Error ? error.message : "Não foi possível excluir o comentário.");
    }
  }

  // "Responder" não cria uma resposta aninhada (o feed é uma lista só) — só
  // preenche o campo de comentário com "@usuário " e foca nele, do jeito mais
  // simples que já deixa claro pra quem a resposta é.
  function replyToComment(postId: string, username: string) {
    setDrafts((current) => ({ ...current, [postId]: `@${username} ` }));
    commentInputs.current[postId]?.focus();
  }

  // Publicação oculta por denúncia (ver hiddenPostIds) ou de alguém
  // bloqueado (ver blockedAuthorIds) simplesmente não entra no feed.
  const visiblePosts = posts.filter(
    (post) => !state.blockedAuthorIds.includes(post.user.id) && !state.hiddenPostIds.includes(post.id),
  );
  const savedPosts = visiblePosts.filter((post) => state.savedPostIds.includes(post.id));
  const postsToShow = feedTab === "saved" ? savedPosts : visiblePosts;
  const aboutAuthor = aboutAccountId
    ? (posts.find((post) => post.user.id === aboutAccountId)?.user ?? null)
    : null;
  const aboutInfo = aboutAccountId ? accountInfo[aboutAccountId] : undefined;

  return (
    <div className="community-feed">
      <div className="feed-subtabs" role="tablist" aria-label="Comunidade">
        <button
          type="button"
          role="tab"
          aria-selected={feedTab === "feed"}
          className={feedTab === "feed" ? "active" : undefined}
          onClick={() => setFeedTab("feed")}
        >
          Feed
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={feedTab === "saved"}
          className={feedTab === "saved" ? "active" : undefined}
          onClick={() => setFeedTab("saved")}
        >
          Coleções salvas
        </button>
      </div>
      {postsLoading ? (
        <p className="community-empty" aria-busy="true">
          Carregando…
        </p>
      ) : !postsToShow.length ? (
        <p className="community-empty">
          {feedTab === "saved"
            ? 'Você ainda não salvou nenhuma coleção. Toque em "Salvar" numa publicação do feed pra guardá-la aqui.'
            : "Ninguém publicou uma coleção pública ainda. Marque uma das suas como pública para ser a primeira a aparecer aqui."}
        </p>
      ) : (
        postsToShow.map((post) => {
        const liked = state.likedPostIds.includes(post.id);
        const saved = state.savedPostIds.includes(post.id);
        const following = state.followedAuthorIds.includes(post.user.id);
        const postReported = state.reportedPostIds.includes(post.id);
        const postComments = mergedComments(post.id);
        return (
          <article className="feed-post" key={post.id}>
            <header className="feed-post-header">
              <div
                className="feed-author"
                onMouseEnter={() => openHoverCard(post.id, post.user.id)}
                onMouseLeave={scheduleHoverClose}
              >
                <a className="feed-author-link" href={publicProfileHref(post.user)}>
                  <Avatar author={post.user} />
                  <div className="feed-post-meta">
                    <strong>{post.user.name}</strong>
                    <span className="feed-post-sub">
                      @{post.user.username} · {formatRelativeTime(post.postedAt)}
                    </span>
                  </div>
                </a>
                {hoverPostId === post.id && (
                  <HoverCard
                    author={post.user}
                    info={accountInfo[post.user.id]}
                    loading={Boolean(accountInfoLoading[post.user.id])}
                    isFollowing={following}
                    onToggleFollow={() =>
                      void toggleFollow(post.user.id, post.user.username || post.user.name)
                    }
                    onMouseEnter={() => openHoverCard(post.id, post.user.id)}
                    onMouseLeave={scheduleHoverClose}
                  />
                )}
              </div>
              <div className="comment-menu">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={openPostMenuFor === post.id}
                  aria-label="Mais opções da publicação"
                  onClick={() =>
                    setOpenPostMenuFor((current) => (current === post.id ? null : post.id))
                  }
                >
                  <MoreVertical size={16} />
                </button>
                {openPostMenuFor === post.id && (
                  <div className="comment-menu-panel" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-danger"
                      disabled={postReported}
                      onClick={() => {
                        setOpenPostMenuFor(null);
                        void reportPost(post.id);
                      }}
                    >
                      <Flag size={14} />
                      {postReported ? "Denunciado" : "Denunciar"}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenPostMenuFor(null);
                        void toggleFollow(post.user.id, post.user.username || post.user.name);
                      }}
                    >
                      {following ? <UserMinus size={14} /> : <UserPlus size={14} />}
                      {following ? "Deixar de seguir" : "Seguir"}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenPostMenuFor(null);
                        setAboutAccountId(post.user.id);
                        void ensureAccountInfo(post.user.id);
                      }}
                    >
                      <Info size={14} />
                      Sobre esta conta
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenPostMenuFor(null);
                        sharePost(post.id);
                      }}
                    >
                      <LinkIcon size={14} />
                      Copiar link
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-danger"
                      onClick={() => {
                        setOpenPostMenuFor(null);
                        void blockAuthor(post.user.id, post.user.username || post.user.name);
                      }}
                    >
                      <UserX size={14} />
                      Bloquear
                    </button>
                  </div>
                )}
              </div>
            </header>
            <div className="feed-post-body">
              <CollectionRow
                collection={post.collection}
                readOnly
                toolbarsEnabled={false}
                pageSize={5}
                likedIds={state.likedItemIds}
                bookmarkedIds={state.savedItemIds}
                edit={noop}
                remove={noop}
                add={noop}
                editBookmark={noop}
                removeBookmark={noop}
                openBookmark={noop}
                toggleLiked={(bookmark: Bookmark) =>
                  toggleRemote(`/community/items/${encodeURIComponent(bookmark.id)}/like`, bookmark.id, "likedItemIds")
                }
                toggleBookmarked={(bookmark: Bookmark) =>
                  toggleRemote(`/community/items/${encodeURIComponent(bookmark.id)}/save`, bookmark.id, "savedItemIds")
                }
                shareBookmark={(bookmark: Bookmark) => {
                  void navigator.clipboard?.writeText(bookmark.url);
                  notify("Link copiado.");
                }}
                toggleBehavior={noop}
                createGroup={async () => null}
                moveToGroup={noopAsync}
                reorderBookmarks={noopAsync}
                renameGroup={noopAsync}
                deleteGroup={noopAsync}
                sectionsBulkAction={null}
                dragHandle={dragHandleStub}
              />
            </div>
            <div className="feed-post-actions">
              <button
                type="button"
                className={liked ? "active" : ""}
                aria-pressed={liked}
                onClick={() => toggleLikePost(post.id)}
              >
                <Heart size={16} />
                {post.likes + (liked ? 1 : 0)}
              </button>
              <button
                type="button"
                aria-expanded={openComments === post.id}
                onClick={() =>
                  setOpenComments((current) => (current === post.id ? null : post.id))
                }
              >
                <MessageCircle size={16} />
                {postComments.length}
              </button>
              <button
                type="button"
                className={saved ? "active" : ""}
                aria-pressed={saved}
                onClick={() => toggleSavePost(post.id, post.collection.name)}
              >
                <BookmarkIcon size={16} />
                {saved ? "Salvo" : "Salvar"}
              </button>
              <button type="button" onClick={() => sharePost(post.id)}>
                <Share2 size={16} />
                Compartilhar
              </button>
            </div>
            {openComments === post.id && (
              <div className="feed-comments">
                {postComments.map((comment) => {
                  const commentLiked = state.likedCommentIds.includes(comment.id);
                  const commentSaved = state.savedCommentIds.includes(comment.id);
                  const isMine = comment.author.id === me.id;
                  const isReported = state.reportedCommentIds.includes(comment.id);
                  return (
                    <div className="feed-comment" key={comment.id}>
                      <Avatar author={comment.author} small />
                      <div className="feed-comment-body">
                        <div className="feed-comment-head">
                          <a className="feed-comment-author-link" href={publicProfileHref(comment.author)}>
                            <strong>{comment.author.name}</strong>
                            <span className="feed-post-sub">@{comment.author.username}</span>
                          </a>
                          <span className="feed-post-sub">· {comment.postedAt}</span>
                          <div className="comment-menu">
                            <button
                              type="button"
                              aria-haspopup="menu"
                              aria-expanded={openMenuFor === comment.id}
                              aria-label="Mais opções do comentário"
                              onClick={() =>
                                setOpenMenuFor((current) => (current === comment.id ? null : comment.id))
                              }
                            >
                              <MoreVertical size={14} />
                            </button>
                            {openMenuFor === comment.id && (
                              <div className="comment-menu-panel" role="menu">
                                {isMine ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="menu-danger"
                                    onClick={() => {
                                      setOpenMenuFor(null);
                                      void deleteComment(post.id, comment.id);
                                    }}
                                  >
                                    <Trash2 size={14} />
                                    Excluir
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      disabled={isReported}
                                      onClick={() => {
                                        setOpenMenuFor(null);
                                        void reportComment(comment.id);
                                      }}
                                    >
                                      <Flag size={14} />
                                      {isReported ? "Denunciado" : "Denunciar"}
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="menu-danger"
                                      onClick={() => {
                                        setOpenMenuFor(null);
                                        void blockAuthor(
                                          comment.author.id,
                                          comment.author.username || comment.author.name,
                                        );
                                      }}
                                    >
                                      <UserX size={14} />
                                      Bloquear
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <p>{comment.text}</p>
                        <div className="feed-comment-actions">
                          <button
                            type="button"
                            onClick={() => replyToComment(post.id, comment.author.username)}
                          >
                            <Reply size={14} />
                            Responder
                          </button>
                          <button
                            type="button"
                            className={commentLiked ? "active" : ""}
                            aria-pressed={commentLiked}
                            onClick={() => toggleLikeComment(comment.id)}
                          >
                            <Heart size={14} />
                            {comment.likes + (commentLiked ? 1 : 0)}
                          </button>
                          <button
                            type="button"
                            className={commentSaved ? "active" : ""}
                            aria-pressed={commentSaved}
                            onClick={() => toggleSaveComment(comment.id)}
                          >
                            <BookmarkIcon size={14} />
                          </button>
                          <button type="button" onClick={() => shareComment(post.id, comment.id)}>
                            <Share2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void addComment(post.id);
                  }}
                >
                  <Avatar author={me} small />
                  <input
                    ref={(el) => {
                      commentInputs.current[post.id] = el;
                    }}
                    value={drafts[post.id] || ""}
                    onChange={(e) =>
                      setDrafts((current) => ({ ...current, [post.id]: e.target.value }))
                    }
                    placeholder="Adicionar um comentário..."
                    maxLength={500}
                  />
                  <button type="submit" className="primary" disabled={sendingComment === post.id}>
                    Enviar
                  </button>
                </form>
              </div>
            )}
          </article>
        );
        })
      )}
      <dialog ref={aboutDialog} onClose={() => setAboutAccountId(null)}>
        {aboutAuthor && (
          <div className="modal-content">
            <div className="modal-heading">
              <h2>Sobre esta conta</h2>
              <button
                className="icon-button"
                type="button"
                aria-label="Fechar"
                onClick={() => setAboutAccountId(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="about-account">
              <Avatar author={aboutAuthor} />
              <div className="feed-post-meta">
                <strong>{aboutAuthor.name}</strong>
                <span className="feed-post-sub">@{aboutAuthor.username}</span>
              </div>
            </div>
            <ul className="about-account-facts">
              <li>
                <span>Publicações no Linkable</span>
                <strong>{aboutInfo?.postCount ?? 0}</strong>
              </li>
              <li>
                <span>Seguidores</span>
                <strong>{aboutInfo?.followerCount ?? 0}</strong>
              </li>
              <li>
                <span>Conta desde</span>
                <strong>
                  {aboutInfo?.memberSince
                    ? new Date(aboutInfo.memberSince).toLocaleDateString("pt-BR", {
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
