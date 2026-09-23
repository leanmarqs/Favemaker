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

// Em vez de tentar listar toda proteção anti-bot que pode negar a
// requisição (lista sem fim: 401/403/429 de login ou rate limit, 202 do WAF
// do Dribbble, timeout porque o WAF simplesmente trava a conexão em vez de
// responder — foi isso, não um status, que fez o Stack Overflow parecer
// quebrado numa rodada e não na outra), o link só é marcado como "quebrado"
// quando o sinal é forte o bastante pra não ter outra explicação plausível:
// um status HTTP que sempre significa página/servidor com erro de verdade
// (nunca usado por bloqueio anti-bot de propósito), ou uma falha de rede que
// só acontece quando literalmente não há ninguém do outro lado. 503 é o mais
// arriscado da lista — Cloudflare já usou esse status pra própria página de
// desafio no passado — mas hoje isso é feito quase sempre com 403 (ver
// checkLink de dribbble.net/stackoverflow.com), então o risco de falso
// positivo é pequeno comparado ao valor de detectar uma manutenção real.
// Qualquer outro erro (timeout, TLS, redirecionamento demais, IP privado)
// vira "ok": o custo de assustar o dono de um link que está no ar é bem
// maior que o de deixar passar, por uma rodada, um link de fato morto — ele
// continua sendo checado de novo a cada 24h (ver LINK_RECHECK_AFTER_MS).
const BROKEN_STATUSES = new Set([404, 410, 500, 502, 503, 504]);
// ENOTFOUND: o domínio não resolve mais (site realmente não existe).
// ECONNREFUSED: a porta nem aceita conexão (não há servidor nenhum ali) —
// diferente de um timeout, que também acontece quando um WAF só demora ou
// trava de propósito pra devolver o desafio (ver comentário acima).
const BROKEN_NETWORK_CODES = new Set(["ENOTFOUND", "ECONNREFUSED"]);
export async function checkLink(url) {
  try {
    await safeFetch(url, 0, "Linkable-LinkChecker/1.0", true);
    return "ok";
  } catch (error) {
    if (error.status) return BROKEN_STATUSES.has(error.status) ? "broken" : "ok";
    return BROKEN_NETWORK_CODES.has(error.code) ? "broken" : "ok";
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
