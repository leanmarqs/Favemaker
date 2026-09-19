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
  createdAt?: string;
}
export interface BookmarkGroup {
  id: string;
  collectionId: string;
  name: string;
  color: string;
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
  bookmarks: Bookmark[];
  groups: BookmarkGroup[];
}
