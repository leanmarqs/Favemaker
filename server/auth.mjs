import { randomBytes, createHash, scrypt as derive, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { OAuth2Client } from "google-auth-library";
import { emailConfigured, sendPasswordResetEmail, sendVerificationEmail } from "./email.mjs";
import { resolveImage } from "./metadata.mjs";

const scrypt = promisify(derive);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const cookieOptions = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" };
const cookieToken = (req) => req.headers.cookie?.match(/(?:^|;\s*)pinicon_session=([a-f0-9]{64})(?:;|$)/)?.[1];
const MIN_PASSWORD = 8;
const SESSION_DURATION = 30 * 86400000;
const LOCK_THRESHOLD = 5;
// Bloqueio progressivo: 30s, 1min, 5min, 15min (não bloqueia permanentemente por erro de senha).
const LOCK_STEPS = [30000, 60000, 300000, 900000];
const lockDuration = (attempts) => LOCK_STEPS[Math.min(Math.max(attempts - LOCK_THRESHOLD, 0), LOCK_STEPS.length - 1)];
const publicUser = (owner) => ({
  id: owner.id,
  name: owner.displayName || owner.username,
  displayName: owner.displayName || "",
  username: owner.username || "",
  email: owner.email || "",
  avatar: owner.avatar || "",
  hasPassword: Boolean(owner.passwordHash),
  googleLinked: Boolean(owner.googleId),
});
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  const [salt, key] = encoded.split(":");
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(key, "hex"));
}
// Consulta o HaveIBeenPwned via k-anonymity: só envia os 5 primeiros chars do hash SHA-1,
// nunca a senha (ou o hash completo). Falha aberta se a API estiver indisponível.
export async function isPasswordBreached(password) {
  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split("\n").some((line) => line.split(":")[0].trim() === suffix);
  } catch (error) {
    console.error("[auth] Falha ao consultar HaveIBeenPwned:", error.message || error);
    return false;
  }
}
export function installAuth(app, prisma) {
  const google = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  const attempts = new Map();
  const requestLimits = new Map();
  const REQUEST_LIMIT = 3;
  const REQUEST_WINDOW = 900000;
  // Limita "enviar link" por conta/identifier (independente do rate limit por IP acima),
  // para não deixar alguém spammar e-mails de redefinição/confirmação para uma vítima.
  function withinRequestLimit(key) {
    let entry = requestLimits.get(key);
    if (!entry || entry.until < Date.now()) entry = { count: 0, until: Date.now() + REQUEST_WINDOW };
    entry.count++;
    requestLimits.set(key, entry);
    return entry.count <= REQUEST_LIMIT;
  }
  const cleanup = setInterval(() => {
    for (const [key, entry] of attempts) if (entry.until < Date.now()) attempts.delete(key);
    for (const [key, entry] of requestLimits) if (entry.until < Date.now()) requestLimits.delete(key);
  }, 60000);
  cleanup.unref();
  const dummy = hashPassword(randomBytes(32).toString("hex"));
  // Log de auditoria de segurança: nunca inclui senha ou tokens, só metadados do evento.
  async function logAuthEvent(req, ownerId, eventType) {
    try {
      await prisma.authEvent.create({
        data: { ownerId: ownerId || null, eventType, ip: req.ip || null, userAgent: req.headers["user-agent"]?.slice(0, 512) || null },
      });
    } catch (error) {
      console.error("[auth] Falha ao registrar evento de segurança:", error.message || error);
    }
  }
  app.use("/api", async (req, _res, next) => {
    const token = cookieToken(req);
    if (token) {
      const session = await prisma.session.findUnique({ where: { tokenHash: hash(token) }, include: { owner: true } });
      if (session && session.expiresAt > new Date() && session.owner.status === "ACTIVE") req.owner = session.owner;
    }
    next();
  });
  app.get("/api/auth/me", (req, res) => res.json({ user: req.owner ? publicUser(req.owner) : null, googleClientId: process.env.GOOGLE_CLIENT_ID || "" }));
  app.use("/api/auth", (req, res, next) => {
    if (req.method !== "POST") return next();
    const key = req.ip;
    let entry = attempts.get(key);
    if (!entry || entry.until < Date.now()) entry = { count: 0, until: Date.now() + 900000 };
    attempts.set(key, entry);
    if (++entry.count > 30) return res.status(429).json({ error: "Muitas tentativas. Tente novamente em 15 minutos." });
    next();
  });
  async function signIn(req, res, owner) {
    const token = randomBytes(32).toString("hex");
    const oldToken = cookieToken(req);
    await prisma.$transaction(async (tx) => {
      if (oldToken) await tx.session.deleteMany({ where: { tokenHash: hash(oldToken) } });
      await tx.session.create({ data: { tokenHash: hash(token), ownerId: owner.id, expiresAt: new Date(Date.now() + SESSION_DURATION) } });
    });
    res.cookie("pinicon_session", token, { ...cookieOptions, maxAge: SESSION_DURATION });
    res.json({ user: publicUser(owner) });
  }
  async function createOwner(req, data) {
    const token = cookieToken(req);
    return prisma.$transaction(async (tx) => {
      if (token) {
        const legacy = await tx.owner.findUnique({ where: { tokenHash: hash(token) } });
        if (legacy && !legacy.username && !legacy.googleId) {
          const claimed = await tx.owner.updateMany({ where: { id: legacy.id, username: null, googleId: null }, data: { ...data, tokenHash: hash(randomBytes(32)) } });
          if (claimed.count) return tx.owner.findUnique({ where: { id: legacy.id } });
        }
      }
      return tx.owner.create({ data: { ...data, tokenHash: hash(randomBytes(32)) } });
    });
  }
  async function issueVerification(owner) {
    const token = randomBytes(32).toString("hex");
    await prisma.$transaction(async (tx) => {
      await tx.emailVerification.deleteMany({ where: { ownerId: owner.id } });
      await tx.emailVerification.create({ data: { tokenHash: hash(token), ownerId: owner.id, expiresAt: new Date(Date.now() + 86400000) } });
    });
    const verifyUrl = `${process.env.APP_URL || "http://localhost:3000"}/?verifyToken=${token}`;
    await sendVerificationEmail(owner.email, verifyUrl).catch((error) =>
      console.error("[auth] Falha ao enviar e-mail de confirmação:", error.message || error),
    );
  }
  app.post("/api/auth/register", async (req, res) => {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Informe um e-mail válido." });
    const username = typeof req.body.username === "string" ? req.body.username.trim().toLowerCase() : "";
    const password = req.body.password;
    if (!/^[a-z0-9_.-]{3,32}$/.test(username)) return res.status(400).json({ error: "Use um usuário de 3 a 32 caracteres: letras, números, ponto, hífen ou sublinhado." });
    if (typeof password !== "string" || password.length < MIN_PASSWORD || password.length > 128)
      return res.status(400).json({ error: `A senha deve ter entre ${MIN_PASSWORD} e 128 caracteres.` });
    if (await isPasswordBreached(password))
      return res.status(400).json({ error: "Esta senha apareceu em vazamentos de dados conhecidos. Escolha outra senha." });
    try {
      const requireVerification = emailConfigured();
      const owner = await createOwner(req, {
        email,
        username,
        displayName: username,
        passwordHash: await hashPassword(password),
        status: requireVerification ? "PENDING_VERIFICATION" : "ACTIVE",
      });
      if (!requireVerification) return signIn(req, res, owner);
      await issueVerification(owner);
      res.json({ message: "Conta criada. Confirme seu e-mail para poder entrar." });
    } catch (error) {
      if (error.code === "P2002") return res.status(409).json({ error: "Este usuário ou e-mail já está em uso." });
      throw error;
    }
  });
  app.post("/api/auth/verify-email", async (req, res) => {
    const token = typeof req.body.token === "string" ? req.body.token : "";
    const verification = token && await prisma.emailVerification.findUnique({ where: { tokenHash: hash(token) }, include: { owner: true } });
    if (!verification || verification.expiresAt < new Date()) return res.status(400).json({ error: "Link de confirmação inválido ou expirado. Peça um novo." });
    const owner = await prisma.$transaction(async (tx) => {
      const updated = await tx.owner.update({ where: { id: verification.ownerId }, data: { status: "ACTIVE" } });
      await tx.emailVerification.deleteMany({ where: { ownerId: verification.ownerId } });
      return updated;
    });
    await logAuthEvent(req, owner.id, "EMAIL_VERIFIED");
    await signIn(req, res, owner);
  });
  app.post("/api/auth/resend-verification", async (req, res) => {
    const identifier = typeof req.body.identifier === "string" ? req.body.identifier.trim().toLowerCase() : "";
    const generic = { message: "Se encontrarmos essa conta pendente, enviaremos um novo e-mail de confirmação." };
    if (!identifier || !emailConfigured()) return res.json(generic);
    if (!withinRequestLimit(`verify:${identifier}`))
      return res.status(429).json({ error: "Muitas solicitações. Tente novamente mais tarde." });
    const owner = identifier.includes("@")
      ? await prisma.owner.findUnique({ where: { email: identifier } })
      : await prisma.owner.findUnique({ where: { username: identifier } });
    if (owner?.email && owner.status === "PENDING_VERIFICATION") await issueVerification(owner);
    res.json(generic);
  });
  app.post("/api/auth/login", async (req, res) => {
    const identifier = typeof req.body.identifier === "string" ? req.body.identifier.trim().toLowerCase() : "";
    const password = req.body.password;
    if (typeof password !== "string" || password.length > 128) return res.status(400).json({ error: "E-mail, usuário ou senha inválidos." });
    const owner = identifier.includes("@")
      ? await prisma.owner.findUnique({ where: { email: identifier } })
      : await prisma.owner.findUnique({ where: { username: identifier } });
    const valid = await verifyPassword(password, owner?.passwordHash || await dummy);
    // Credenciais erradas (ou conta inexistente) sempre recebem a mesma mensagem genérica,
    // para não permitir enumerar contas. O estado da conta só é revelado depois de confirmar a senha.
    if (!valid || !owner?.passwordHash) {
      if (owner) {
        const failedLoginAttempts = owner.failedLoginAttempts + 1;
        const justBlocked = failedLoginAttempts >= LOCK_THRESHOLD;
        await prisma.owner.update({
          where: { id: owner.id },
          data: {
            failedLoginAttempts,
            ...(justBlocked ? { lockedUntil: new Date(Date.now() + lockDuration(failedLoginAttempts)) } : {}),
          },
        });
        await logAuthEvent(req, owner.id, "LOGIN_FAILED");
        if (justBlocked) await logAuthEvent(req, owner.id, "ACCOUNT_BLOCKED");
      }
      return res.status(401).json({ error: "E-mail, usuário ou senha inválidos." });
    }
    // A senha já foi confirmada aqui, então informar o estado da conta não ajuda a
    // enumerar contas (isso só é evitado antes da senha bater, acima).
    if (owner.lockedUntil && owner.lockedUntil > new Date()) {
      await logAuthEvent(req, owner.id, "LOGIN_FAILED");
      return res.status(423).json({ error: "Conta temporariamente bloqueada por muitas tentativas. Tente novamente em alguns minutos.", code: "LOCKED" });
    }
    if (owner.status === "DISABLED") {
      await logAuthEvent(req, owner.id, "LOGIN_FAILED");
      return res.status(403).json({ error: "Esta conta foi desativada.", code: "DISABLED" });
    }
    if (owner.status === "PENDING_VERIFICATION") {
      await logAuthEvent(req, owner.id, "LOGIN_FAILED");
      return res.status(403).json({ error: "Confirme seu e-mail para ativar a conta.", code: "PENDING_VERIFICATION" });
    }
    await prisma.owner.update({ where: { id: owner.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    await logAuthEvent(req, owner.id, "LOGIN_SUCCESS");
    await signIn(req, res, owner);
  });
  app.post("/api/auth/forgot-password", async (req, res) => {
    const identifier = typeof req.body.identifier === "string" ? req.body.identifier.trim().toLowerCase() : "";
    const generic = { message: "Se encontrarmos essa conta, enviaremos um e-mail com o link de redefinição." };
    if (!identifier) return res.json(generic);
    if (!withinRequestLimit(`forgot:${identifier}`))
      return res.status(429).json({ error: "Muitas solicitações. Tente novamente mais tarde." });
    if (!emailConfigured()) {
      console.warn("[auth] RESEND_API_KEY não configurado: e-mail de redefinição não foi enviado.");
      return res.json(generic);
    }
    const owner = identifier.includes("@")
      ? await prisma.owner.findUnique({ where: { email: identifier } })
      : await prisma.owner.findUnique({ where: { username: identifier } });
    if (owner?.passwordHash && owner.email) {
      const token = randomBytes(32).toString("hex");
      await prisma.$transaction(async (tx) => {
        await tx.passwordReset.deleteMany({ where: { ownerId: owner.id } });
        await tx.passwordReset.create({ data: { tokenHash: hash(token), ownerId: owner.id, expiresAt: new Date(Date.now() + 3600000) } });
      });
      const resetUrl = `${process.env.APP_URL || "http://localhost:3000"}/?resetToken=${token}`;
      await sendPasswordResetEmail(owner.email, resetUrl).catch((error) =>
        console.error("[auth] Falha ao enviar e-mail de redefinição:", error.message || error),
      );
      await logAuthEvent(req, owner.id, "PASSWORD_RESET_REQUESTED");
    }
    res.json(generic);
  });
  app.post("/api/auth/reset-password", async (req, res) => {
    const token = typeof req.body.token === "string" ? req.body.token : "";
    const password = req.body.password;
    if (typeof password !== "string" || password.length < MIN_PASSWORD || password.length > 128)
      return res.status(400).json({ error: `A senha deve ter entre ${MIN_PASSWORD} e 128 caracteres.` });
    if (await isPasswordBreached(password))
      return res.status(400).json({ error: "Esta senha apareceu em vazamentos de dados conhecidos. Escolha outra senha." });
    const reset = token && await prisma.passwordReset.findUnique({ where: { tokenHash: hash(token) }, include: { owner: true } });
    if (!reset || reset.expiresAt < new Date()) return res.status(400).json({ error: "Link de redefinição inválido ou expirado. Peça um novo." });
    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      await tx.owner.update({ where: { id: reset.ownerId }, data: { passwordHash, passwordChangedAt: new Date() } });
      await tx.passwordReset.deleteMany({ where: { ownerId: reset.ownerId } });
      await tx.session.deleteMany({ where: { ownerId: reset.ownerId } });
    });
    await logAuthEvent(req, reset.ownerId, "PASSWORD_RESET_COMPLETED");
    await signIn(req, res, reset.owner);
  });
  async function resolveGoogleProfile(accessToken) {
    if (typeof accessToken !== "string" || accessToken.length > 2048) throw new Error();
    const info = await google.getTokenInfo(accessToken);
    if (info.aud !== process.env.GOOGLE_CLIENT_ID || !info.sub || !info.email_verified) throw new Error();
    const profile = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profile.ok) throw new Error();
    const userinfo = await profile.json();
    return { sub: info.sub, name: userinfo.name };
  }
  app.post("/api/auth/google", async (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: "Login Google ainda não configurado." });
    let payload;
    try {
      payload = await resolveGoogleProfile(req.body.accessToken);
    } catch {
      return res.status(401).json({ error: "Não foi possível validar o login Google. Tente novamente." });
    }
    // "Continuar com o Google" só entra em contas que já vincularam essa conta Google
    // explicitamente (pela tela de configurações). Nunca cria uma conta nova por aqui —
    // criar conta é sempre via cadastro com usuário/senha.
    const owner = await prisma.owner.findUnique({ where: { googleId: payload.sub } });
    if (!owner) {
      return res.status(404).json({
        error: "Nenhuma conta do Pinicon foi encontrada.",
        code: "GOOGLE_ACCOUNT_NOT_LINKED",
      });
    }
    if (owner.status === "DISABLED") {
      await logAuthEvent(req, owner.id, "LOGIN_FAILED");
      return res.status(403).json({ error: "Esta conta foi desativada.", code: "DISABLED" });
    }
    if (owner.lockedUntil && owner.lockedUntil > new Date()) {
      await logAuthEvent(req, owner.id, "LOGIN_FAILED");
      return res.status(423).json({ error: "Conta temporariamente bloqueada por muitas tentativas. Tente novamente em alguns minutos.", code: "LOCKED" });
    }
    await logAuthEvent(req, owner.id, "LOGIN_SUCCESS");
    await signIn(req, res, owner);
  });
  app.post("/api/auth/google/connect", async (req, res) => {
    if (!req.owner) return res.status(401).json({ error: "Entre na sua conta para continuar." });
    if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ error: "Login Google ainda não configurado." });
    let payload;
    try {
      payload = await resolveGoogleProfile(req.body.accessToken);
    } catch {
      return res.status(401).json({ error: "Não foi possível validar o Google. Tente novamente." });
    }
    try {
      const owner = await prisma.owner.update({ where: { id: req.owner.id }, data: { googleId: payload.sub } });
      await logAuthEvent(req, owner.id, "GOOGLE_LINKED");
      res.json({ user: publicUser(owner) });
    } catch (error) {
      if (error.code === "P2002") return res.status(409).json({ error: "Esta conta Google já está conectada a outro usuário do Pinicon." });
      throw error;
    }
  });
  app.post("/api/auth/google/disconnect", async (req, res) => {
    if (!req.owner) return res.status(401).json({ error: "Entre na sua conta para continuar." });
    if (!req.owner.googleId) return res.status(400).json({ error: "Nenhuma conta Google está conectada." });
    if (!req.owner.passwordHash)
      return res.status(400).json({ error: "Defina uma senha antes de desconectar o Google, para não perder o acesso à conta." });
    const password = req.body.password;
    const valid = typeof password === "string" && await verifyPassword(password, req.owner.passwordHash);
    if (!valid) return res.status(401).json({ error: "Senha incorreta." });
    const owner = await prisma.owner.update({ where: { id: req.owner.id }, data: { googleId: null } });
    await logAuthEvent(req, owner.id, "GOOGLE_UNLINKED");
    res.json({ user: publicUser(owner) });
  });
  app.post("/api/auth/logout", async (req, res) => {
    const token = cookieToken(req);
    if (req.owner) await logAuthEvent(req, req.owner.id, "LOGOUT");
    if (token) await prisma.session.deleteMany({ where: { tokenHash: hash(token) } });
    res.clearCookie("pinicon_session", cookieOptions);
    res.sendStatus(204);
  });
  app.patch("/api/auth/me", async (req, res) => {
    if (!req.owner) return res.status(401).json({ error: "Entre na sua conta para continuar." });
    const displayName = typeof req.body.displayName === "string" ? req.body.displayName.trim() : "";
    if (!displayName || displayName.length > 60) return res.status(400).json({ error: "O nome deve ter entre 1 e 60 caracteres." });
    const owner = await prisma.owner.update({ where: { id: req.owner.id }, data: { displayName } });
    res.json({ user: publicUser(owner) });
  });
  app.post("/api/auth/avatar", async (req, res) => {
    if (!req.owner) return res.status(401).json({ error: "Entre na sua conta para continuar." });
    try {
      if (req.body.avatar === "") {
        const owner = await prisma.owner.update({ where: { id: req.owner.id }, data: { avatar: "" } });
        return res.json({ user: publicUser(owner) });
      }
      if (typeof req.body.avatar !== "string") throw new Error();
      const { favicon } = await resolveImage(req.body.avatar);
      const owner = await prisma.owner.update({ where: { id: req.owner.id }, data: { avatar: favicon } });
      res.json({ user: publicUser(owner) });
    } catch (error) {
      res.status(400).json({ error: error.message || "Não foi possível processar a imagem." });
    }
  });
  app.post("/api/auth/change-password", async (req, res) => {
    if (!req.owner) return res.status(401).json({ error: "Entre na sua conta para continuar." });
    const newPassword = req.body.newPassword;
    if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD || newPassword.length > 128)
      return res.status(400).json({ error: `A nova senha deve ter entre ${MIN_PASSWORD} e 128 caracteres.` });
    if (await isPasswordBreached(newPassword))
      return res.status(400).json({ error: "Esta nova senha apareceu em vazamentos de dados conhecidos. Escolha outra." });
    if (req.owner.passwordHash) {
      const currentPassword = req.body.currentPassword;
      const valid = typeof currentPassword === "string" && await verifyPassword(currentPassword, req.owner.passwordHash);
      if (!valid) return res.status(401).json({ error: "Senha atual incorreta." });
    }
    await prisma.owner.update({ where: { id: req.owner.id }, data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() } });
    res.sendStatus(204);
  });
  app.post("/api/auth/logout-others", async (req, res) => {
    if (!req.owner) return res.status(401).json({ error: "Entre na sua conta para continuar." });
    const token = cookieToken(req);
    await prisma.session.deleteMany({ where: { ownerId: req.owner.id, NOT: { tokenHash: hash(token || "") } } });
    res.sendStatus(204);
  });
  app.delete("/api/auth/me", async (req, res) => {
    if (!req.owner) return res.status(401).json({ error: "Entre na sua conta para continuar." });
    if (req.owner.passwordHash) {
      const password = req.body.password;
      const valid = typeof password === "string" && await verifyPassword(password, req.owner.passwordHash);
      if (!valid) return res.status(401).json({ error: "Senha incorreta." });
    }
    await prisma.owner.delete({ where: { id: req.owner.id } });
    res.clearCookie("pinicon_session", cookieOptions);
    res.sendStatus(204);
  });
  app.use("/api", (req, res, next) => {
    if (!req.owner) return res.status(401).json({ error: "Entre na sua conta para continuar." });
    next();
  });
}
