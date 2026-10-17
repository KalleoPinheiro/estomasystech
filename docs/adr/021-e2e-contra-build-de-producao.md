---
title: "ADR 021 — E2E principal contra o build de produção"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-17
related: [docs/engineering/onboarding.md, docs/engineering/troubleshooting.md]
---

# ADR 021 — E2E principal contra o build de produção

- **Data:** 2026-10-17
- **Status:** aceito (causa raiz da [#308](https://github.com/KalleoPinheiro/vitta-flow/issues/308); decisão de arquitetura da sessão coordenadora do projeto)
- **Domínios afetados:** engenharia (CI, suíte E2E)

## Contexto

O job "E2E (Playwright)" falhava de forma intermitente: o mesmo código passava numa execução e
caía noutra, sempre depois da suíte inteira e com `retries: 1`. A suíte rodava contra `next dev`
(Turbopack), que compila cada rota na primeira visita e, quando o navegador conecta o HMR, ainda
emite `[Fast Refresh] rebuilding` por vários segundos em máquina lenta. Esse rebuild cai no meio do
teste: o modal não fecha, a aba não aparece, o clique se perde.

Evidência (local, sem CI, que estava sem cota): `e2e/clinico.spec.ts` "cria condição (ferida) e
registra avaliação PUSH", 20 repetições com `--retries 0` e 1 CPU.

| Servidor | Falhas | Duração |
| --- | --- | --- |
| `next dev` | 9 em 20 (e 10 em 20 com aquecimento de rotas no `global-setup`) | 22 min |
| `next start` (build de produção) | 0 em 20 | 1,6 min |

Os traces das falhas mostram `[Fast Refresh] rebuilding` durante as ações do teste. Aquecer as
rotas antes da suíte foi tentado e descartado: não reduziu as falhas.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — aumentar `retries` ou timeouts | zero código novo | mascara; contraria a regra 7 do AGENTS.md |
| B — aquecer as rotas no `global-setup` | mantém `next dev` | testado: não resolveu |
| C — suíte principal contra `next start`, `next dev` só onde é inevitável | determinística, igual ao artefato de produção, 14× mais rápida | o convite das contas por papel só sai no log fora de produção (CWE-532), então esses specs ficam no `next dev` |

## Decisão

Opção C. `playwright.prod.config.ts` roda todos os specs contra `npm run start`, sem retry,
exceto o modo aberto e `ROLE_ACCOUNT_SPECS` (`e2e/support/constants.ts`). Esses specs
(`papeis-*`, `sessao-expirada`, `feriados-ausencias-profissional`) dependem do convite no log do
`NullEmailGateway`, que só aparece fora de produção; continuam em `playwright.config.ts` (`next dev`)
junto com `auth.spec.ts` (modo aberto). Scripts: `test:e2e:prod`, `test:e2e:dev` e `test:e2e`
(build + os dois).

## Consequências

- O gate principal do E2E é o mesmo artefato que vai para produção, com CSP estrita.
- O subconjunto em `next dev` é pequeno (26 testes) e ainda exposto ao Fast Refresh; um spec de
  papel intermitente deve ser migrado para o build assim que as contas por papel puderem ser
  provisionadas sem o log do servidor.
- Spec novo roda no build por padrão; só entra em `ROLE_ACCOUNT_SPECS` quem precisa de conta por papel.
