import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../server/auth.mjs';

// Uso: node scripts/seed-community.mjs
// Cria algumas contas de demonstração (email + senha), cada uma com coleções
// públicas (aparecem no feed da Comunidade) e uma coleção privada (não
// aparece), pra testar o recurso sem depender de contas reais.
const DEMO_PASSWORD = 'Demo1234!';
const db = new PrismaClient();

const favicon = (domain) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;

const users = [
  {
    email: 'marina.duarte@example.com',
    username: 'marina.design',
    displayName: 'Marina Duarte',
    publishedDaysAgo: 0,
    publicCollections: [
      ['Design & UI', '#f2a5c4', 'Ferramentas e referências de design de interface.', [
        ['Figma', 'figma.com'], ['Dribbble', 'dribbble.com'], ['Behance', 'behance.net'],
        ['Coolors', 'coolors.co'], ['Fontshare', 'fontshare.com'], ['Unsplash', 'unsplash.com'],
      ]],
      ['Inspiração Visual', '#ae9cf4', 'Onde busco referência quando bate o bloqueio criativo.', [
        ['Pinterest', 'pinterest.com'], ['Awwwards', 'awwwards.com'], ['Are.na', 'are.na'], ['Muzli', 'muz.li'],
      ]],
    ],
    privateCollection: ['Referências pessoais', '#8b5cf6', 'Rascunhos e links que ainda não quero mostrar.', [
      ['Notion', 'notion.so'], ['Google Drive', 'drive.google.com'],
    ]],
  },
  {
    email: 'carlos.nogueira@example.com',
    username: 'carlos.games',
    displayName: 'Carlos Nogueira',
    publishedDaysAgo: 1,
    publicCollections: [
      ['Jogos Indie', '#7cc9ec', 'Lojas onde encontro os melhores jogos independentes.', [
        ['itch.io', 'itch.io'], ['GOG', 'gog.com'], ['Steam', 'store.steampowered.com'], ['Epic Games', 'store.epicgames.com'],
      ]],
      ['Streaming', '#edb677', 'Onde assisto e transmito.', [
        ['Twitch', 'twitch.tv'], ['YouTube', 'youtube.com'], ['Crunchyroll', 'crunchyroll.com'],
      ]],
    ],
    privateCollection: ['Contas e assinaturas', '#8b5cf6', 'Links de conta, não pra compartilhar.', [
      ['PlayStation', 'playstation.com'], ['Xbox', 'xbox.com'],
    ]],
  },
  {
    email: 'ana.beatriz@example.com',
    username: 'ana.dev',
    displayName: 'Ana Beatriz',
    publishedDaysAgo: 2,
    publicCollections: [
      ['Dev Resources', '#8b5cf6', 'Documentação e ferramentas que uso todo dia.', [
        ['GitHub', 'github.com'], ['MDN Web Docs', 'developer.mozilla.org'], ['Stack Overflow', 'stackoverflow.com'],
        ['Vite', 'vite.dev'], ['React', 'react.dev'],
      ]],
      ['Aprendizado', '#7cc9ec', 'Cursos e conteúdo pra continuar estudando.', [
        ['freeCodeCamp', 'freecodecamp.org'], ['Coursera', 'coursera.org'], ['Rocketseat', 'rocketseat.com.br'],
      ]],
    ],
    privateCollection: ['Projetos privados', '#8b5cf6', 'Painéis dos projetos em andamento.', [
      ['Vercel', 'vercel.com'], ['Railway', 'railway.app'],
    ]],
  },
  {
    email: 'pedro.lima@example.com',
    username: 'pedro.leitor',
    displayName: 'Pedro Lima',
    publishedDaysAgo: 3,
    publicCollections: [
      ['Leitura e Notícias', '#edb677', 'Onde acompanho notícias de tecnologia.', [
        ['Medium', 'medium.com'], ['Hacker News', 'news.ycombinator.com'], ['TechCrunch', 'techcrunch.com'], ['The Verge', 'theverge.com'],
      ]],
      ['Produtividade', '#ae9cf4', 'Apps que uso pra organizar o dia a dia.', [
        ['Notion', 'notion.so'], ['Todoist', 'todoist.com'], ['Google Calendar', 'calendar.google.com'],
      ]],
    ],
    privateCollection: ['Financeiro', '#8b5cf6', 'Bancos e apps financeiros — só pra mim.', [
      ['Nubank', 'nubank.com.br'], ['Itaú', 'itau.com.br'],
    ]],
  },
];

async function ensureCollection(ownerId, [name, color, description, sites], { isPublic, publishedAt }) {
  const collection =
    (await db.collection.findFirst({ where: { ownerId, name } })) ||
    (await db.collection.create({ data: { ownerId, name, color, description, isPublic, publishedAt } }));
  for (let i = 0; i < sites.length; i++) {
    const [siteName, domain] = sites[i];
    const url = `https://${domain}/`;
    if (await db.bookmark.findFirst({ where: { collectionId: collection.id, url } })) continue;
    await db.bookmark.create({
      data: {
        collectionId: collection.id,
        name: siteName,
        url,
        description: `Acesse ${siteName}.`,
        favicon: favicon(domain),
        color,
        order: i,
        linkStatus: 'ok',
        createdAt: new Date(Date.now() + i),
      },
    });
  }
  return collection;
}

try {
  for (const user of users) {
    const owner =
      (await db.owner.findUnique({ where: { email: user.email } })) ||
      (await db.owner.create({
        data: {
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          passwordHash: await hashPassword(DEMO_PASSWORD),
          status: 'ACTIVE',
          tokenHash: randomBytes(32).toString('hex'),
        },
      }));
    const publishedAt = new Date(Date.now() - user.publishedDaysAgo * 86400000);
    for (const group of user.publicCollections)
      await ensureCollection(owner.id, group, { isPublic: true, publishedAt });
    await ensureCollection(owner.id, user.privateCollection, { isPublic: false, publishedAt: null });
    console.log(`${user.displayName} (${user.email}) pronto.`);
  }
  console.log(`\nSenha de todas as contas de demonstração: ${DEMO_PASSWORD}`);
} finally {
  await db.$disconnect();
}
