---
title: "Troubleshooting"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-07
---


# Troubleshooting

**Formato de cada linha:** sintoma *literal* (o que aparece na tela/log) → causa → ação. Resolveu
algo que não está aqui? Adicione a linha no mesmo PR.

## Boot e autenticação

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| `503` em toda rota | sem `AUTH_SECRET` | defina `AUTH_SECRET` (não existe modo sem login) |
| bootstrap responde `403` | já existe conta, ou `x-bootstrap-token` ≠ `ESTOMASYSTECH_BOOTSTRAP_TOKEN` | instalação com contas: use "esqueci minha senha" |
| convite/reset não chega | fora de produção sem `RESEND_API_KEY`/`EMAIL_FROM` o gateway é dry-run | o link está no log: `[e-mail desativado] Para fu***@x.com — …` (destinatário mascarado; o link só sai fora de produção) |
| convite do bootstrap não chega em produção | sem `RESEND_API_KEY`/`EMAIL_FROM` o canal da plataforma fica desativado ([ADR-011](../adr/011-canal-de-comunicacao-por-clinica.md)) | use o `inviteUrl` da resposta do `POST /api/auth/bootstrap`, ou defina as duas e reinicie |

## Ambiente e build

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| porta `5432`/`3000` ocupada | outro serviço na porta | `POSTGRES_PORT=`/`APP_PORT=` no compose, ou ajuste `DATABASE_URL` na Via B |
| build morre com `Ineffective mark-compacts near heap limit` | heap padrão do V8 | já mitigado por `--max-old-space-size=4096`; se persistir, suba o valor em `package.json` — nunca remova |
| build da Vercel: `SECURITY WARNING: The SSL modes 'prefer', 'require', and 'verify-ca' are treated as aliases for 'verify-full'` | a `DATABASE_URL` da integração Neon traz `sslmode=require`, que o `pg` hoje trata como `verify-full` e na v9 passa a não verificar o certificado | resolvido (EST-20, #688): `enforceVerifyFull` (`src/lib/database-url.ts`) reescreve esses modos para `sslmode=verify-full` no pool do app, no `drizzle.config.ts` e nos passos do `scripts/vercel-build.ts`. URL sem `sslmode` (banco interno do Coolify/compose, Postgres local) segue sem SSL, de propósito |
| build da Vercel: `npm warn ERESOLVE overriding peer dependency` (`msw@3.0.3` x `@vitest/mocker` `peerOptional msw@^2.4.9`) | o `@vitest/mocker` só usa o `msw` no modo browser do Vitest, que o projeto não usa; o `msw` 3 é o do MSW de homologação | resolvido: `overrides` em `package.json` aponta o peer opcional do `@vitest/mocker` para o `msw` da raiz (`$msw`). Revise ao subir o Vitest ou o `msw` |
| build da Vercel: `npm warn EBADENGINE ... required: { npm: '11.21.1' }, current: { npm: '11.19.1' }` | `engines.npm` fixa o npm do corte ([ADR-091](../adr/091-npm-fixado-e-lockfile-protegido-no-corte.md), guardado por `tests/scripts/release-lockfile.test.ts`) e a Vercel traz o npm dela | **aceito, não corrigido**: é aviso (sem `engine-strict`) e relaxar o `engines.npm` quebraria o teste do ADR-091. Para zerar, ligue `ENABLE_EXPERIMENTAL_COREPACK=1` no projeto da Vercel (usa o `packageManager`); decisão do Kalléo. `engines.node` passou a `>=24.11` (o Node do CI) |
| build da Vercel: `npm warn install-scripts 3 packages have install scripts not yet covered by allowScripts` (`esbuild` 0.18, 0.25 e 0.28) | o npm 11.21 avisa dependência com `postinstall` fora do `allowScripts` | resolvido: `"allowScripts": { "esbuild": true }` em `package.json` (por nome, para não voltar a cada versão nova; o `postinstall` do esbuild só valida o binário). Pacote novo com script volta a avisar: revise antes de aprovar com `npm approve-scripts` |
| build da Vercel: `npm warn Unknown env config "cache-dir"` | o repo não tem `.npmrc` nem `cache-dir` em lugar nenhum: vem de uma variável de ambiente do projeto na Vercel (`npm_config_cache-dir`/`NPM_CONFIG_CACHE_DIR`); o nome suportado é `cache` | **pendente no painel da Vercel** (Settings → Environment Variables): apagar a variável ou renomear para `NPM_CONFIG_CACHE`. Não há o que corrigir no código |
| `npm run build` falha no type check apontando erro de sintaxe/tipo em `.next/dev/types/validator.ts` (arquivo que ninguém editou) | rodar `next dev` (ex.: E2E local) e encerrá-lo no meio (Playwright mata o processo) pode truncar `.next/dev/types/validator.ts`, que o Next regrava continuamente durante o dev; `.next/dev` é o `distDir` usado em modo dev (`server/config.js`: `distDir = path.join(distDir, 'dev')`) e o tsconfig gerado inclui tanto `.next/types/**/*.ts` quanto `.next/dev/types/**/*.ts` para não precisar reescrever o `include` ao alternar dev/build (`lib/typescript/type-paths.js`) | contorno: `rm -rf .next/dev` antes de repetir o `build`. `next@16.3.6` já filtra `.next/dev/types` do type check quando builda (`lib/typescript/runTypeCheck.js`, `NODE_ENV !== 'development'`), então o sintoma não deveria mais aparecer nesta versão; se aparecer mesmo assim (versão mais antiga do Next, ou o filtro regredir), o `prebuild` do `package.json` já limpa `.next/dev/types` antes de cada `next build` |

## Regras de negócio que parecem bug

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| consulta rejeitada com `400` | fora do horário comercial (seg–sex 08h–18h, `TZ`) | ajuste o horário ou o `TZ` |
| consulta rejeitada com `409` | conflito de agenda (folga mínima de 15 min) | escolha outro horário |

## Testes

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| E2E intermitente: modal não fecha, aba ou item não aparece, `[Fast Refresh] rebuilding` no trace | o `next dev` compila sob demanda e refaz o Fast Refresh no meio do teste, pior em máquina lenta (#308) | rode a suíte contra o build: `npm run build && npm run test:e2e:prod`; só os specs de `ROLE_ACCOUNT_SPECS` ficam no `next dev`. Não suba `retries` nem timeouts ([ADR-021](../adr/021-e2e-contra-build-de-producao.md)) |
| `readiness`/`health-route` falham de vez em quando em máquina carregada (`database: 'fail'`) | `vi.resetModules()` no `afterEach` descarta o PGlite aquecido e a partida a frio (~1 s) cai dentro do prazo de 3 s de `checkReadiness` (#359) | abra o banco **dentro** do teste (`warmDatabase()`), depois do reset e antes de chamar `checkReadiness`; não suba o prazo de produção |
| E2E falha só ao reaproveitar `npm run dev` | `E2E_AUTH_SECRET`/`E2E_BOOTSTRAP_TOKEN` diferentes de `AUTH_SECRET`/`ESTOMASYSTECH_BOOTSTRAP_TOKEN` do servidor | use os mesmos valores, ou deixe a suíte subir o próprio servidor |
| `check:sv` falha com `sv-gap órfão` | comentário `// sv-gap: <slug>` sem seção em `docs/still-void-gaps.md` | adicione a seção ou troque pelo componente `@still-void/ui` |
| `check:docs` falha com `file:line -> target` | link relativo para arquivo que não existe | corrija o caminho; se o arquivo mudou de lugar, atualize todos os links vivos |
