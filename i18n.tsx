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
