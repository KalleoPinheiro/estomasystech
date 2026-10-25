import { existsSync, readdirSync, readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { nextReleaseVersion } from "./src/lib/release-version";

// Content-Security-Policy saiu daqui (issue #76): precisa de um nonce por
// request, gerado em `src/proxy.ts` — headers() estáticos do next.config não
// têm acesso à requisição.
export const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  // Issue #219: o app não depende de janela de outra origem (o único
  // window.open é `noopener`) e as fotos só são consumidas pelo próprio app.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

/**
 * Maior corpo que o proxy bufferiza (#213): foto de 5 MB (`MAX_PHOTO_BYTES`)
 * mais a folga do multipart (`conditionId`, `note`, delimitadores). Sem isso
 * valia o padrão de 10 MB, e a rota só recusava a foto depois de ler tudo.
 */
export const PROXY_CLIENT_MAX_BODY_SIZE = "6mb";

/** Homologação e preview não aparecem em buscadores (ADR-041). */
export const NOINDEX_HEADER = { key: "X-Robots-Tag", value: "noindex, nofollow" };

const isHomologation = ["staging", "preview"].includes(process.env.APP_ENV ?? "");

/**
 * Versão do `package.json` embutida no build (ADR-043). O SHA só vai para homologação e
 * preview: em produção a tela mostra apenas a versão.
 */
export const APP_VERSION: string = JSON.parse(
  readFileSync("package.json", "utf8"),
).version;

/**
 * Changesets pendentes (`.changeset/*.md`, menos o README): sem eles a release já foi versionada e
 * vale o `package.json`.
 */
function pendingChangesets(dir = ".changeset"): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .map((file) => readFileSync(`${dir}/${file}`, "utf8"));
}

/** Release em andamento (ADR-066): o `package.json` só sobe no `release:prepare`. */
export const RELEASE_VERSION: string = nextReleaseVersion(APP_VERSION, pendingChangesets());

const nextConfig: NextConfig = {
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
    NEXT_PUBLIC_RELEASE_VERSION: RELEASE_VERSION,
    // Fuso da clínica para o cliente (#543): sem segredo, igual ao do servidor.
    NEXT_PUBLIC_APP_TIMEZONE: process.env.APP_TIMEZONE?.trim() || "America/Sao_Paulo",
    NEXT_PUBLIC_APP_COMMIT: isHomologation
      ? (process.env.VERCEL_GIT_COMMIT_SHA ?? "")
      : "",
  },
  // Issue #219: não anuncia `X-Powered-By: Next.js` em toda resposta.
  poweredByHeader: false,
  output: "standalone",
  experimental: { proxyClientMaxBodySize: PROXY_CLIENT_MAX_BODY_SIZE },
  // O indicador de dev tools (<nextjs-portal>) fica fixo no canto da tela e
  // intercepta cliques em elementos reais ali embaixo (ex.: botão "Sair" da
  // sidebar) — atrapalha o Playwright em modo dev sem existir em produção.
  devIndicators: false,
  // ADR-069: imagem autenticada (`/api/**`) nunca passa pelo otimizador — ele busca sem
  // cookie (401) e guardaria o arquivo num cache de disco sem escopo de empresa. Só os
  // ativos públicos entram; o resto é recusado (400) mesmo que esqueçam `unoptimized`.
  images: { localPatterns: [{ pathname: "/brand/**" }, { pathname: "/icons/**" }] },
  serverExternalPackages: ["pg", "@electric-sql/pglite", "googleapis"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: isHomologation ? [...SECURITY_HEADERS, NOINDEX_HEADER] : SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
