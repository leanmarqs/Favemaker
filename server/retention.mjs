// Retenção de dados (LGPD, art. 15/16 — guardar só pelo tempo necessário):
// uma vez por dia apaga o que já não serve pra nada. Os prazos aqui precisam
// bater com os da Política de Privacidade (ver LegalDocs.tsx).
//
// - Eventos de login (IP e navegador): 180 dias — tempo suficiente pra
//   investigar um acesso suspeito, sem guardar histórico pra sempre.
// - Sessões expiradas e links de verificação/redefinição de senha vencidos:
//   não autenticam mais nada, então não há motivo pra mantê-los.
export const AUTH_EVENT_RETENTION_DAYS = 180;
// Relatos de bug: 1 ano — tempo de sobra pra investigar e corrigir.
export const BUG_REPORT_RETENTION_DAYS = 365;
const DAY_MS = 86400000;

export async function runRetention(prisma, now = new Date()) {
  const authEventsBefore = new Date(now.getTime() - AUTH_EVENT_RETENTION_DAYS * DAY_MS);
  const bugReportsBefore = new Date(now.getTime() - BUG_REPORT_RETENTION_DAYS * DAY_MS);
  const [authEvents, sessions, verifications, resets, bugReports] = await prisma.$transaction([
    prisma.authEvent.deleteMany({ where: { createdAt: { lt: authEventsBefore } } }),
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.emailVerification.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passwordReset.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.bugReport.deleteMany({ where: { createdAt: { lt: bugReportsBefore } } }),
  ]);
  return {
    authEvents: authEvents.count,
    sessions: sessions.count,
    verifications: verifications.count,
    resets: resets.count,
    bugReports: bugReports.count,
  };
}

export function scheduleRetention(prisma) {
  const runSafely = () =>
    runRetention(prisma).catch((error) =>
      console.error("Falha na rotina de retenção de dados:", error.message),
    );
  setTimeout(runSafely, 30000).unref();
  setInterval(runSafely, DAY_MS).unref();
}
