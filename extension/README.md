# Pinicon — Salvar (extensão, Marco 1)

Extensão de navegador (Manifest V3) que salva a página/post atual como favorito
no Pinicon, com miniatura (via `og:image`) e descrição, direto do navegador —
sem precisar copiar link e colar no app.

## Como carregar (modo desenvolvedor)

1. Rode o Pinicon normalmente (`npm run dev`, acessível em `http://localhost:3000`)
   e faça login no navegador que você vai usar para testar a extensão.
2. Abra `chrome://extensions` (ou `edge://extensions`), ative o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione esta pasta (`extension/`).
4. O ícone do Pinicon aparece na barra de extensões.

## Como usar

- **Clique no ícone da extensão** → mostra um preview (ícone, nome, descrição)
  da página atual, editável, com a coleção → **Salvar no Pinicon**. O preview
  vem do mesmo `POST /api/metadata` usado pela barra de busca do site e pelo
  menu de contexto (ver abaixo) — inclusive já prioriza a imagem do conteúdo
  específico (`og:image`) sobre o favicon do site quando a página não é a home.
- **Botão direito em cima de um link (não em qualquer espaço da página)** →
  **Salvar no Pinicon** → salva direto na coleção configurada no popup
  (a última escolhida ali), sem abrir aba nem modal — só uma notificação do
  sistema confirmando "Salvo no Pinicon" (ou o erro, se algo falhar). A URL
  salva é a do link clicado, não a da página onde está o link.

Se a extensão não encontrar sessão logada, o popup mostra um botão para abrir
o Pinicon; pelo menu de contexto, se a sessão não estiver logada ou nenhuma
coleção padrão tiver sido escolhida ainda, a notificação avisa em vez de
salvar silenciosamente errado.

## Como funciona (sem precisar reescrever o backend)

- Nome, descrição e imagem vêm sempre do mesmo endpoint usado pela barra de
  busca do site (`POST /api/metadata`), que busca a própria página e decide a
  melhor imagem — priorizando o `og:image`/`twitter:image` do conteúdo
  específico sobre o favicon do site quando a URL não é a home genérica (ver
  `server/metadata.mjs`). A extensão não lê mais o DOM da aba diretamente;
  isso significa que sites que bloqueiam requisições de servidor sem login/JS
  (algumas redes sociais) podem falhar ao capturar — nesse caso o popup mostra
  "prévia indisponível" (sem opção de salvar por ali) e o menu de contexto
  notifica o erro.
- Ela então chama a API que já existe: `GET /api/collections` e
  `POST /api/bookmarks` — o próprio servidor baixa e converte a imagem
  (`resolveImage`), igual já faz para o avatar.
- Autenticação: como `pinicon_session` é um cookie `HttpOnly`, a extensão lê seu
  valor via `chrome.cookies.get` (permitido para extensões com
  `host_permissions` na origem) e o envia no header `X-Pinicon-Session` — por
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
