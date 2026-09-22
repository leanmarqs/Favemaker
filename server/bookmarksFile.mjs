import { load } from "cheerio";

// Formato "Netscape Bookmark File" — o HTML padronizado que Chrome, Firefox,
// Edge, Safari e a maioria dos navegadores geram na própria função "Exportar
// favoritos". Genérico de propósito (sem nenhuma regra específica do
// Linkable, como limite de profundidade): quem decide o que fazer com pastas
// aninhadas é a rota /api/import em index.mjs, não este módulo.
//
// Estrutura real (confirmada testando com cheerio): um <DT> com <A> filho é
// um favorito; um <DT> com <H3> filho é uma pasta, e o conteúdo dela é o
// <DL> que aparece como IRMÃO do <H3> dentro desse mesmo <DT> (não como
// filho do <DL> pai).
// Limite de profundidade de pastas aninhadas: nenhum export de navegador de
// verdade passa disso — só existe pra impedir que um arquivo malicioso (HTML
// gerado à mão com milhares de <DL> aninhados) estoure a pilha de chamadas
// dessa recursão, já que o tamanho do corpo (20mb, ver index.mjs) sozinho não
// limita a profundidade da árvore.
const MAX_DEPTH = 50;

export function parseBookmarksHtml(html) {
  const $ = load(html);
  const rootDl = $("dl").first();
  return rootDl.length ? walkDl($, rootDl, 0) : [];
}

function walkDl($, $dl, depth) {
  if (depth > MAX_DEPTH) return [];
  const nodes = [];
  $dl.children("dt").each((_, dtEl) => {
    const $dt = $(dtEl);
    const $a = $dt.children("a").first();
    const $h3 = $dt.children("h3").first();
    if ($a.length) {
      nodes.push({
        type: "bookmark",
        name: $a.text().trim() || $a.attr("href") || "Sem título",
        url: $a.attr("href") || "",
        icon: $a.attr("icon") || "",
      });
    } else if ($h3.length) {
      const $childDl = $dt.children("dl").first();
      nodes.push({
        type: "folder",
        name: $h3.text().trim() || "Pasta",
        children: $childDl.length ? walkDl($, $childDl, depth + 1) : [],
      });
    }
  });
  return nodes;
}

const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}

function renderBookmark(bookmark) {
  const icon = bookmark.favicon ? ` ICON="${escapeHtml(bookmark.favicon)}"` : "";
  return `<DT><A HREF="${escapeHtml(bookmark.url)}"${icon}>${escapeHtml(bookmark.name)}</A>`;
}

// Grupos viram uma subpasta dentro da pasta da coleção — só um nível, já que
// o Linkable também só suporta um nível de agrupamento — o que faz o roundtrip
// (exportar e reimportar, no Linkable ou em qualquer navegador) preservar a
// estrutura sem perdas.
function renderFolder(name, bookmarks, groups) {
  const items = [
    ...bookmarks.map(renderBookmark),
    ...groups.map((group) => renderFolder(group.name, group.bookmarks, [])),
  ].join("\n");
  return `<DT><H3>${escapeHtml(name)}</H3>\n<DL><p>\n${items}\n</DL><p>`;
}

// collections: [{ name, bookmarks: [{name,url,favicon}], groups: [{name, bookmarks}] }]
export function buildBookmarksHtml(collections) {
  const body = collections
    .map((c) => renderFolder(c.name, c.bookmarks, c.groups))
    .join("\n");
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
${body}
</DL><p>
`;
}
