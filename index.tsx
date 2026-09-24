import React from "react";
import ReactDOM from "react-dom/client";
import App from "./Auth";
import { LanguageProvider } from "./i18n";
import { LegalPage, legalDocFromPath } from "./LegalDocs";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error(
    "Não foi possível encontrar o elemento principal da aplicação.",
  );
}

const root = ReactDOM.createRoot(rootElement);
// /privacidade e /termos são páginas públicas soltas (ver LegalDocs.tsx) —
// abrem sem login e sem carregar o app.
const legalDoc = legalDocFromPath(location.pathname);
root.render(
  <React.StrictMode>
    <LanguageProvider>
      {legalDoc ? <LegalPage doc={legalDoc} /> : <App />}
    </LanguageProvider>
  </React.StrictMode>,
);
