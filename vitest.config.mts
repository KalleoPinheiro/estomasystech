import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // `server-only` lança fora do bundle do Next (é o que protege o cliente); na suíte
      // vale o módulo vazio que o próprio Next usa no servidor.
      "server-only": path.resolve(import.meta.dirname, "./node_modules/next/dist/compiled/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    testTimeout: 20_000,
    // beforeAll de rotas API importa módulos + carrega o snapshot do PGlite
    // (tests/support/pglite-global-setup.ts); folga extra sob paralelismo de
    // workers.
    hookTimeout: 30_000,
    env: {
      TZ: "UTC",
      // Fuso das regras (#205) igual ao do processo da suíte: os testes
      // existentes seguem valendo; os de fuso sobrescrevem localmente.
      APP_TIMEZONE: "UTC",
      // As rotas exigem sessão (src/lib/auth/require-session.ts) — a suíte roda
      // com autenticação LIGADA e assina cookies com este segredo
      // (tests/support/session.ts), em vez de exercitar um caminho sem sessão
      // que não existe em produção. Testes que precisam do cenário "sem auth"
      // sobrescrevem/limpam estas variáveis localmente.
      AUTH_SECRET: "vitest-auth-secret-0000000000000000",
      // why: RESEND_API_KEY/EMAIL_FROM reais em .env local (conveniência de
      // `npm run dev` pra mandar e-mail de verdade) fazem buildEmailGateway()
      // escolher o ResendEmailGateway real em vez do NullEmailGateway — a
      // suíte inteira espera o dry-run (console.info) do gateway nulo.
      RESEND_API_KEY: "",
      EMAIL_FROM: "",
    },
    // Migra o PGlite 1x (todo o processo, não por worker/arquivo) e faz dump
    // do datadir num arquivo temporário — cada arquivo de teste que precisa
    // de um PGlite (tests/setup.ts + os 8 arquivos de tests/infrastructure)
    // carrega esse snapshot via `loadDataDir` em vez de rodar `migrate()` de
    // novo (#111 — maior custo de tempo/máquina da suíte).
    globalSetup: ["tests/support/pglite-global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      include: [
        // Camada 1 de autorização (antigo middleware) — arquivo mais sensível do projeto.
        "src/proxy.ts",
        "src/domain/**",
        "src/application/**",
        "src/infrastructure/**",
        "src/lib/**",
        "src/app/**",
        "src/components/**",
      ],
      exclude: [
        // Composition root — apenas wiring de DI, sem lógica.
        "src/infrastructure/container.ts",
        // Bootstrap de conexão real (pg/pglite) — exercitado indiretamente pelos testes que usam pglite.
        "src/infrastructure/persistence/drizzle/db.ts",
        // Definição de tabelas Drizzle (schema puro, sem lógica) — wiring de FK via
        // closures `.references(() => ...)`, exigido pelo ORM para referências circulares.
        "src/infrastructure/persistence/drizzle/schema.ts",
        // Cliente Google Calendar real — chamada externa, sem valor em unit test.
        "src/infrastructure/calendar/**",
        // Cliente OAuth do Google — chamada HTTP externa real, coberto por E2E de login.
        "src/lib/auth/google-oauth-client.ts",
        // Layouts/loading do App Router — sem branches, cobertos visualmente por E2E.
        "src/app/**/layout.tsx",
        "src/app/**/loading.tsx",
        // Páginas de impressão de documentos — renderização server pura, coberta por E2E.
        "src/app/documentos/**",
      ],
      thresholds: {
        // Piso global: UI (src/app/**, src/components/**) segue medida, sem baixar (ADR-050).
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
        // Camadas de regra: 100% (ADR-046).
        "src/proxy.ts": { lines: 100, functions: 100, branches: 100, statements: 100 },
        "src/domain/**": { lines: 100, functions: 100, branches: 100, statements: 100 },
        "src/application/**": { lines: 100, functions: 100, branches: 100, statements: 100 },
        "src/infrastructure/**": { lines: 100, functions: 100, branches: 100, statements: 100 },
        "src/lib/**": { lines: 100, functions: 100, branches: 100, statements: 100 },
      },
    },
  },
});
