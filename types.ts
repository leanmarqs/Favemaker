export interface Account {
  id: string;
  name: string;
  displayName: string;
  username: string;
  email: string;
  avatar: string;
  banner: string;
  hasPassword: boolean;
  googleLinked: boolean;
}
export interface Bookmark {
  id: string;
  collectionId: string;
  groupId?: string | null;
  name: string;
  url: string;
  description: string;
  favicon: string;
  color: string;
  // Um favorito não tem visibilidade própria: o servidor nunca guarda nem
  // devolve este campo (sempre herda o isPublic da coleção dona — ver
  // comentário no schema.prisma). Só existe aqui como opcional pro App.tsx
  // conseguir calculá-lo na hora (a partir da coleção) pro filtro global
  // "Públicos"/"Privados" em "Suas coleções".
  isPublic?: boolean;
  order?: number;
  // "unknown" (nunca verificado) | "ok" | "broken" — ver server/linkCheck.mjs.
  // Só afeta a aparência do ícone (decolorido quando "broken"), nunca some
  // nem bloqueia nada.
  linkStatus?: string;
  createdAt?: string;
  // Preenchido só na cópia de dentro de "Itens Salvos" (ver comentário de
  // Bookmark.savedFromId no schema.prisma): id do favorito ALHEIO original
  // que foi favoritado. É por ele (não pelo id da própria cópia) que a
  // bandeirinha de "Favoritar" continua acesa e que desfavoritar remove a
  // cópia de "Itens Salvos" em vez de criar uma marca separada.
  savedFromId?: string | null;
  // Só vêm preenchidos no feed da Comunidade (ver GET /api/community/feed em
  // server/community.mjs) — contagem de curtida/favoritado/compartilhamento
  // deste favorito específico (diferente de likes/saves/shares de FeedPost,
  // que são da publicação/coleção inteira). undefined em qualquer outro
  // contexto (ex.: "Suas coleções"), que nunca pediu essas contagens.
  likes?: number;
  saves?: number;
  shares?: number;
}
export interface BookmarkGroup {
  id: string;
  collectionId: string;
  name: string;
  color: string;
  description: string;
  showName: boolean;
  // null usa o formato da própria coleção — ver comentário no schema.prisma.
  shape?: string | null;
  // "tile": ícone único (App Library), criado ao arrastar um favorito sobre
  // outro. "section": divisória com os favoritos visíveis direto, criada ao
  // importar uma pasta aninhada — ver server/index.mjs (/api/import).
  display: string;
  // Visibilidade da própria seção/agrupamento — só some de verdade (perfil
  // público, feed da Comunidade) quando a coleção em volta também é pública;
  // ver comentário no schema.prisma.
  isPublic: boolean;
  // Só pra "tile": a seção onde o agrupamento vive (null/ausente = direto na
  // coleção) — ver comentário no schema.prisma.
  parentId?: string | null;
  bookmarks: Bookmark[];
}
export interface Collection {
  id: string;
  name: string;
  description: string;
  color: string;
  isPublic: boolean;
  shape?: string;
  behavior?: string;
  order?: number;
  // Preenchidos só na cópia criada ao "Salvar" a publicação alheia de outro
  // dono na Comunidade (ver comentário de Collection.savedFromAuthorId no
  // schema.prisma) — é o que faz "Suas coleções" mostrar "<nome> por
  // <autor>", com o autor linkando pro perfil público dele.
  savedFromAuthorId?: string | null;
  savedFromAuthorName?: string | null;
  bookmarks: Bookmark[];
  groups: BookmarkGroup[];
}
