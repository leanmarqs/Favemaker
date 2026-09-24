import React, { useEffect, useRef } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { useLanguage } from "./i18n";

// PREENCHER conforme a extensão for aprovada em cada loja — enquanto a URL
// estiver vazia, o botão daquela loja aparece como "em breve".
export const EXTENSION_STORE_URLS: Record<Browser, string> = {
  edge: "",
  chrome: "",
  firefox: "",
};

type Browser = "edge" | "chrome" | "firefox";
const STORE_LABELS: Record<Browser, string> = {
  edge: "Microsoft Edge",
  chrome: "Google Chrome",
  firefox: "Mozilla Firefox",
};

// Navegador atual, pra destacar a loja certa primeiro. "Edg/" vem antes de
// "Chrome/" de propósito: o user agent do Edge também contém "Chrome".
function detectBrowser(): Browser {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "edge";
  if (/Firefox\//.test(ua)) return "firefox";
  return "chrome";
}

// Modal "Extensão do Linkable" (menu da conta): link pra loja do navegador
// em uso e o passo a passo de como usar depois de instalada.
export default function ExtensionDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  const current = detectBrowser();
  const browsers: Browser[] = [
    current,
    ...(["edge", "chrome", "firefox"] as Browser[]).filter((b) => b !== current),
  ];
  return (
    <dialog
      ref={ref}
      className="confirm-dialog extension-dialog"
      aria-labelledby="extension-dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="modal-content">
          <div className="modal-heading">
            <h2 id="extension-dialog-title">{t("extension_title")}</h2>
            <button
              className="icon-button"
              type="button"
              aria-label={t("legal_close")}
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
          <div className="extension-intro">
            <img src="/extension-icon128.png" alt="" />
            <p>{t("extension_intro")}</p>
          </div>
          <div className="extension-stores">
            {browsers.map((browser, index) => {
              const url = EXTENSION_STORE_URLS[browser];
              const label = STORE_LABELS[browser];
              return url ? (
                <a
                  key={browser}
                  className={index === 0 ? "primary" : "secondary"}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t("extension_install_for", { browser: label })}
                  <ArrowUpRight size={15} />
                </a>
              ) : (
                <span
                  key={browser}
                  className={`${index === 0 ? "primary" : "secondary"} is-soon`}
                  aria-disabled="true"
                >
                  {t("extension_soon_for", { browser: label })}
                </span>
              );
            })}
          </div>
          <h3 className="extension-steps-title">{t("extension_how_title")}</h3>
          <ol className="extension-steps">
            <li>{t("extension_step_install")}</li>
            <li>{t("extension_step_pin")}</li>
            <li>{t("extension_step_login")}</li>
            <li>{t("extension_step_save")}</li>
            <li>{t("extension_step_context")}</li>
          </ol>
        </div>
      )}
    </dialog>
  );
}
