export interface Account {
  id: string;
  name: string;
  displayName: string;
  username: string;
  email: string;
  avatar: string;
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
  isPublic: boolean;
  order?: number;
  createdAt?: string;
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
  bookmarks: Bookmark[];
  groups: BookmarkGroup[];
}
