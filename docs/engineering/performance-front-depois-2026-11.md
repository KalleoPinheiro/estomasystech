---
title: "Performance do front — retrato de 2026-11 (ficha, lista e agenda)"
status: frozen
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-16
related:
  - docs/engineering/performance-front-linha-de-base-2026-10.md
  - docs/adr/080-ficha-do-paciente-no-servidor.md
  - docs/adr/086-web-vitals-de-campo-no-log-estruturado.md
---

# Performance do front — retrato de 2026-11 (ficha, lista e agenda)

> **TL;DR:** a meta de 215 KB gz de JS da ficha ([#615](https://github.com/KalleoPinheiro/estomasystech/issues/615), [#559](https://github.com/KalleoPinheiro/estomasystech/issues/559)) **não é alcançável** com React, Next e `@still-void/ui`: a ficha só tem 17,8 KB próprios. A meta passa a ser **«nenhuma rota acima da sua linha de base»**. O ganho que sobrou no celular era de estabilidade: a ficha tinha CLS 0,49 em 390 px e hoje fica em no máximo 0,06. Este retrato mede só as três rotas abaixo; a matriz completa de 28 rotas da linha de base não foi repetida. É um retrato e não é editado.

## 1. Ambiente e método

Mesmo da [linha de base](performance-front-linha-de-base-2026-10.md) § 1. JS e CLS «antes»: `main` @ `55a613e`; CLS «depois»: build da branch do PR com a correção do `PageHeader` (base `55a613e`), `npm run build` + `next start`, PGlite com a semente do E2E, Chromium com CPU 4x e rede de 1,6 Mbps / 150 ms em 360 e 390 px, sem cache HTTP, três rodadas. JS é a soma dos `.js` baixados pela rota, com gzip.

## 2. JS por rota (administrador de empresa)

| Rota | JS gz (KB) | Linha de base 2026-10 (KB) |
| --- | ---: | ---: |
| `/pacientes/[id]` (ficha) | 236,9 | 239 |
| `/pacientes` | 228,7 | 218 a 239 (faixa da matriz) |
| `/agenda` | 243,4 | — |

A ficha abre sem chamada `/api`, com FCP e LCP de 0,84 s em 360 e 390 px (a linha de base tinha LCP de 2,9 s).

## 3. De onde vêm os 236,9 KB da ficha

| Bloco | gz (KB) |
| --- | ---: |
| React, react-dom, bootstrap e roteador do Next | ~148 |
| `@still-void/ui`, entrada de cliente (radix, um chunk só) | 43,9 |
| `@still-void/ui`, entrada de servidor (Card, Alert, Pagination…) | 13,9 |
| Casca da equipe e demais | ~13 |
| **Código da ficha** (`PatientRecordClient` e Anamnese) | **17,8** |

As abas Condições, Evoluções e Plano de cuidados já carregam sob demanda ([ADR-080](../adr/080-ficha-do-paciente-no-servidor.md) item 7). Faltam 22 KB para 215 KB; zerar todo o código da ficha deixaria a rota em ~219 KB. O chunk de cliente da biblioteca entra inteiro (o Select do radix vai sem uso; um teste descartável que o removeu deu −4,3 KB gz em todas as rotas). Dividir esse pacote é decisão futura (issue P3).

## 4. CLS da ficha

Antes: 0,49 em 390 px (reproduzia nas três rodadas, nome de 22 letras). O selo «Ativo» ficava numa linha `flex-wrap` ao lado do título e mudava de linha a cada fonte que terminava de carregar (Manrope, depois Sora): a tela abaixo do título saltava 36 px duas vezes. Correção: o selo não troca mais de linha (`PageHeader`: linha sem `flex-wrap`, título com `min-w-0` e quebra interna). Varredura depois, 19 nomes de 8 a 44 letras, ficha, CPU 4x e rede de celular:

| Largura | CLS máximo |
| --- | ---: |
| 360 | 0,031 |
| 390 | 0,057 |
| 768 | 0,000 |
| 1280 | 0,000 |

Meta do #559: CLS ≤ 0,1. Guarda automática: `e2e/ficha-sem-salto-de-layout.spec.ts` (selo ao lado do título e CLS ≤ 0,1, em 360 e 390 px, com nome curto, no limite e longo).

## 5. O que já estava pronto do #559

Web Vitals de campo ([ADR-086](../adr/086-web-vitals-de-campo-no-log-estruturado.md)), `optimizePackageImports` do `@still-void/ui` e os `fetch` do servidor (Resend e rastreador de erros) com `cache: 'no-store'` e `AbortSignal.timeout`. Removido nesta entrega: `usePagedQuery` (offset), sem nenhum consumidor. `useApiQuery` fica enquanto a casca da equipe o usar.
