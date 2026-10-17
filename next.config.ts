import type { NextConfig } from "next";

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

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Issue #219: não anuncia `X-Powered-By: Next.js` em toda resposta.
  poweredByHeader: false,
  output: "standalone",
  experimental: { proxyClientMaxBodySize: PROXY_CLIENT_MAX_BODY_SIZE },
  // O indicador de dev tools (<nextjs-portal>) fica fixo no canto da tela e
  // intercepta cliques em elementos reais ali embaixo (ex.: botão "Sair" da
  // sidebar) — atrapalha o Playwright em modo dev sem existir em produção.
  devIndicators: false,
  serverExternalPackages: ["pg", "@electric-sql/pglite", "googleapis"],
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
