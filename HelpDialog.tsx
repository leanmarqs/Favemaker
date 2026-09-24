import React, { useEffect, useRef, useState } from "react";
import { Bug, FileText, Mail, Puzzle, Shield, X } from "lucide-react";
import { useLanguage } from "./i18n";
import { CONTACT_EMAIL, hasContactEmail } from "./LegalDocs";
import { APP_COMMIT } from "./siteInfo";

// Modal "Ajuda" (menu da conta): atalhos pra extensão, documentos e contato,
// e o formulário de relato de bug (POST /api/bug-reports — guardado no banco
// e, se configurado, enviado por e-mail; ver server/index.mjs). Junto com o
// texto vão a página atual, o tamanho da tela e o commit do front — o
// navegador, o servidor lê do próprio User-Agent da requisição.
export default function HelpDialog({
  open,
  onClose,
  onOpenExtension,
}: {
  open: boolean;
  onClose: () => void;
  onOpenExtension: () => void;
}) {
  const { t, localize } = useLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open && ref.current?.open) ref.current.close();
    if (open) {
      setStatus((current) => (current === "sent" ? "idle" : current));
      setError("");
    }
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          pageUrl: location.href,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          appCommit: APP_COMMIT,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("help_bug_error"));
      setMessage("");
      setStatus("sent");
    } catch (e) {
      setError(localize((e as Error).message));
      setStatus("idle");
    }
  }

  return (
    <dialog
      ref={ref}
      className="confirm-dialog help-dialog"
      aria-labelledby="help-dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal-content">
          <div className="modal-heading">
            <h2 id="help-dialog-title">{t("help_title")}</h2>
            <button
              className="icon-button"
              type="button"
              aria-label={t("legal_close")}
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>

          <nav className="help-links">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenExtension();
              }}
            >
              <Puzzle size={16} />
              {t("help_extension")}
            </button>
            <a href="/termos" target="_blank" rel="noopener">
              <FileText size={16} />
              {t("legal_terms")}
            </a>
            <a href="/privacidade" target="_blank" rel="noopener">
              <Shield size={16} />
              {t("legal_privacy")}
            </a>
            {hasContactEmail && (
              <a href={`mailto:${CONTACT_EMAIL}`}>
                <Mail size={16} />
                {t("help_contact")}
              </a>
            )}
          </nav>

          <section className="help-bug" aria-labelledby="help-bug-title">
            <h3 id="help-bug-title">
              <Bug size={16} />
              {t("help_bug_title")}
            </h3>
            {status === "sent" ? (
              <div className="help-bug-sent" role="status">
                <p>{t("help_bug_sent")}</p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setStatus("idle")}
                >
                  {t("help_bug_another")}
                </button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <label>
                  <span className="sr-only">{t("help_bug_title")}</span>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t("help_bug_placeholder")}
                    rows={5}
                    minLength={10}
                    maxLength={4000}
                    required
                    disabled={status === "sending"}
                  />
                </label>
                <p className="help">
                  {t("help_bug_context", { commit: APP_COMMIT })}
                </p>
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  className="primary"
                  disabled={status === "sending" || message.trim().length < 10}
                >
                  {status === "sending" ? t("help_bug_sending") : t("help_bug_send")}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </dialog>
  );
}
