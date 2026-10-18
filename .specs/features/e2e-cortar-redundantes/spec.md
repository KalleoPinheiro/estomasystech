# Cortar cenários E2E redundantes com cobertura unit/integration equivalente

**Escopo**: Large pelo tamanho (19 arquivos, 86 testes auditados), mas sem ambiguidade de
negócio — a regra de corte já foi decidida na issue #113 (ver `Contexto`). Sem `discuss.md`.
Sem `design.md` (nenhuma decisão arquitetural nova — é curadoria de suíte de testes). Sem
`tasks.md` formal — o levantamento por arquivo em `levantamento.md` já é a unidade de trabalho;
cada corte vira um commit atômico (ver seção Execução).

## Contexto

19 specs e2e (86 testes) rodam serializados (`workers: 1`, `fullyParallel: false` — PGlite
compartilhado por um único processo de servidor dev; restrição arquitetural aceita, ver
AGENTS.md e `playwright.config.ts`). Suspeita de origem (issue #113): alguns cenários e2e
reprovam regra de negócio que unit/integration já garante, sem agregar valor de integração real
(auth, rotas, DB, UI).

## Regra de corte (decidida na issue, não é gray area)

Cortar um cenário e2e **somente quando**:

1. A MESMA lógica de negócio testada pelo cenário já tem cobertura unit/integration equivalente
   (mesma regra, mesmo caminho de decisão) — confirmada por leitura direta do teste equivalente,
   nunca presumida.
2. O cenário e2e, removido, não agrega verificação de integração real que não exista em outro
   lugar: nenhuma checagem de UI (renderização/mensagem/estado visível), nenhum mapeamento de
   erro de domínio → resposta HTTP não testado alhures, nenhuma fronteira de auth/RBAC/tenant.
3. A jornada completa (login → navegação → ação → resultado visível) do mesmo fluxo continua
   coberta por **pelo menos um outro** e2e do mesmo arquivo/fluxo.

Se qualquer um dos três não se confirmar por grep+leitura do teste equivalente, o cenário
**fica** — "sem duplicata encontrada" é uma decisão válida e documentada, não uma lacuna.

## Requisitos

- **E2ECUT-01**: Levantamento por spec e2e (19 arquivos) classificando cada teste como lógica de
  negócio pura / integração real / híbrido, com o teste unit/integration equivalente citado
  (caminho:linha) quando existir. Arquivo: `levantamento.md`.
- **E2ECUT-02**: Todo corte é documentado caso a caso — o que foi cortado, por quê, e qual teste
  unit/integration cobre a mesma regra.
- **E2ECUT-03**: Nenhum corte remove a única cobertura e2e de uma jornada completa.
- **E2ECUT-04**: Contagem de testes e tempo de `npm run test:e2e` antes/depois do corte,
  registrada neste spec.
- **E2ECUT-05**: Gate local (typecheck, lint, check:sv, test:coverage ≥90%, test:e2e) verde após
  os cortes — sem regressão fora de `e2e/**`.

## Fora de escopo

- Paralelizar a suíte e2e (avaliado e descartado na própria issue — não revisitado aqui).
- Robustez do `next dev`/webServer do Playwright ficar vivo entre execuções interrompidas (item 1
  do "Achado fora de escopo" abaixo) — infra local, não conteúdo de teste.
- Qualquer mudança em `src/**` — este trabalho toca `e2e/**`, `tests/**`, `vitest.config.mts`,
  `package.json` (lint-staged) e a documentação do spec; nada em código de produção.
- A correção do item 3 (flake de e-mail) saiu do escopo original mas foi feita mesmo assim —
  bloqueava o próprio gate de push desta branch (ver detalhe no item 3 abaixo).

## Achado fora de escopo (não corrigido aqui)

Duas instabilidades pré-existentes do ambiente local de execução e2e, nenhuma causada por este
corte nem por conteúdo de teste:

1. O processo `next dev` do webServer principal do Playwright fica vivo entre execuções
   (`reuseExistingServer: !process.env.CI`) quando uma corrida anterior é interrompida/derrubada
   sem terminar o processo filho, acumulando estado (Super Admin já bootstrapado) e causando
   falhas espúrias de `AUTH_SECRET`/bootstrap 403 na corrida seguinte. Contornado matando os
   processos `next-server` órfãos (porta 3000/3100) antes de cada medição.
2. Mesmo com o ambiente limpo, uma corrida completa da suíte (registrada abaixo) sofreu uma
   falha em cascata: `clinico.spec.ts` começou a lançar `Error: AUTH_SECRET ausente —
   repositórios clínicos cifrados exigem o segredo de autenticação` (erro de servidor, não de
   asserção de teste) e, a partir daí, **todo** teste subsequente do worker serializado falhou —
   inclusive specs sem nenhuma relação com autenticação/dados clínicos (`responsive-tables`,
   `sidebar-responsive`, `relatorios`, `triagem` etc.), confirmando que a causa é um estado
   corrompido do servidor compartilhado, não os testes em si.

Nenhum dos dois é tratado aqui (não é redundância de teste, é robustez de ambiente local de
execução) — fica registrado para eventual issue própria.

3. ~~`npm run test` intermitentemente flaky em `reset-password-flow.test.ts`/
   `set-password-route.test.ts`~~ — **investigado e corrigido nesta branch**, apesar de fora do
   escopo original da issue #113, porque bloqueava o próprio gate de push local. Duas causas
   raiz distintas, ambas em `.env` local vazando pro processo de teste:
   - `accountWithPassword`/`inviteFor` liam o token do e-mail sem `await waitForEmails(...)`
     primeiro (`requestReset`, no mesmo arquivo, já usava o padrão certo) — corrida real contra
     o envio fire-and-forget. Corrigido replicando o padrão correto.
   - `RESEND_API_KEY`/`EMAIL_FROM` reais em `.env` local faziam `buildEmailGateway()`
     (`src/infrastructure/email/resend-email-gateway.ts`) escolher o gateway Resend de verdade
     em vez do `NullEmailGateway` — a suíte inteira depende do dry-run via `console.info`. Sem
     isso, toda rota que envia e-mail batia no rate-limit de sandbox do Resend (403) e nenhum
     e-mail chegava ao spy. Corrigido forçando as duas vars vazias em `vitest.config.mts` (mesmo
     padrão já usado para `AUTH_SECRET`/`ESTOMASYSTECH_ALLOW_OPEN_MODE`).
   Verificado com o vazamento simulado (`RESEND_API_KEY=fake EMAIL_FROM=fake@x.com
   ESTOMASYSTECH_ALLOW_OPEN_MODE=true npm run test`) → 2750/2750 limpo.

## Requirement Traceability

| Requirement ID | Fase | Status |
| --- | --- | --- |
| E2ECUT-01 | Execute | Verified |
| E2ECUT-02 | Execute | Verified |
| E2ECUT-03 | Execute | Verified |
| E2ECUT-04 | Execute | **Incompleto** — contagem/tempo "antes" só até a cascata de `AUTH_SECRET` (18.2min, 42/86); "depois" medido só nos arquivos tocados (`export-lgpd.spec.ts` isolado), não na suíte completa. Bloqueado pela instabilidade de ambiente documentada em "Achado fora de escopo" (item 1-2), não por este corte. Apontado pelo CodeRabbit no PR #120. |
| E2ECUT-05 | Execute | **Incompleto** — typecheck/lint/check:sv/test:coverage verdes; `test:e2e` verde só nos arquivos tocados isolados, não na suíte completa (mesma causa acima). |

## Antes / depois

Evidência real coletada neste ambiente (ver "Achado fora de escopo" para a instabilidade que
impediu uma corrida completa 100% limpa em ambos os lados):

- **Antes do corte** (ambiente limpo, servidores órfãos removidos): corrida completa de
  `npm run test:e2e` — 42/86 passaram antes de uma falha em cascata (`AUTH_SECRET ausente` a
  partir de `clinico.spec.ts`) derrubar o restante do worker serializado; tempo até a falha:
  18.2min. O arquivo tocado por este corte (`export-lgpd.spec.ts`) estava **dentro da faixa que
  passou** antes da cascata — os 3 testes originais passaram limpo.
- **Depois do corte** (re-executado após reverter o corte de `portal-paciente.spec.ts`, ver nota
  do CodeRabbit no PR #120): `npm run test:e2e -- e2e/export-lgpd.spec.ts
  e2e/portal-paciente.spec.ts` — 4 testes, **4 passed**, tempo total: 25.3s. Nenhuma falha de
  conteúdo.
- **Contagem de testes**: 86 → 85 (86 - 1 cortado; o corte de `portal-paciente.spec.ts` foi
  revertido — ver `levantamento.md`).
- **Gate local**: `npx tsc --noEmit` (typecheck) OK · `./node_modules/.bin/biome check .` (lint)
  OK, 506 arquivos · `npm run check:sv` OK · `npm run test:coverage` (unitários) OK — 96.48%
  statements / 90.59% branches / 96.52% functions / 96.69% lines, todos acima do mínimo de 90%.

Não foi possível obter um tempo total "antes/depois" para a suíte e2e completa (86→85 testes) de
ponta a ponta neste ambiente devido à instabilidade documentada acima (cascata de `AUTH_SECRET`
que derruba o worker serializado a partir de `clinico.spec.ts`, não relacionada a este corte).
E2ECUT-04/05 ficam marcados **Incompleto** na tabela de rastreabilidade por essa razão — a
evidência disponível (arquivo tocado verificado isoladamente com 4/4 verde, gate local completo
verde) confirma que o corte não introduziu regressão, mas não substitui uma corrida completa da
suíte.

## Resultado

1 de 86 testes cortados (1.2%) — ver `levantamento.md` para o veredito por arquivo. A suíte é,
na maioria, jornadas de UI com valor de integração real (formulário → API → banco →
renderização) ou fronteiras de auth/RBAC/tenant — poucos cenários eram 100% lógica de negócio
pura duplicada sem toque de UI. O corte inicial de `portal-paciente.spec.ts` (fronteira de
tenant/IDOR) foi revertido após revisão do CodeRabbit no PR #120: os testes unit/integration
citados como equivalentes chamam o route handler em processo, sem passar pelo servidor HTTP
real — não substituem a garantia que só o e2e oferece para esse tipo de fronteira.
