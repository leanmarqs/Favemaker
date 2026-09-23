import React, { useEffect, useRef, useState } from "react";
import { Share, Link2, Send } from "lucide-react";

// Botão de compartilhar reutilizado em toda a Linkable (prévia de favorito,
// modal de editar favorito/coleção, publicação e comentário da Comunidade):
// em vez de copiar o link na hora do clique, abre um menu com "Copiar link"
// (o comportamento de sempre, decidido por quem chama via onCopyLink) e
// "Compartilhar via...", que abre o seletor nativo do sistema operacional
// (Web Share API) quando o navegador suporta — em desktop sem suporte, cai
// de volta pro mesmo efeito de "Copiar link".
export default function ShareButton({
  url,
  title,
  onCopyLink,
  label = "Compartilhar",
  size = 15,
  className,
  children,
}: {
  url: string;
  title?: string;
  onCopyLink: () => void;
  label?: string;
  size?: number;
  className?: string;
  // Conteúdo extra dentro do próprio botão-gatilho (ex.: a contagem de
  // compartilhamentos do post, ao lado do ícone) — o menu (Copiar link /
  // Compartilhar via...) continua igual, só o gatilho ganha esse extra.
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function shareVia() {
    setOpen(false);
    if (navigator.share) {
      try {
        await navigator.share({ url, title });
      } catch {
        // Usuário cancelou o seletor nativo (ou o próprio navegador rejeitou)
        // — não é um erro pra avisar, só desistiu de compartilhar.
      }
      return;
    }
    onCopyLink();
  }

  return (
    <div className={`share-menu ${className || ""}`} ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        <Share size={size} />
        {children}
      </button>
      {open && (
        <div className="share-menu-panel" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onCopyLink();
            }}
          >
            <Link2 size={14} />
            Copiar link
          </button>
          <button type="button" role="menuitem" onClick={() => void shareVia()}>
            <Send size={14} />
            Compartilhar via...
          </button>
        </div>
      )}
    </div>
  );
}
