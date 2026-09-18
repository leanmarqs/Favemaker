import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
