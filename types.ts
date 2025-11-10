export interface Bookmark {
  id: string;
  url: string;
  name: string;
  description?: string;
  favicon: string;
  isPublic: boolean;
  color: string;
  createdAt: Date;
  lastClickedAt: Date;
  clickCount: number;
  relevanceScore: number;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  isPublic: boolean;
  color: string;
  createdAt: Date;
  bookmarks: Bookmark[];
}

export enum SortCriteria {
  AZ = 'A-Z',
  Quantity = 'Quantity',
  Date = 'Date',
  Relevance = 'Relevance',
}

export enum SortOrder {
  Asc = 'asc',
  Desc = 'desc',
}

export interface AIGeneratedSite {
    name: string;
    url: string;
    description: string;
}