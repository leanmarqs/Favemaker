import { Resend } from "resend";

let client;
function resend() {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

// O SDK do Resend não lança exceção em erro da API (ex: sandbox sem domínio
// verificado, que só permite mandar pro próprio e-mail da conta Resend) — ele
// resolve normalmente com { data: null, error: {...} }. Sem checar isso à
// mão, chamadores como issueVerification (ver server/auth.mjs) nunca veem o
// erro: a Promise "dá certo", o .catch() nunca dispara, e o e-mail
// simplesmente não chega, sem nenhum log nem aviso em lugar nenhum.
async function send(payload) {
  const { error } = await resend().emails.send(payload);
  if (error) throw new Error(error.message || "Falha ao enviar e-mail.");
}

export async function sendPasswordResetEmail(to, resetUrl) {
  await send({
    from: process.env.EMAIL_FROM || "Linkable <onboarding@resend.dev>",
    to,
    subject: "Redefinir sua senha do Linkable",
    html: `<p>Recebemos um pedido para redefinir sua senha.</p><p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a>. O link expira em 1 hora.</p><p>Se você não pediu isso, ignore este e-mail.</p>`,
  });
}

export async function sendVerificationEmail(to, verifyUrl) {
  await send({
    from: process.env.EMAIL_FROM || "Linkable <onboarding@resend.dev>",
    to,
    subject: "Confirme seu e-mail no Linkable",
    html: `<p>Falta pouco para ativar sua conta.</p><p><a href="${verifyUrl}">Clique aqui para confirmar seu e-mail</a>. O link expira em 24 horas.</p><p>Se você não criou uma conta no Linkable, ignore este e-mail.</p>`,
  });
}
