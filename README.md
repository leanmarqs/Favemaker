# Pinicon

Um bookmark online em português do Brasil. Organize sites em coleções, personalize seus ícones e compartilhe apenas o conteúdo que escolher.

## Tecnologias

React 19, TypeScript, Vite, Tailwind CSS 4, Express 5, PostgreSQL e Prisma 6. Ícones da interface com Lucide; leitura de metadados com Cheerio e processamento de imagens com Sharp.

## Executar

Requisitos: Node.js 22.12+ e PostgreSQL. No PowerShell, use `npm.cmd` se a política local bloquear `npm.ps1`.

```sh
npm install
```

Copie `.env.example` para `.env` e ajuste `DATABASE_URL` com usuário, senha, host e banco **pinicon**. Para criar uma instância local com Docker:

```sh
docker compose up -d
npm run db:generate
npm run db:migrate
npm run dev
```

Abra http://localhost:3000. A API utiliza a porta 3001; o Vite encaminha `/api` automaticamente. Se já houver PostgreSQL na porta 5432, use esse servidor com suas credenciais ou ajuste a porta do Compose e a URL.

## Funcionalidades

- CRUD de coleções e favoritos, incluindo mover um favorito para outra coleção.
- Coleção obrigatória para todo favorito, com criação dentro do modal.
- Coleções em pílulas, até dez favoritos por página e setas de navegação. Em telas pequenas, a linha também permite rolagem horizontal.
- Ícones esféricos com a cor predominante do favicon e personalização manual.
- Busca de ícones declarados no HTML, Apple Touch Icons, manifesto e `/favicon.ico`, com resolução de caminhos relativos e redirecionamentos.
- Upload de PNG, JPEG, WebP, GIF ou ICO de até 2 MB e importação por URL. Imagens são convertidas para PNG e armazenadas no PostgreSQL. Sem ícone disponível, a inicial do site serve como alternativa.
- Temas claro e escuro, ordenação A–Z/Z–A e botão Filtrar desativado, reservado para implementação futura.
- Página pública em `/?perfil=ID`. O servidor exclui coleções privadas e favoritos privados da resposta pública.

## Identidade e privacidade

Cada navegador recebe uma sessão com token aleatório em cookie HttpOnly e SameSite. O banco armazena apenas o hash do token. Alterações exigem que a sessão seja proprietária da coleção. Uma coleção privada permanece oculta mesmo quando contém favoritos marcados como públicos.

Esta versão não possui cadastro, login ou recuperação de conta: apagar o cookie perde o acesso ao espaço daquele navegador. Para uso entre dispositivos, adicione autenticação e recuperação de conta antes da publicação para usuários finais. Os dados antigos em `localStorage.bookmarkCollections` não são apagados, mas não são importados automaticamente.

As consultas de favicon bloqueiam IPs locais/privados, fixam o IP resolvido, verificam redirecionamentos e limitam tamanho e duração das respostas. Não usam proxies públicos nem enviam os links a serviços de IA. Sites que bloqueiam consultas automatizadas podem exigir envio manual do ícone.

## Produção

```sh
npm run db:generate
npm run db:migrate
npm run build
npm start
```

Use `NODE_ENV=production`, HTTPS e `DATABASE_URL` com credenciais próprias. O Express serve o frontend compilado e a API na mesma origem. A senha do Compose é exclusiva para desenvolvimento local.

## Validação

```sh
npm run build
npm test
```

Para incluir os testes de integração, configure `TEST_DATABASE_URL` apontando para um banco PostgreSQL isolado com as migrações aplicadas. Eles verificam CRUD, isolamento entre proprietários, coleção obrigatória, exclusão em cascata e privacidade hierárquica; os dados criados pelo teste são removidos ao terminar. Sem essa variável, apenas a integração é ignorada.

Documentação de referência: [Tailwind com Vite](https://tailwindcss.com/docs/installation/using-vite) e [Prisma Migrate 6](https://www.prisma.io/docs/orm/v6/prisma-migrate/getting-started).
