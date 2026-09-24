import React, { createContext, useContext, useEffect, useState } from "react";

export type Lang = "pt" | "en" | "es";
export const LANGS: Lang[] = ["pt", "en", "es"];
export const LANG_LABELS: Record<Lang, string> = { pt: "PT", en: "EN", es: "ES" };
const LANG_KEY = "linkable-lang";

type Vars = Record<string, string | number>;

function interpolate(str: string, vars?: Vars): string {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{{${key}}}`,
  );
}

// Textos estáticos da interface (labels, botões, títulos), escritos direto no
// código do front-end. Chave plana em vez de objeto aninhado: mais fácil
// comparar as três línguas lado a lado e garantir (ver checkTranslations
// abaixo) que nenhuma chave ficou faltando numa delas.
export const translations: Record<Lang, Record<string, string>> = {
  pt: {
    home_tab_saved: "Itens Salvos",
    collection_unsave: "Remover dos salvos",
    collection_refresh_icons: "Atualizar imagens",
    collection_refresh_icons_aria: "Atualizar imagens dos favoritos de {{name}}",
    collection_refresh_icons_running: "Atualizando imagens…",
    collection_refresh_icons_done: "{{updated}} de {{total}} imagens atualizadas.",
    collection_refresh_icons_none: "Nenhuma imagem nova encontrada.",
    collection_unsave_aria: "Remover {{name}} dos itens salvos",
    saved_empty_title: "Nenhum item salvo ainda",
    saved_empty_body:
      "Favoritos e coleções que você salvar de outras pessoas na Comunidade aparecem aqui.",
    account: "Conta",
    extension_menu: "Extensão",
    extension_title: "Extensão do Linkable",
    extension_intro: "Salve qualquer página ou link no Linkable direto do navegador, com imagem e descrição, sem copiar e colar.",
    extension_install_for: "Instalar no {{browser}}",
    extension_soon_for: "{{browser}} — em breve",
    extension_how_title: "Como usar",
    extension_step_install: "Clique no botão do seu navegador acima e, na loja, em “Obter” ou “Usar no navegador”.",
    extension_step_pin: "Fixe o ícone do Linkable na barra: clique no ícone de extensões (a peça de quebra-cabeça) e no alfinete ao lado do Linkable.",
    extension_step_login: "Continue conectado ao Linkable neste navegador — a extensão usa a mesma conta.",
    extension_step_save: "Em qualquer página, clique no ícone do Linkable, escolha a coleção (e a seção, se quiser) e clique em “Salvar no Linkable”.",
    extension_step_context: "Atalho: clique com o botão direito em qualquer link e escolha “Salvar no Linkable” para salvar direto na última coleção usada.",
    legal_terms: "Termos de Uso",
    legal_privacy: "Política de Privacidade",
    legal_close: "Fechar",
    legal_back_home: "Voltar para o Linkable",
    footer_contact: "Contato",
    help_menu: "Ajuda",
    help_title: "Ajuda",
    help_extension: "Como instalar e usar a extensão",
    help_contact: "Falar com a gente",
    help_bug_title: "Reportar um bug",
    help_bug_placeholder: "O que aconteceu? O que você esperava que acontecesse? Se puder, conte o passo a passo para o problema se repetir.",
    help_bug_context: "Junto com o relato enviamos a versão do Linkable ({{commit}}), a página em que você está, o tamanho da tela e o navegador — isso ajuda a reproduzir o problema.",
    help_bug_send: "Enviar relato",
    help_bug_sending: "Enviando…",
    help_bug_sent: "Obrigado! Recebemos seu relato e vamos investigar.",
    help_bug_another: "Enviar outro relato",
    help_bug_error: "Não foi possível enviar o relato. Tente novamente.",
    footer_made_by: "Feito por",
    app_version: "Linkable · versão {{commit}} · {{date}}",
    legal_accept_prefix: "Li e aceito os",
    legal_accept_and: "e a",
    legal_section: "Privacidade e dados",
    legal_section_help: "Veja como seus dados são tratados e baixe uma cópia de tudo o que o Linkable guarda sobre você.",
    legal_accepted_on: "Você aceitou os Termos de Uso e a Política de Privacidade em {{date}}.",
    legal_download_data: "Baixar meus dados",
    legal_download_help: "O arquivo (JSON) traz sua conta, coleções, favoritos, atividade na Comunidade e registros de login dos últimos 180 dias.",
    collection_dots_nav: "Navegar entre coleções",
    collection_dots_go: "Ir para {{name}}",
    group_delete_confirm_collection:
      "Excluir \"{{name}}\"? Os favoritos dele não são apagados — voltam para a coleção.",
    group_delete_confirm_section:
      "Excluir \"{{name}}\"? Os favoritos dele não são apagados — voltam para a seção \"{{section}}\".",
    section_delete_confirm:
      "Excluir \"{{name}}\"? Os favoritos e agrupamentos dela não são apagados — voltam para a coleção.",
    group_deleted_to_collection: "Grupo excluído. Os favoritos voltaram para a coleção.",
    group_deleted_to_section: "Grupo excluído. Os favoritos voltaram para a seção \"{{name}}\".",
    account_display_name: "Nome de exibição",
    account_display_name_help: "É o nome que aparece nas suas publicações e no seu perfil público.",
    account_display_name_save: "Salvar nome de exibição",
    account_display_name_saved: "Nome de exibição atualizado.",
    account_username: "Usuário",
    account_username_help: "Identifica seu perfil público e é usado internamente pelo sistema — também serve para entrar na conta. 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.",
    account_username_save: "Salvar usuário",
    account_username_saved: "Usuário atualizado.",
    account_saving: "Salvando…",
    profile: "Perfil",
    profile_edit: "Editar Perfil",
    profile_edit_done: "Concluir",
    profile_edit_avatar: "Editar foto",
    profile_edit_banner: "Editar capa",
    profile_banner_position: "Posição da capa",
    profile_banner_cancel: "Cancelar",
    profile_banner_save: "Salvar",
  },
  en: {
    home_tab_saved: "Saved Items",
    collection_unsave: "Remove from saved",
    collection_refresh_icons: "Refresh images",
    collection_refresh_icons_aria: "Refresh bookmark images in {{name}}",
    collection_refresh_icons_running: "Refreshing images…",
    collection_refresh_icons_done: "{{updated}} of {{total}} images updated.",
    collection_refresh_icons_none: "No new images found.",
    collection_unsave_aria: "Remove {{name}} from saved items",
    saved_empty_title: "No saved items yet",
    saved_empty_body:
      "Bookmarks and collections you save from other people in Community show up here.",
    account: "Account",
    extension_menu: "Extension",
    extension_title: "Linkable extension",
    extension_intro: "Save any page or link to Linkable straight from your browser, with image and description, no copy and paste.",
    extension_install_for: "Install on {{browser}}",
    extension_soon_for: "{{browser}} — coming soon",
    extension_how_title: "How to use",
    extension_step_install: "Click your browser's button above and, in the store, click “Get” or “Add to browser”.",
    extension_step_pin: "Pin the Linkable icon to the toolbar: click the extensions icon (the puzzle piece) and the pin next to Linkable.",
    extension_step_login: "Stay signed in to Linkable in this browser — the extension uses the same account.",
    extension_step_save: "On any page, click the Linkable icon, pick the collection (and section, if you want) and click “Save to Linkable”.",
    extension_step_context: "Shortcut: right-click any link and choose “Save to Linkable” to save it straight to the last collection you used.",
    legal_terms: "Terms of Use",
    legal_privacy: "Privacy Policy",
    legal_close: "Close",
    legal_back_home: "Back to Linkable",
    footer_contact: "Contact",
    help_menu: "Help",
    help_title: "Help",
    help_extension: "How to install and use the extension",
    help_contact: "Contact us",
    help_bug_title: "Report a bug",
    help_bug_placeholder: "What happened? What did you expect to happen? If you can, list the steps to make the problem happen again.",
    help_bug_context: "Along with your report we send the Linkable version ({{commit}}), the page you're on, your screen size and browser — this helps us reproduce the problem.",
    help_bug_send: "Send report",
    help_bug_sending: "Sending…",
    help_bug_sent: "Thanks! We got your report and will look into it.",
    help_bug_another: "Send another report",
    help_bug_error: "Couldn't send the report. Please try again.",
    footer_made_by: "Made by",
    app_version: "Linkable · version {{commit}} · {{date}}",
    legal_accept_prefix: "I have read and accept the",
    legal_accept_and: "and the",
    legal_section: "Privacy and data",
    legal_section_help: "See how your data is handled and download a copy of everything Linkable stores about you.",
    legal_accepted_on: "You accepted the Terms of Use and Privacy Policy on {{date}}.",
    legal_download_data: "Download my data",
    legal_download_help: "The file (JSON) includes your account, collections, bookmarks, Community activity and sign-in records from the last 180 days.",
    collection_dots_nav: "Jump between collections",
    collection_dots_go: "Go to {{name}}",
    group_delete_confirm_collection:
      "Delete \"{{name}}\"? Its bookmarks aren't deleted — they go back to the collection.",
    group_delete_confirm_section:
      "Delete \"{{name}}\"? Its bookmarks aren't deleted — they go back to the \"{{section}}\" section.",
    section_delete_confirm:
      "Delete \"{{name}}\"? Its bookmarks and groups aren't deleted — they go back to the collection.",
    group_deleted_to_collection: "Group deleted. Its bookmarks went back to the collection.",
    group_deleted_to_section: "Group deleted. Its bookmarks went back to the \"{{name}}\" section.",
    account_display_name: "Display name",
    account_display_name_help: "The name shown on your posts and on your public profile.",
    account_display_name_save: "Save display name",
    account_display_name_saved: "Display name updated.",
    account_username: "Username",
    account_username_help: "Identifies your public profile and is used internally by the system — you can also sign in with it. 3 to 32 characters: lowercase letters, numbers, period, hyphen or underscore.",
    account_username_save: "Save username",
    account_username_saved: "Username updated.",
    account_saving: "Saving…",
    profile: "Profile",
    profile_edit: "Edit Profile",
    profile_edit_done: "Done",
    profile_edit_avatar: "Edit photo",
    profile_edit_banner: "Edit cover",
    profile_banner_position: "Cover position",
    profile_banner_cancel: "Cancel",
    profile_banner_save: "Save",
  },
  es: {
    home_tab_saved: "Elementos guardados",
    collection_unsave: "Quitar de guardados",
    collection_refresh_icons: "Actualizar imágenes",
    collection_refresh_icons_aria: "Actualizar las imágenes de los favoritos de {{name}}",
    collection_refresh_icons_running: "Actualizando imágenes…",
    collection_refresh_icons_done: "{{updated}} de {{total}} imágenes actualizadas.",
    collection_refresh_icons_none: "No se encontraron imágenes nuevas.",
    collection_unsave_aria: "Quitar {{name}} de los elementos guardados",
    saved_empty_title: "Todavía no hay nada guardado",
    saved_empty_body:
      "Los favoritos y colecciones que guardes de otras personas en Comunidad aparecen aquí.",
    account: "Cuenta",
    extension_menu: "Extensión",
    extension_title: "Extensión de Linkable",
    extension_intro: "Guarda cualquier página o enlace en Linkable directamente desde el navegador, con imagen y descripción, sin copiar y pegar.",
    extension_install_for: "Instalar en {{browser}}",
    extension_soon_for: "{{browser}}: próximamente",
    extension_how_title: "Cómo usarla",
    extension_step_install: "Haz clic en el botón de tu navegador arriba y, en la tienda, en “Obtener” o “Añadir al navegador”.",
    extension_step_pin: "Fija el ícono de Linkable en la barra: haz clic en el ícono de extensiones (la pieza de rompecabezas) y en el alfiler junto a Linkable.",
    extension_step_login: "Mantén la sesión de Linkable iniciada en este navegador: la extensión usa la misma cuenta.",
    extension_step_save: "En cualquier página, haz clic en el ícono de Linkable, elige la colección (y la sección, si quieres) y haz clic en “Guardar en Linkable”.",
    extension_step_context: "Atajo: haz clic derecho en cualquier enlace y elige “Guardar en Linkable” para guardarlo directo en la última colección usada.",
    legal_terms: "Términos de Uso",
    legal_privacy: "Política de Privacidad",
    legal_close: "Cerrar",
    legal_back_home: "Volver a Linkable",
    footer_contact: "Contacto",
    help_menu: "Ayuda",
    help_title: "Ayuda",
    help_extension: "Cómo instalar y usar la extensión",
    help_contact: "Contáctanos",
    help_bug_title: "Reportar un error",
    help_bug_placeholder: "¿Qué pasó? ¿Qué esperabas que pasara? Si puedes, cuenta los pasos para que el problema se repita.",
    help_bug_context: "Junto con el reporte enviamos la versión de Linkable ({{commit}}), la página en la que estás, el tamaño de la pantalla y el navegador; eso ayuda a reproducir el problema.",
    help_bug_send: "Enviar reporte",
    help_bug_sending: "Enviando…",
    help_bug_sent: "¡Gracias! Recibimos tu reporte y lo vamos a investigar.",
    help_bug_another: "Enviar otro reporte",
    help_bug_error: "No se pudo enviar el reporte. Inténtalo de nuevo.",
    footer_made_by: "Hecho por",
    app_version: "Linkable · versión {{commit}} · {{date}}",
    legal_accept_prefix: "He leído y acepto los",
    legal_accept_and: "y la",
    legal_section: "Privacidad y datos",
    legal_section_help: "Mira cómo se tratan tus datos y descarga una copia de todo lo que Linkable guarda sobre ti.",
    legal_accepted_on: "Aceptaste los Términos de Uso y la Política de Privacidad el {{date}}.",
    legal_download_data: "Descargar mis datos",
    legal_download_help: "El archivo (JSON) incluye tu cuenta, colecciones, favoritos, actividad en la Comunidad y registros de inicio de sesión de los últimos 180 días.",
    collection_dots_nav: "Navegar entre colecciones",
    collection_dots_go: "Ir a {{name}}",
    group_delete_confirm_collection:
      "¿Eliminar \"{{name}}\"? Sus favoritos no se eliminan: vuelven a la colección.",
    group_delete_confirm_section:
      "¿Eliminar \"{{name}}\"? Sus favoritos no se eliminan: vuelven a la sección \"{{section}}\".",
    section_delete_confirm:
      "¿Eliminar \"{{name}}\"? Sus favoritos y agrupaciones no se eliminan: vuelven a la colección.",
    group_deleted_to_collection: "Grupo eliminado. Sus favoritos volvieron a la colección.",
    group_deleted_to_section: "Grupo eliminado. Sus favoritos volvieron a la sección \"{{name}}\".",
    account_display_name: "Nombre visible",
    account_display_name_help: "Es el nombre que aparece en tus publicaciones y en tu perfil público.",
    account_display_name_save: "Guardar nombre visible",
    account_display_name_saved: "Nombre visible actualizado.",
    account_username: "Usuario",
    account_username_help: "Identifica tu perfil público y el sistema lo usa internamente; también sirve para iniciar sesión. De 3 a 32 caracteres: letras minúsculas, números, punto, guion o guion bajo.",
    account_username_save: "Guardar usuario",
    account_username_saved: "Usuario actualizado.",
    account_saving: "Guardando…",
    profile: "Perfil",
    profile_edit: "Editar perfil",
    profile_edit_done: "Listo",
    profile_edit_avatar: "Editar foto",
    profile_edit_banner: "Editar portada",
    profile_banner_position: "Posición de la portada",
    profile_banner_cancel: "Cancelar",
    profile_banner_save: "Guardar",
  },
};

// Mensagens que chegam em tempo de execução (respostas de erro/sucesso da
// API, ou o texto padrão do próprio front-end quando a API não manda um
// texto) — nunca são strings fixas no JSX, então não dá pra trocar por
// t("chave") no lugar onde nascem. Em vez disso, o texto em português que
// chega (idêntico ao que o servidor manda) é usado como CHAVE aqui pra achar
// a tradução certa; se não encontrar, mostra o próprio texto em português
// (degrada bem, nunca quebra).
export const messageCatalog: Record<string, { en: string; es: string }> = {};

export function localizeMessage(message: string, lang: Lang): string {
  if (lang === "pt" || !message) return message;
  return messageCatalog[message]?.[lang] ?? message;
}

function detectDefaultLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored && (LANGS as string[]).includes(stored)) return stored as Lang;
  } catch {
    // localStorage indisponível (ex: navegação privada): cai no padrão abaixo.
  }
  return "pt";
}

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Vars) => string;
  localize: (message: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectDefaultLang);
  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Sem localStorage, o idioma escolhido só dura a sessão atual — sem problema.
    }
    document.documentElement.lang = lang === "pt" ? "pt-BR" : lang === "es" ? "es" : "en";
  }, [lang]);
  const value: LanguageContextValue = {
    lang,
    setLang: setLangState,
    t: (key, vars) => interpolate(translations[lang][key] ?? translations.pt[key] ?? key, vars),
    localize: (message) => localizeMessage(message, lang),
  };
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage precisa ser usado dentro de um LanguageProvider.");
  return ctx;
}
