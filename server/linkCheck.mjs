import { safeFetch } from "./metadata.mjs";

// Quantos favoritos verificar por rodada, de quanto em quanto tempo a rotina
// roda, e depois de quanto tempo um link já verificado volta a ficar "devido"
// pra verificar de novo. Números conservadores de propósito: isso roda sem o
// usuário pedir, então precisa ser educado com os sites de terceiros (nunca
// martela muitos de uma vez) e não pesar no servidor — checar tudo de uma
// coleção enorme na hora não é o objetivo, é ir cobrindo aos poucos.
export const LINK_CHECK_BATCH_SIZE = 20;
export const LINK_CHECK_INTERVAL_MS = 30 * 60 * 1000;
export const LINK_RECHECK_AFTER_MS = 24 * 60 * 60 * 1000;
// Entre uma checagem e outra dentro da mesma rodada — evita que a rotina em
// si pareça uma rajada de requisições saindo do mesmo servidor.
const DELAY_BETWEEN_CHECKS_MS = 400;

// Um link "quebrado" aqui é só "não respondeu 200 nas tentativas do
// safeFetch" — isso inclui de propósito casos que não significam
// necessariamente uma página morta (bloqueio por User-Agent, exigência de
// login, um 403 de anti-bot). Por isso o resultado só decolore o ícone (ver
// Sphere no App.tsx), nunca esconde ou apaga o favorito — é um sinal pro
// dono investigar, não uma verdade absoluta.
// Status que significam "o servidor está de pé e respondeu", só que negou
// essa requisição sem cookie/sessão de navegador de verdade — ex.: uma loja
// que sempre manda um visitante anônimo pra um fluxo de login antes de
// mostrar a página (foi exatamente isso que fez o link da Battle.net ser
// marcado como quebrado por engano). Diferente de um site fora do ar, isso
// não indica um link morto, então não deve decolorir o ícone.
const REACHABLE_BUT_GATED_STATUSES = new Set([401, 403, 429]);
export async function checkLink(url) {
  try {
    await safeFetch(url, 0, "Pinicon-LinkChecker/1.0", true);
    return "ok";
  } catch (error) {
    if (REACHABLE_BUT_GATED_STATUSES.has(error.status) || error.tooManyRedirects)
      return "ok";
    return "broken";
  }
}

async function pickBookmarksToCheck(prisma, limit) {
  const neverChecked = await prisma.bookmark.findMany({
    where: { linkCheckedAt: null },
    take: limit,
    select: { id: true, url: true },
  });
  if (neverChecked.length >= limit) return neverChecked;
  const cutoff = new Date(Date.now() - LINK_RECHECK_AFTER_MS);
  const stale = await prisma.bookmark.findMany({
    where: { linkCheckedAt: { lt: cutoff } },
    orderBy: { linkCheckedAt: "asc" },
    take: limit - neverChecked.length,
    select: { id: true, url: true },
  });
  return [...neverChecked, ...stale];
}

export async function runLinkCheckBatch(prisma) {
  const due = await pickBookmarksToCheck(prisma, LINK_CHECK_BATCH_SIZE);
  for (const bookmark of due) {
    const linkStatus = await checkLink(bookmark.url);
    await prisma.bookmark
      .update({
        where: { id: bookmark.id },
        data: { linkStatus, linkCheckedAt: new Date() },
      })
      // O favorito pode ter sido excluído entre a leitura e aqui — ignora.
      .catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_CHECKS_MS));
  }
  return due.length;
}

// Roda pela primeira vez pouco depois da subida (não na hora — dá espaço pro
// resto do boot) e depois se repete sozinha no intervalo configurado, pro
// resto da vida do processo. Uma rodada que falha (ex.: banco fora do ar por
// um instante) não impede a próxima.
export function scheduleLinkChecks(prisma) {
  const runSafely = () =>
    runLinkCheckBatch(prisma).catch((error) =>
      console.error("Falha na rotina de verificação de links:", error.message),
    );
  setTimeout(runSafely, 15000);
  setInterval(runSafely, LINK_CHECK_INTERVAL_MS);
}
