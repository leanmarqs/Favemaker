import { Resend } from "resend";

let client;
function resend() {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendPasswordResetEmail(to, resetUrl) {
  await resend().emails.send({
    from: process.env.EMAIL_FROM || "Pinicon <onboarding@resend.dev>",
    to,
    subject: "Redefinir sua senha do Pinicon",
    html: `<p>Recebemos um pedido para redefinir sua senha.</p><p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a>. O link expira em 1 hora.</p><p>Se você não pediu isso, ignore este e-mail.</p>`,
  });
}

export async function sendVerificationEmail(to, verifyUrl) {
  await resend().emails.send({
    from: process.env.EMAIL_FROM || "Pinicon <onboarding@resend.dev>",
    to,
    subject: "Confirme seu e-mail no Pinicon",
    html: `<p>Falta pouco para ativar sua conta.</p><p><a href="${verifyUrl}">Clique aqui para confirmar seu e-mail</a>. O link expira em 24 horas.</p><p>Se você não criou uma conta no Pinicon, ignore este e-mail.</p>`,
  });
}
