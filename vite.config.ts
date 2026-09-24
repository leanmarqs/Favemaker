import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolveCommit } from "./server/buildInfo.mjs";

// Commit e data do build, embutidos no front-end (ver build-info.d.ts e a
// linha de versão no fim da página Conta) — a "versão" do site pra quem
// precisa saber exatamente qual código um usuário estava usando.
const APP_COMMIT = resolveCommit();
const APP_BUILD_DATE = new Date().toISOString();
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_COMMIT__: JSON.stringify(APP_COMMIT),
    __APP_BUILD_DATE__: JSON.stringify(APP_BUILD_DATE),
  },
  server: {
    port: 3000,
    strictPort: true,
    host: "0.0.0.0",
    // cors:false evita que o CORS embutido do Vite responda a requisições OPTIONS de
    // /api antes do proxy — assim quem decide o CORS de /api é sempre o próprio
    // servidor Express (necessário para a extensão de navegador autenticar).
    cors: false,
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
});
