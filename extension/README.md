# Like My Links — Salvar (extensão, Marco 1)

Extensão de navegador (Manifest V3) que salva a página/post atual como favorito
no Like My Links, com miniatura (via `og:image`) e descrição, direto do navegador —
sem precisar copiar link e colar no app.

## Como carregar (modo desenvolvedor)

1. Rode o Like My Links normalmente (`npm run dev`, acessível em `http://localhost:3000`)
   e faça login no navegador que você vai usar para testar a extensão.
2. Abra `chrome://extensions` (ou `edge://extensions`), ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione esta pasta (`extension/`).
4. O ícone do Like My Links aparece na barra de extensões.

## Como usar

- **Clique no ícone da extensão** → mostra um preview (ícone, nome, descrição)
  da página atual, editável, com a coleção e a seção → **Salvar no Like My Links**.
  Nome e descrição vêm do mesmo `POST /api/metadata` usado pela barra de busca
  do site e pelo menu de contexto (ver abaixo) — inclusive já prioriza a
  imagem do conteúdo específico (`og:image`) sobre o favicon do site quando a
  página não é a home. A imagem ainda passa por um segundo reforço, lida
  direto da aba já aberta no navegador (ver "Como funciona"), pra funcionar
  também em sites que bloqueiam esse fetch quando ele vem do servidor. Trocar
  de coleção sempre limpa a seção selecionada, já que uma seção pertence a uma
  coleção só.
  - Os dois seletores têm uma opção **"+ Nova coleção…"**/**"+ Nova
    seção…"** que abre um campo de nome + botão "Criar" ali mesmo, sem sair
    do popup. A seção criada é sempre vinculada à coleção escolhida no
    momento — sem uma coleção de verdade selecionada (ex.: o criador de
    coleção ainda aberto, sem ter confirmado nada), a seção não é criada e o
    popup avisa em vez de falhar silenciosamente.
- **Botão direito em cima de um link (não em qualquer espaço da página)** →
  **Salvar no Like My Links** → salva direto na coleção (e na seção, se alguma
  estiver escolhida) configuradas no popup, sem abrir aba nem modal — só uma
  notificação do sistema confirmando "Salvo no Like My Links" (ou o erro, se algo
  falhar). A URL salva é a do link clicado, não a da página onde está o link.
  Antes de usar a seção lembrada, a extensão confirma que ela ainda existe e
  ainda pertence à coleção padrão atual — se a seção foi excluída ou a
  coleção padrão mudou nesse meio-tempo, salva direto na coleção em vez de
  falhar com um erro de "seção não encontrada".

Se a extensão não encontrar sessão logada, o popup mostra um botão para abrir
o Like My Links; pelo menu de contexto, se a sessão não estiver logada ou nenhuma
coleção padrão tiver sido escolhida ainda, a notificação avisa em vez de
salvar silenciosamente errado.

## Como funciona (sem precisar reescrever o backend)

- Nome e descrição vêm do mesmo endpoint usado pela barra de busca do site
  (`POST /api/metadata`), que busca a própria página e decide a melhor imagem
  — priorizando o `og:image`/`twitter:image` do conteúdo específico sobre o
  favicon do site quando a URL não é a home genérica (ver `server/metadata.mjs`).
  Sites que bloqueiam esse fetch de servidor sem login/JS (algumas redes
  sociais, ex: TikTok) podem não ter nome/descrição — nesse caso o popup mostra
  "prévia indisponível" (sem opção de salvar por ali) e o menu de contexto
  notifica o erro.
- **Só no popup**, e só quando o servidor NÃO conseguiu uma imagem de
  conteúdo (`usedContentImage: false` na resposta do `/api/metadata`), a
  imagem ganha um reforço: a extensão lê `og:image`/`twitter:image`/o `poster`
  de um `<video>` em reprodução direto do DOM da aba já carregada
  (`chrome.scripting.executeScript`, função `scrapeActiveImage` em
  `shared.js`) e, se achar algo, troca a imagem do `/api/metadata` por essa —
  funciona mesmo em sites que bloqueiam o fetch do servidor, porque o
  navegador já renderizou a página de verdade. Quando o servidor JÁ conseguiu
  a imagem de conteúdo, esse reforço é pulado de propósito: o fetch fresco do
  servidor pra URL atual é mais confiável que o DOM da aba, que pode estar com
  meta tags desatualizadas depois de uma navegação client-side dentro de uma
  SPA — foi exatamente isso que causava o avatar de canal do YouTube ficar
  "grudado" no anterior até um F5 na página. Essa imagem
  é resolvida com recorte quadrado centralizado (`crop: "cover"`, o mesmo usado
  pelo servidor para thumbnails de conteúdo), melhor pra capturas de vídeo/post
  do que o encolhimento simples usado em favicons. Se nem isso existir (nem
  poster, nem og:image/twitter:image), como último recurso ela desenha o frame
  atual de um `<video>` em reprodução num `<canvas>` e usa isso como imagem —
  só funciona se o vídeo já tiver dados carregados (senão sai um frame preto) e
  não tiver proteção CORS/DRM (nesse caso falha silenciosamente e mantém o que
  já veio do `/api/metadata`).
- Ela então chama a API que já existe: `GET /api/collections` (que já devolve
  as seções de cada coleção, dentro de `groups`, filtradas por
  `display === "section"` no próprio popup/background — o "tile", agrupamento
  manual do site, não é um destino válido aqui), `POST /api/collections` e
  `POST /api/groups` (essas duas pras opções "+ Nova coleção…"/"+ Nova
  seção…" do popup — a seção já nasce com `display: "section"` e sem nenhum
  favorito, igual o botão "Criar seção" do editor de coleção no site) e
  `POST /api/bookmarks`, passando o `groupId` da seção escolhida — o próprio
  servidor baixa e converte a imagem (`resolveImage`), igual já faz para o
  avatar.
- Autenticação: como `likemylinks_session` é um cookie `HttpOnly`, a extensão lê seu
  valor via `chrome.cookies.get` (permitido para extensões com
  `host_permissions` na origem) e o envia no header `X-LikeMyLinks-Session` — por
  isso o backend ganhou um pequeno ajuste (`server/auth.mjs` aceita esse header
  como alternativa ao cookie; `server/index.mjs` responde CORS para origens
  `chrome-extension://…`).

## Configuração (dev vs. produção)

Por padrão a extensão aponta para `http://localhost:3000` (`DEFAULT_BASE_URL`
em `shared.js`). Para apontar pra um domínio real depois de publicado, mude
essa constante (não há mais tela de configurações no popup).

## O que falta para o Marco 2

- Lembrar a última coleção por padrão já funciona; falta criar coleção nova
  sem sair do popup.
- Atalho de teclado para salvar sem usar o mouse.
