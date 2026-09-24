import { execSync } from "node:child_process";

// Identificação do código que está no ar: o hash curto do commit (é a
// "versão" de verdade de um site com deploy contínuo) e quando o processo
// subiu. No Render, RENDER_GIT_COMMIT já vem preenchido em build e runtime;
// localmente, pergunta pro git; sem nenhum dos dois, "dev".
// O front-end recebe o mesmo hash no build (ver vite.config.ts).
export function resolveCommit() {
  const fromHost = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT;
  if (fromHost) return fromHost.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

export const buildInfo = {
  commit: resolveCommit(),
  startedAt: new Date().toISOString(),
};
