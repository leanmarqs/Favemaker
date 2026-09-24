import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Lock, Mail, User } from "lucide-react";
import App from "./App";
import PasswordField from "./PasswordField";
import type { Account } from "./types";
import { LegalDialog, type LegalDocKind } from "./LegalDocs";
import { useLanguage } from "./i18n";
import "./styles.css";

type View = "login" | "register" | "forgot" | "reset" | "verify";
type GoogleTokenClient = { requestAccessToken: () => void };
type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (options: {
        client_id: string;
        scope: string;
        callback: (response: { access_token?: string }) => void;
      }) => GoogleTokenClient;
    };
  };
};
declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.68-3.87 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  );
}
function IconInput({
  icon,
  ...props
}: { icon: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="auth-icon-field">
      {icon}
      <input {...props} />
    </div>
  );
}
class AuthRequestError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}
async function authRequest(path: string, body?: unknown) {
  const response = await fetch(`/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return {};
  const data = await response.json();
  if (!response.ok)
    throw new AuthRequestError(
      data.error || "Não foi possível entrar. Tente novamente.",
      data.code,
    );
  return data;
}
const RESEND_COOLDOWN_KEY = "linkable_resend_cooldown_until";
// Cooldown de 30s persistido no localStorage: sobrevive a trocar de tela ou recarregar a
// página. É só uma trava de UX (o limite real contra abuso é o rate limit no servidor).
function readResendCooldown() {
  try {
    const until = Number(localStorage.getItem(RESEND_COOLDOWN_KEY) || 0);
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  } catch {
    return 0;
  }
}
function startResendCooldown() {
  try {
    localStorage.setItem(RESEND_COOLDOWN_KEY, String(Date.now() + 30000));
  } catch {
    // localStorage indisponível (ex: navegação privada): o cooldown ainda funciona em memória.
  }
}
const titles: Record<View, string> = {
  login: "Entrar",
  register: "Crie sua conta",
  forgot: "Esqueceu a senha?",
  reset: "Nova senha",
  verify: "Confirme seu e-mail",
};
const subtitles: Record<View, string> = {
  login: "Encontre, salve, relembre.",
  register: "Encontre, salve, relembre.",
  forgot: "Informe seu e-mail ou usuário para receber um link de redefinição.",
  reset: "Crie uma nova senha para sua conta.",
  verify: "Falta pouco. Confirme seu e-mail para ativar a conta.",
};
export default function Auth() {
  const params = new URLSearchParams(location.search);
  const shared = Boolean(params.get("perfil"));
  const resetToken = params.get("resetToken") || "";
  const verifyToken = params.get("verifyToken") || "";
  const [user, setUser] = useState<Account | null>(null);
  const [loading, setLoading] = useState(!shared);
  const [view, setView] = useState<View>(
    resetToken ? "reset" : verifyToken ? "verify" : "login",
  );
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Aceite dos Termos/Política no cadastro (LGPD) — o servidor recusa o
  // cadastro sem ele, e grava a versão e a data do aceite na conta.
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocKind | null>(null);
  const { t } = useLanguage();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendCooldown, setResendCooldown] = useState(readResendCooldown);
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState("");
  const [googleNotFound, setGoogleNotFound] = useState(false);
  const [theme] = useState(() => {
    try {
      return localStorage.getItem("linkable-theme") || "dark";
    } catch {
      return "dark";
    }
  });
  const googleTokenClient = useRef<GoogleTokenClient | null>(null);
  const googleNotFoundDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (googleNotFound) googleNotFoundDialog.current?.showModal();
    else googleNotFoundDialog.current?.close();
  }, [googleNotFound]);
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown(readResendCooldown()), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);
  useEffect(() => {
    if (!verifyToken) return;
    let active = true;
    setBusy(true);
    authRequest("verify-email", { token: verifyToken })
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [verifyToken]);
  // Roda mesmo com "shared" (perfil público, ?perfil=): GET /api/auth/me
  // sempre responde 200 {user:null} pra quem não está logado (nunca lança),
  // então isso é seguro pra visitante anônimo também — e é o que permite ao
  // App mostrar o header completo (busca + menu de avatar) quando quem abre
  // um link de perfil já está com sessão ativa (ver o render de "shared" logo
  // abaixo).
  useEffect(() => {
    authRequest("me")
      .then((data) => {
        setUser(data.user);
        setClientId(data.googleClientId);
      })
      .catch(() =>
        setError(
          "Não foi possível conectar. Recarregue a página para tentar novamente.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!clientId || user || loading) return;
    let active = true;
    const init = () => {
      if (!active || !window.google) return;
      googleTokenClient.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "openid email profile",
        callback: async ({ access_token }) => {
          if (!access_token) {
            setError("Não foi possível entrar com o Google. Tente novamente.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            const data = await authRequest("google", { accessToken: access_token });
            setUser(data.user);
          } catch (e) {
            if ((e as AuthRequestError).code === "GOOGLE_ACCOUNT_NOT_LINKED") setGoogleNotFound(true);
            else setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        },
      });
    };
    let script = document.querySelector<HTMLScriptElement>(
      "script[data-google-login]",
    );
    if (!script) {
      script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.dataset.googleLogin = "true";
      document.head.appendChild(script);
    }
    const failed = () =>
      setError(
        "Não foi possível carregar o Google. Use usuário e senha ou recarregue a página.",
      );
    script.addEventListener("load", init);
    script.addEventListener("error", failed);
    init();
    return () => {
      active = false;
      script.removeEventListener("load", init);
      script.removeEventListener("error", failed);
    };
  }, [clientId, user, loading]);
  function googleSignIn() {
    googleTokenClient.current?.requestAccessToken();
  }
  function switchView(next: View) {
    setView(next);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (view === "reset" && password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      if (view === "login") {
        const data = await authRequest("login", { identifier, password });
        setPassword("");
        setUser(data.user);
      } else if (view === "register") {
        const data = await authRequest("register", { username, email, password, acceptTerms });
        setPassword("");
        if (data.user) {
          setUser(data.user);
        } else {
          setIdentifier(email);
          setNotice(data.message);
          setView("verify");
        }
      } else if (view === "forgot") {
        const data = await authRequest("forgot-password", { identifier });
        setNotice(data.message);
        startResendCooldown();
        setResendCooldown(30);
      } else if (view === "verify") {
        const data = await authRequest("resend-verification", { identifier });
        setNotice(data.message);
      } else {
        const data = await authRequest("reset-password", { token: resetToken, password });
        setPassword("");
        setConfirmPassword("");
        setUser(data.user);
      }
    } catch (e) {
      // Conta existe e a senha bateu, mas o e-mail nunca foi confirmado —
      // manda pra tela de reenvio em vez de deixar preso na de login sem
      // nenhum jeito de voltar a pedir um novo link (ver PENDING_VERIFICATION
      // em server/auth.mjs). Cadastrar de novo não é saída: o servidor recusa
      // usuário/e-mail já em uso.
      if (view === "login" && (e as AuthRequestError).code === "PENDING_VERIFICATION") {
        setNotice((e as Error).message);
        setView("verify");
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }
  async function resendVerification() {
    setBusy(true);
    setError("");
    try {
      const data = await authRequest("resend-verification", { identifier });
      setNotice(data.message);
      startResendCooldown();
      setResendCooldown(30);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await authRequest("logout", {});
      location.assign("/");
    } catch {
      window.alert("Não foi possível sair. Tente novamente.");
    }
  }
  // key força remontar o App no instante em que o fetch de "me" acima
  // resolver pra um usuário logado — o estado interno "profile" do App só lê
  // o prop "account" uma vez, no mount (useState(account)), então sem essa
  // troca de key o header ficaria "sem conta" mesmo depois da sessão
  // carregar. Pra visitante anônimo de verdade, "user" continua null e não
  // há remount nenhum.
  if (shared)
    return (
      <App key={user?.id ?? "anon"} account={user ?? undefined} onLogout={logout} googleClientId={clientId} />
    );
  if (loading)
    return (
      <main className="auth-page" aria-busy="true">
        Carregando…
      </main>
    );
  if (user)
    return <App key={user.id} account={user} onLogout={logout} googleClientId={clientId} />;
  return (
    <>
    <main className="auth-page">
      <section className="auth-panel" aria-label={titles[view]}>
        <div className="auth-panel-inner">
          <div className="auth-brand">
            <img
              src={theme === "dark" ? "/linkable-logotype-2.png" : "/linkable-logotype-1.png"}
              alt="Linkable"
            />
          </div>
          <p className="auth-subtitle">{subtitles[view]}</p>
          <form onSubmit={submit}>
            {view === "register" && (
              <IconInput
                icon={<User size={18} />}
                placeholder="Usuário"
                aria-label="Usuário"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                minLength={3}
                maxLength={32}
                pattern="[a-zA-Z0-9_.\-]+"
                autoCapitalize="none"
                spellCheck={false}
              />
            )}
            {view === "register" && (
              <IconInput
                icon={<Mail size={18} />}
                type="email"
                placeholder="E-mail"
                aria-label="E-mail"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
                autoCapitalize="none"
                spellCheck={false}
              />
            )}
            {(view === "login" || view === "forgot" || view === "verify") && (
              <IconInput
                icon={<Mail size={18} />}
                placeholder="E-mail ou usuário"
                aria-label="E-mail ou usuário"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                maxLength={254}
                autoCapitalize="none"
                spellCheck={false}
              />
            )}
            {(view === "login" || view === "register" || view === "reset") && (
              <PasswordField
                icon={<Lock size={18} />}
                value={password}
                onChange={setPassword}
                placeholder={view === "reset" ? "Nova senha" : "Senha"}
                autoComplete={view === "login" ? "current-password" : "new-password"}
                minLength={view === "login" ? undefined : 8}
              />
            )}
            {view === "reset" && (
              <PasswordField
                icon={<Lock size={18} />}
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Confirmar nova senha"
                autoComplete="new-password"
                minLength={8}
              />
            )}
            {view === "register" && (
              <label className="auth-terms">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  required
                />
                <span>
                  {t("legal_accept_prefix")}{" "}
                  <button type="button" onClick={() => setLegalDoc("terms")}>
                    {t("legal_terms")}
                  </button>{" "}
                  {t("legal_accept_and")}{" "}
                  <button type="button" onClick={() => setLegalDoc("privacy")}>
                    {t("legal_privacy")}
                  </button>
                </span>
              </label>
            )}
            {notice && <p className="auth-notice">{notice}</p>}
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button className="auth-submit" disabled={busy || (view === "forgot" && resendCooldown > 0)}>
              <span>
                {busy
                  ? "Aguarde…"
                  : view === "login"
                    ? "Entrar"
                    : view === "register"
                      ? "Criar conta"
                      : view === "forgot"
                        ? "Enviar link"
                        : view === "verify"
                          ? "Reenviar e-mail"
                          : "Redefinir senha"}
              </span>
              {!busy && <ArrowRight size={18} className="auth-submit-arrow" />}
            </button>
          </form>
          {(view === "login" || view === "register") && (
            <>
              <div className="auth-divider">ou</div>
              {clientId ? (
                <button
                  type="button"
                  className="auth-google"
                  disabled={busy}
                  onClick={googleSignIn}
                >
                  <GoogleIcon />
                  Continuar com o Google
                </button>
              ) : (
                <button
                  className="auth-google"
                  disabled
                  title="Login Google ainda não disponível"
                >
                  Continuar com Google (em breve)
                </button>
              )}
            </>
          )}
          {view === "login" && (
            <button
              type="button"
              className="auth-link"
              disabled={busy}
              onClick={() => switchView("forgot")}
            >
              Esqueceu a senha? <span className="auth-accent">Redefinir</span>
            </button>
          )}
          {(view === "login" || view === "register") && (
            <button
              type="button"
              className="auth-toggle"
              disabled={busy}
              onClick={() => switchView(view === "login" ? "register" : "login")}
            >
              {view === "register" ? (
                <>
                  Já tenho conta. <span className="auth-accent">Entrar</span>
                </>
              ) : (
                <>
                  Não tenho conta. <span className="auth-accent">Criar conta</span>
                </>
              )}
            </button>
          )}
          {view === "forgot" && notice && (
            <button
              type="button"
              className="auth-link"
              disabled={busy || resendCooldown > 0}
              onClick={resendVerification}
            >
              Não recebeu o e-mail?{" "}
              <span className="auth-accent">
                {resendCooldown > 0 ? `Reenviar em ${resendCooldown}s` : "Reenviar confirmação"}
              </span>
            </button>
          )}
          {view === "forgot" && (
            <button
              type="button"
              className="auth-toggle"
              disabled={busy}
              onClick={() => switchView("login")}
            >
              <span className="auth-accent">Voltar para login</span>
            </button>
          )}
          {(view === "reset" || view === "verify") && (
            <button
              type="button"
              className="auth-toggle"
              disabled={busy}
              onClick={() => switchView("login")}
            >
              Já tenho conta. <span className="auth-accent">Entrar</span>
            </button>
          )}
        </div>
      </section>
      <nav className="auth-legal-links">
        <a href="/termos" target="_blank" rel="noopener">
          {t("legal_terms")}
        </a>
        <a href="/privacidade" target="_blank" rel="noopener">
          {t("legal_privacy")}
        </a>
      </nav>
      <aside className="auth-visual" aria-hidden="true">
        <img src="/background-5.png" alt="" />
      </aside>
    </main>
    <LegalDialog doc={legalDoc} onClose={() => setLegalDoc(null)} />
    <dialog
      ref={googleNotFoundDialog}
      onClose={() => setGoogleNotFound(false)}
    >
      <div className="modal-content">
        <div className="modal-heading">
          <h2>Nenhuma conta do Linkable foi encontrada.</h2>
        </div>
        <p>Essa conta do Google não está vinculada a nenhuma conta do Linkable.</p>
        <div className="modal-footer">
          <button
            type="button"
            className="secondary"
            onClick={() => setGoogleNotFound(false)}
          >
            Fazer login de outro jeito
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              setGoogleNotFound(false);
              switchView("register");
            }}
          >
            Inscrever-se
          </button>
        </div>
      </div>
    </dialog>
    </>
  );
}
