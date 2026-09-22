import type { Bookmark, Collection } from "./types";

// Dados fictícios só pra pré-visualizar o layout/comportamento do feed da aba
// Comunidade (ver Community.tsx) — apenas os USUÁRIOS são inventados. As
// coleções e favoritos usam o mesmo shape de Collection/Bookmark do resto do
// app, com URLs reais e favicons reais (serviço público de favicon do
// Google), pra que o CollectionRow renderize exatamente como renderiza uma
// coleção de verdade: mesma pílula, mesmo hover/prévia, mesmos links
// clicáveis — nada disso existe no banco ainda (sem tabela de posts/curtidas/
// comentários), só o card em si é 100% real.
export interface MockUser {
  id: string;
  name: string;
  username: string;
  color: string;
}

export interface MockComment {
  id: string;
  author: MockUser;
  postedAt: string;
  text: string;
  likes: number;
}

export interface MockPost {
  id: string;
  user: MockUser;
  postedAt: string;
  collection: Collection;
  likes: number;
  comments: MockComment[];
}

function favicon(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}

function bookmark(
  id: string,
  collectionId: string,
  name: string,
  domain: string,
  color: string,
): Bookmark {
  return {
    id,
    collectionId,
    groupId: null,
    name,
    url: `https://${domain}`,
    description: "",
    favicon: favicon(domain),
    color,
    isPublic: true,
    linkStatus: "ok",
  };
}

function collection(
  id: string,
  name: string,
  description: string,
  color: string,
  bookmarks: Bookmark[],
): Collection {
  return {
    id,
    name,
    description,
    color,
    isPublic: true,
    shape: "rounded",
    // "fixed" (não "expansive"): pílula de uma linha só com setas de
    // navegação — o mesmo visual padrão de "Suas coleções", em vez do modo
    // expandido (grade solta, sem paginação). Ver pageSize em Community.tsx.
    behavior: "fixed",
    order: 0,
    bookmarks,
    groups: [],
  };
}

const marina: MockUser = { id: "u1", name: "Marina Alves", username: "marina.alves", color: "#f2a5c4" };
const rafael: MockUser = { id: "u2", name: "Rafael Souza", username: "rafa.dev", color: "#8ecbf0" };
const juliana: MockUser = { id: "u3", name: "Juliana Costa", username: "ju.costa", color: "#f0c56a" };
const pedro: MockUser = { id: "u4", name: "Pedro Lima", username: "pedrolima", color: "#b9ee78" };

export const mockPosts: MockPost[] = [
  {
    id: "p1",
    user: marina,
    postedAt: "2 h",
    collection: collection(
      "mock-c1",
      "Inspirações de design",
      "Referências que guardo pra quando bater o bloqueio criativo.",
      "#f2a5c4",
      [
        bookmark("mock-b1", "mock-c1", "Dribbble", "dribbble.com", "#ea4c89"),
        bookmark("mock-b2", "mock-c1", "Behance", "behance.net", "#0057ff"),
        bookmark("mock-b3", "mock-c1", "Awwwards", "awwwards.com", "#e6b800"),
        bookmark("mock-b4", "mock-c1", "Figma Community", "figma.com", "#a259ff"),
        bookmark("mock-b5", "mock-c1", "Land-book", "land-book.com", "#2fbf71"),
        bookmark("mock-b6", "mock-c1", "Mobbin", "mobbin.com", "#ff6b6b"),
        bookmark("mock-b6b", "mock-c1", "Pinterest", "pinterest.com", "#e60023"),
        bookmark("mock-b6c", "mock-c1", "Coolors", "coolors.co", "#0f4c5c"),
      ],
    ),
    likes: 128,
    comments: [
      { id: "c1", author: rafael, postedAt: "1 h", text: "Salvei essa, obrigado por compartilhar!", likes: 4 },
      { id: "c2", author: pedro, postedAt: "40 min", text: "O Land-book é ótimo mesmo.", likes: 1 },
    ],
  },
  {
    id: "p2",
    user: rafael,
    postedAt: "5 h",
    collection: collection(
      "mock-c2",
      "Ferramentas para devs",
      "O essencial pra qualquer projeto novo.",
      "#8ecbf0",
      [
        bookmark("mock-b7", "mock-c2", "GitHub", "github.com", "#6e7681"),
        bookmark("mock-b8", "mock-c2", "Vercel", "vercel.com", "#000000"),
        bookmark("mock-b9", "mock-c2", "Railway", "railway.app", "#8b5cf6"),
        bookmark("mock-b10", "mock-c2", "Postman", "postman.com", "#ff6c37"),
        bookmark("mock-b11", "mock-c2", "Excalidraw", "excalidraw.com", "#5b57d1"),
      ],
    ),
    likes: 89,
    comments: [{ id: "c3", author: marina, postedAt: "3 h", text: "Excalidraw mudou minha vida, real.", likes: 7 }],
  },
  {
    id: "p3",
    user: juliana,
    postedAt: "1 dia",
    collection: collection(
      "mock-c3",
      "Receitas veganas",
      "Testadas e aprovadas aqui em casa.",
      "#f0c56a",
      [
        bookmark("mock-b12", "mock-c3", "Cookpad", "cookpad.com", "#f7941e"),
        bookmark("mock-b13", "mock-c3", "Panelinha", "panelinha.com.br", "#c0392b"),
        bookmark("mock-b14", "mock-c3", "Minimalist Baker", "minimalistbaker.com", "#8fb339"),
        bookmark("mock-b15", "mock-c3", "TudoGostoso", "tudogostoso.com.br", "#27ae60"),
      ],
    ),
    likes: 47,
    comments: [],
  },
  {
    id: "p4",
    user: pedro,
    postedAt: "3 dias",
    collection: collection(
      "mock-c4",
      "Filmes para maratonar",
      "",
      "#b9ee78",
      [
        bookmark("mock-b16", "mock-c4", "Letterboxd", "letterboxd.com", "#00d474"),
        bookmark("mock-b17", "mock-c4", "IMDb", "imdb.com", "#e2b616"),
        bookmark("mock-b18", "mock-c4", "Rotten Tomatoes", "rottentomatoes.com", "#fa320a"),
        bookmark("mock-b19", "mock-c4", "JustWatch", "justwatch.com", "#c9a300"),
      ],
    ),
    likes: 12,
    comments: [{ id: "c4", author: juliana, postedAt: "2 dias", text: "Bota o Letterboxd que eu sigo você lá também.", likes: 2 }],
  },
  {
    id: "p5",
    user: marina,
    postedAt: "1 semana",
    collection: collection(
      "mock-c5",
      "Playlists de estudo",
      "Pra concentrar sem virar a cabeça toda hora.",
      "#f2a5c4",
      [
        bookmark("mock-b20", "mock-c5", "Spotify", "open.spotify.com", "#1db954"),
        bookmark("mock-b21", "mock-c5", "YouTube Music", "music.youtube.com", "#ff0000"),
        bookmark("mock-b22", "mock-c5", "Brain.fm", "brain.fm", "#3b82f6"),
        bookmark("mock-b23", "mock-c5", "Noisli", "noisli.com", "#f59e0b"),
      ],
    ),
    likes: 203,
    comments: [
      { id: "c5", author: pedro, postedAt: "5 dias", text: "Faltou lo-fi hip hop kkk", likes: 3 },
      { id: "c6", author: rafael, postedAt: "4 dias", text: "Adicionei todas, valeu!", likes: 1 },
    ],
  },
];

// Autor de cada publicação e quantas publicações cada um tem no feed —
// computado uma vez aqui (não em Community.tsx), porque tanto o feed quanto
// o cabeçalho do perfil público (App.tsx, ?perfil=<id>) precisam dos mesmos
// dados: mockPosts é uma constante fixa, nunca muda em tempo de execução.
export const authorById: Record<string, MockUser> = {};
export const postCountByAuthor: Record<string, number> = {};
for (const post of mockPosts) {
  authorById[post.user.id] = post.user;
  postCountByAuthor[post.user.id] = (postCountByAuthor[post.user.id] || 0) + 1;
}

// Coleções públicas de um autor fictício, pro cabeçalho do perfil público
// (App.tsx) mostrar algo real mesmo sem Owner de verdade no banco — são as
// mesmas coleções mockadas já exibidas no card da publicação, não dados
// inventados à parte.
export function mockCollectionsByAuthor(authorId: string): Collection[] {
  return mockPosts.filter((post) => post.user.id === authorId).map((post) => post.collection);
}
