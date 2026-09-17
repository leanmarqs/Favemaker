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
  name: string;
  url: string;
  description: string;
  favicon: string;
  color: string;
  isPublic: boolean;
  createdAt?: string;
}
export interface Collection {
  id: string;
  name: string;
  description: string;
  color: string;
  isPublic: boolean;
  shape?: string;
  bookmarks: Bookmark[];
}
