import React from "react";
import ReactDOM from "react-dom/client";
import App from "./Auth";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error(
    "Não foi possível encontrar o elemento principal da aplicação.",
  );
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
