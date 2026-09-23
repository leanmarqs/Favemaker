import React, { useEffect, useState } from "react";
import { useLanguage } from "./i18n";

// Navegação em pontinhos no canto direito, junto da barra de rolagem: um ponto
// por coleção da página, na ordem em que aparecem. O ponto da coleção que
// está passando pela tela cresce um pouco, pra ajudar a pessoa a se localizar;
// clicar num ponto rola até a coleção. Cada coleção é achada pelo
// data-collection-id do <article> dela (ver CollectionRow em App.tsx), e a
// rolagem é a do <main> (".app-shell > main"), não a da janela.
export default function CollectionDots({
  collections,
}: {
  collections: { id: string; name: string }[];
}) {
  const { t } = useLanguage();
  const [activeId, setActiveId] = useState<string | null>(null);
  const idsKey = collections.map((c) => c.id).join(",");

  useEffect(() => {
    const main = document.querySelector<HTMLElement>(".app-shell > main");
    if (!main || !collections.length) return;
    let frame = 0;
    function update() {
      frame = 0;
      if (!main) return;
      const mainRect = main.getBoundingClientRect();
      const header = main.querySelector<HTMLElement>(".sticky-header");
      // Linha de referência: um pouco abaixo do cabeçalho fixo — a coleção
      // ativa é a última cujo topo já passou dessa linha.
      const line =
        mainRect.top + (header?.offsetHeight || 0) + mainRect.height * 0.2;
      let current = collections[0]?.id ?? null;
      for (const c of collections) {
        const el = main.querySelector<HTMLElement>(
          `[data-collection-id="${CSS.escape(c.id)}"]`,
        );
        if (el && el.getBoundingClientRect().top <= line) current = c.id;
      }
      // No fim da página a última coleção pode ser curta demais pra cruzar a
      // linha — marca ela mesmo assim.
      if (main.scrollTop + main.clientHeight >= main.scrollHeight - 2)
        current = collections[collections.length - 1]?.id ?? current;
      setActiveId(current);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    update();
    main.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      main.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  function goTo(id: string) {
    const main = document.querySelector<HTMLElement>(".app-shell > main");
    const el = main?.querySelector<HTMLElement>(
      `[data-collection-id="${CSS.escape(id)}"]`,
    );
    if (!main || !el) return;
    const header = main.querySelector<HTMLElement>(".sticky-header");
    const top =
      el.getBoundingClientRect().top -
      main.getBoundingClientRect().top +
      main.scrollTop -
      (header?.offsetHeight || 0);
    main.scrollTo({ top, behavior: "smooth" });
  }

  if (collections.length < 2) return null;
  return (
    <nav className="collection-dots" aria-label={t("collection_dots_nav")}>
      {collections.map((c) => (
        <button
          key={c.id}
          type="button"
          className={`collection-dot ${activeId === c.id ? "is-active" : ""}`}
          aria-label={t("collection_dots_go", { name: c.name })}
          aria-current={activeId === c.id ? "location" : undefined}
          onClick={() => goTo(c.id)}
        >
          <span className="collection-dot-label">{c.name}</span>
        </button>
      ))}
    </nav>
  );
}
