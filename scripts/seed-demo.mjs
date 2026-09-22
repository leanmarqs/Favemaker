import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { metadata, resolveImage } from '../server/metadata.mjs';

// Uso: node scripts/seed-demo.mjs ID_DO_PROPRIETARIO
// Adiciona exemplos sem apagar ou duplicar favoritos já existentes.
const ownerId = process.argv[2];
if (!ownerId) throw new Error('Informe o ID do proprietário que receberá os exemplos.');
const db = new PrismaClient();
const groups = [
  ['Streaming', '#ae9cf4', 'Filmes, séries, música e transmissões ao vivo.', [
    ['Netflix','netflix.com'],['YouTube','youtube.com'],['Prime Video','primevideo.com'],['Disney+','disneyplus.com'],['Apple TV','tv.apple.com'],['Twitch','twitch.tv'],['Spotify','spotify.com'],['Deezer','deezer.com'],['SoundCloud','soundcloud.com'],['Vimeo','vimeo.com'],['Crunchyroll','crunchyroll.com'],['Globoplay','globoplay.globo.com'],
  ]],
  ['Jogos', '#7cc9ec', 'Lojas, comunidades e notícias do mundo dos games.', [
    ['Steam','store.steampowered.com'],['Epic Games','store.epicgames.com'],['PlayStation','playstation.com'],['Xbox','xbox.com'],['Nintendo','nintendo.com'],['GOG','gog.com'],['itch.io','itch.io'],['Battle.net','battle.net'],['Riot Games','riotgames.com'],['Ubisoft','ubisoft.com'],['EA','ea.com'],['IGN','ign.com'],
  ]],
  ['Compras', '#edb677', 'Lojas e marketplaces para suas próximas compras.', [
    ['Amazon','amazon.com.br'],['Mercado Livre','mercadolivre.com.br'],['Shopee','shopee.com.br'],['AliExpress','aliexpress.com'],['eBay','ebay.com'],['Etsy','etsy.com'],['Magazine Luiza','magazineluiza.com.br'],['Casas Bahia','casasbahia.com.br'],['Nike','nike.com.br'],['Adidas','adidas.com.br'],['Apple','apple.com'],['Samsung','samsung.com'],
  ]],
  ['Social', '#f2a5c4', 'Redes sociais e comunidades para se conectar.', [
    ['Instagram','instagram.com'],['Facebook','facebook.com'],['LinkedIn','linkedin.com'],['Reddit','reddit.com'],['Pinterest','pinterest.com'],['TikTok','tiktok.com'],['Bluesky','bsky.app'],['Mastodon','mastodon.social'],['Discord','discord.com'],['Telegram','telegram.org'],['Tumblr','tumblr.com'],['Threads','threads.com'],
  ]],
  ['Desenvolvimento', '#8b5cf6', 'Ferramentas, documentação e comunidades de desenvolvimento.', [
    ['GitHub','github.com'],['GitLab','gitlab.com'],['Stack Overflow','stackoverflow.com'],['MDN Web Docs','developer.mozilla.org'],['Vite','vite.dev'],['React','react.dev'],['Tailwind CSS','tailwindcss.com'],['Prisma','prisma.io'],['PostgreSQL','postgresql.org'],['npm','npmjs.com'],['Vercel','vercel.com'],['Docker','docker.com'],
  ]],
];
try {
  if (!await db.owner.findUnique({ where: { id: ownerId } })) throw new Error('Proprietário não encontrado.');
  for (const [name,color,description,sites] of groups) {
    const collection = await db.collection.findFirst({ where: { ownerId,name } }) || await db.collection.create({ data: { ownerId,name,color,description,isPublic:false } });
    for (let start = 0; start < sites.length; start += 4) {
      await Promise.all(sites.slice(start,start+4).map(async ([name,domain], offset) => {
        const url = `https://${domain}/`;
        if (await db.bookmark.findFirst({ where: { collectionId:collection.id,url } })) return;
        let icon = await metadata(url);
        if (!icon.favicon) {
          try { icon = { ...icon,...await resolveImage(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`) }; } catch {}
        }
        await db.bookmark.create({ data: { collectionId:collection.id,name,url,description:`Acesse ${name}.`,favicon:icon.favicon,color:icon.color || color,createdAt:new Date(Date.now() + start + offset) } });
        console.log(`${collection.name}: ${name} — ${icon.favicon ? 'ícone salvo' : 'inicial como alternativa'}`);
      }));
    }
    console.log(`${name}: ${await db.bookmark.count({ where:{ collectionId:collection.id } })} favoritos.`);
  }
} finally { await db.$disconnect(); }
