---
title: "Linha de base de performance do front (Next.js) — 2026-10"
status: frozen
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-24
related:
  - docs/adr/069-dados-no-servidor-e-politica-de-cache.md
  - docs/engineering/performance-baseline.md
  - docs/engineering/architecture.md
---

# Linha de base de performance do front (Next.js) — 2026-10

> **TL;DR:** o app usa o Next.js 16.4 como um SPA. **33 de 34 páginas são `'use client'`** e buscam o dado no navegador depois de hidratar; não há Server Action, `loading.tsx` nem `error.tsx`. No celular (CPU 4x, 1,6 Mbps) a tela pinta em ~0,8 s, mas o dado só chega em **~2,9 s** (mediana) e **18 de 28 rotas** passam de 2,5 s de LCP. O JavaScript por rota fica entre **195 e 239 KB gzip** (650 a 783 KB descomprimidos), quase todo compartilhado. O CLS é ruim em Hoje (0,81), Configurações (até 1,10), Portal (0,33) e, no desktop, em 18 de 28 rotas (~0,18). **Hidratação: nenhum erro ou aviso** nas 448 cargas da matriz (§ 5). Achado de segurança e funcional: **fotos clínicas passam pelo otimizador de imagem, que busca a foto sem a sessão e recebe 401** (§ 4). Esta é a régua de comparação da frente de performance do Next ([#541](https://github.com/KalleoPinheiro/estomasystech/issues/541), [ADR-069](../adr/069-dados-no-servidor-e-politica-de-cache.md)); é um retrato e não é editado.

## 1. Ambiente e método

| Item | Valor |
| --- | --- |
| Código | `release/v0.2.0` @ `8902341` (2026-10-24), Next.js **16.4.2** (Turbopack), React 19.2.8, `reactCompiler: true` |
| Build | `npm run build` + `next start`, `NODE_ENV=production`, CSP estrita com nonce, `compress` padrão (gzip) |
| Banco | PGlite (`ESTOMASYSTECH_DB_DRIVER=pglite`), semente do `e2e/global-setup.ts` (dados fictícios) |
| Navegador | Chromium (Playwright 1.62), sem cache HTTP na carga medida, depois de uma visita de aquecimento |
| Contas | Admin de Empresa (telas da equipe), Super Admin (Plataforma), paciente com portal vinculado, anônimo (telas públicas) |
| Medição | script em `/mnt/project-files/perf-next/linha-base.spec.ts` (copiar para `e2e/`, rodar com `npx playwright test -c playwright.prod.config.ts e2e/linha-base.spec.ts`, apagar depois); bruto em `linha-base-metricas-2026-10-24.jsonl` |

Perfis por largura (emulação por CDP):

| Largura | Dispositivo representado | CPU | Rede |
| --- | --- | --- | --- |
| 360 × 740 | celular Android de entrada | 4x mais lenta | 1,6 Mbps / 150 ms |
| 390 × 844 | iPhone | 4x mais lenta | 1,6 Mbps / 150 ms |
| 768 × 1024 | tablet | 2x mais lenta | 9 Mbps / 40 ms |
| 1280 × 800 | desktop | sem limitação | sem limitação |

**O que cada métrica quer dizer aqui**

- **JS gz / bruto:** soma de todos os `.js` baixados pela rota (transferido com gzip / descomprimido).
- **Chamadas /api:** requisições `fetch` a `/api/*` feitas pelo navegador até a rede ficar ociosa. Mede a cascata cliente → servidor que a migração para Server Components elimina.
- **Dados prontos:** fim da última chamada `/api` (ms desde o início da navegação). É o momento em que a tela deixa de ser esqueleto. Quando o LCP sai igual ao FCP, o maior elemento foi o esqueleto e o LCP subestima a espera real: olhe "dados prontos".
- **TTFB não entra na régua:** com PGlite na mesma máquina ele fica em 10 a 20 ms e não representa produção. Medir TTFB na staging e em produção é parte do último ticket da frente.
- **INP não é medido em laboratório:** depende de interação real. Como substituto, "long tasks" soma o tempo acima de 50 ms das tarefas longas durante a carga (pior caso para a primeira interação). O INP de campo entra pelo ticket de Web Vitals.

## 2. Resumo por largura

| Largura | FCP mediana (ms) | LCP mediana (ms) | LCP pior (ms) | Dados prontos mediana (ms) | CLS mediana | CLS pior | Rotas com LCP > 2,5 s | Rotas com CLS > 0,1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 360 | 824 | 2 716 | 3 136 | 2 886 | 0,00 | 0,82 | 18/28 | 6/28 |
| 390 | 832 | 2 712 | 3 184 | 2 861 | 0,00 | 1,10 | 18/28 | 5/28 |
| 768 | 228 | 696 | 844 | 705 | 0,00 | 0,94 | 0/28 | 5/28 |
| 1280 | 92 | 240 | 336 | 215 | 0,18 | 0,72 | 0/28 | 18/28 |

Limites de referência (Core Web Vitals, "bom"): LCP ≤ 2,5 s, CLS ≤ 0,1, INP ≤ 200 ms.

## 3. Por rota

360 px é o pior caso do celular; 1280 px é o desktop. JS e chamadas `/api` são iguais nas quatro larguras (± 1 chamada no desktop, que carrega um item a mais da barra lateral).

| Rota | JS gz (KB) | JS bruto (KB) | Chamadas /api | LCP 360 | Dados prontos 360 | CLS 360 | LCP 1280 | Dados prontos 1280 | CLS 1280 | Long tasks 360 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `/login` | 210 | 692 | 1 | 2760 | 2695 | 0.13 | 68 | 168 | 0.01 | 217 |
| `/esqueci-senha` | 197 | 658 | 0 | 828 | — | 0.00 | 64 | — | 0.00 | 184 |
| `/definir-senha?token=invalido` | 198 | 661 | 0 | 828 | — | 0.00 | 92 | — | 0.00 | 118 |
| `/privacidade` | 195 | 652 | 0 | 816 | — | 0.00 | 68 | — | 0.00 | 163 |
| `/` (Hoje) | 220 | 720 | 8 | 824 | 2935 | 0.81 | 336 | 306 | 0.55 | 191 |
| `/agenda` | 228 | 745 | 6 | 2784 | 2785 | 0.10 | 248 | 213 | 0.22 | 205 |
| `/pacientes` | 216 | 708 | 3 | 2724 | 2640 | 0.00 | 320 | 274 | 0.18 | 139 |
| `/pacientes/[id]` | 239 | 783 | 8 | 2900 | 3199 | 0.00 | 312 | 341 | 0.18 | 224 |
| `/triagem` | 213 | 698 | 2 | 2816 | 2965 | 0.00 | 240 | 233 | 0.18 | 277 |
| `/faturamento` | 219 | 719 | 3 | 2772 | 2935 | 0.00 | 260 | 227 | 0.18 | 190 |
| `/repasses` | 216 | 709 | 3 | 3100 | 3056 | 0.00 | 240 | 198 | 0.18 | 178 |
| `/materiais` | 218 | 714 | 3 | 2728 | 2894 | 0.09 | 264 | 215 | 0.19 | 193 |
| `/procedimentos` | 216 | 706 | 2 | 2696 | 2852 | 0.08 | 296 | 264 | 0.19 | 196 |
| `/profissionais` | 214 | 704 | 2 | 2664 | 2825 | 0.00 | 216 | 191 | 0.18 | 161 |
| `/parceiros` | 213 | 700 | 2 | 820 | 2651 | 0.00 | 76 | 204 | 0.18 | 191 |
| `/relatorios` | 213 | 702 | 3 | 2716 | 2886 | 0.00 | 268 | 222 | 0.18 | 168 |
| `/auditoria` | 214 | 702 | 2 | 2740 | 2939 | 0.00 | 316 | 273 | 0.18 | 183 |
| `/pedidos-titular` | 213 | 698 | 2 | 2776 | 2934 | 0.00 | 272 | 241 | 0.18 | 248 |
| `/configuracoes` | 232 | 756 | 13 | 3136 | 3291 | 0.82 | 284 | 327 | 0.72 | 193 |
| `/minha-conta` | 223 | 726 | 2 | 824 | 2751 | 0.00 | 76 | 180 | 0.18 | 228 |
| `/mais` | 209 | 690 | 1 | 2684 | 2652 | 0.26 | 216 | 203 | 0.34 | 209 |
| `/documentos/consentimento/[id]` | 211 | 696 | 4 | 2956 | 2893 | 0.00 | 248 | 203 | 0.00 | 233 |
| `/plataforma` | 200 | 665 | 1 | 816 | 2653 | 0.00 | 72 | 183 | 0.00 | 164 |
| `/plataforma/auditoria` | 202 | 668 | 1 | 828 | 2704 | 0.00 | 88 | 190 | 0.00 | 202 |
| `/plataforma/taxonomia` | 199 | 662 | 0 | 840 | — | 0.02 | 64 | — | 0.00 | 192 |
| `/plataforma/clinicas/nova` | 200 | 665 | 0 | 820 | — | 0.01 | 92 | — | 0.00 | 161 |
| `/plataforma/minha-conta` | 218 | 713 | 1 | 2716 | 2660 | 0.00 | 224 | 198 | 0.00 | 170 |
| `/portal` | 223 | 735 | 8 | 3068 | 3167 | 0.26 | 308 | 288 | 0.15 | 237 |

Ficaram de fora desta medição, por exigirem dado montado à mão: os outros cinco documentos imprimíveis (`/documentos/{atestado,plano-cuidados,recibo,relatorio,repasse}`) e `/plataforma/clinicas/[id]`. Seguem o mesmo padrão (`'use client'` + 4 a 5 chamadas `/api`) e entram na medição do ticket que os migrar.

## 4. Auditoria do código

| Item | Hoje | Onde |
| --- | --- | --- |
| Páginas `'use client'` | **33 de 34** (só `/privacidade` é Server Component) | `src/app/**/page.tsx` |
| Arquivos `'use client'` em `src/` | 126 | — |
| Leitura de dado | no navegador, por `useApiQuery` / `usePagedQuery` / `useCursorPagedQuery` → `apiFetch` (`cache: 'no-store'`) | `src/lib/use-*-query.ts`, `src/lib/client.ts` |
| Mutações | 97 chamadas `POST/PUT/PATCH/DELETE` a `/api/*` pelo cliente; **0 Server Actions** | telas e `src/components` |
| Route Handlers | 141 (`route.ts`) | `src/app/api/**` |
| `loading.tsx` / `error.tsx` / `not-found.tsx` | **0 / 0 / 0** (esqueleto montado à mão em cada tela) | — |
| `<Suspense>` | 2 usos | — |
| Layouts | 22, todos Server Components; o da equipe embrulha tudo num `StaffLayoutClient` que busca a identidade da barra lateral pelo cliente | `src/app/(staff)/staff-layout-client.tsx` |
| Renderização | `export const dynamic = 'force-dynamic'` no layout raiz (exigência da CSP com nonce, issue #76) | `src/app/layout.tsx` |
| Cache de dado no servidor | só o relatório de mês fechado, em memória, chaveado por empresa | `src/lib/report-cache.ts` |
| `fetch` no servidor | Resend e rastreador de erros, sem `cache` explícito nem tempo limite | `src/infrastructure/email/resend-email-gateway.ts`, `src/lib/observability/error-tracker.ts` |
| `next/link` | 22 importações; **22 `<a>` crus**, parte interna (`/configuracoes#dados`, `/`, ficha do paciente) e parte legítima (`wa.me`, documento em nova aba) | ver tickets por domínio |
| `next/image` | 6 usos; **fotos clínicas sem `unoptimized`** (abaixo) | `triage-photo-list.tsx`, `condition-photos.tsx`, `portal/condition-progress.tsx`, `portal/consent-card.tsx` |
| `next/font` | adotado (`next/font/local`, três fontes variáveis com `display: swap`) | `src/app/layout.tsx` |
| `next/dynamic` / `lazy` | nenhum | — |
| Web Vitals de campo | não coletados | — |

### Achado: fotos clínicas pelo otimizador de imagem

`<Image src="/api/photos/:id">` sem `unoptimized` vira `/_next/image?url=/api/photos/:id&w=…`. O otimizador do Next busca a origem com uma requisição interna **sem cabeçalhos** (`fetchInternalImage`, `headers: {}` em `node_modules/next/dist/server/image-optimizer.js`), ou seja, sem o cookie da sessão:

| Requisição (build local, com cookie de Admin) | Status |
| --- | ---: |
| `GET /api/photos/inexistente` | 404 (passou pela autenticação) |
| `GET /_next/image?url=%2Fapi%2Fphotos%2Finexistente&w=96&q=75` | **401** (a sessão não chega à rota) |

O log do servidor confirma: `⨯ internal image response failed for /api/photos/inexistente 401`.

Consequência: com armazenamento de fotos ligado, as miniaturas da triagem, da ficha e do portal não carregam. E se a rota algum dia aceitasse a busca interna, a foto otimizada ficaria no cache em disco `.next/cache/images`, servido a qualquer requisição com a mesma URL, de qualquer clínica. A [ADR-069](../adr/069-dados-no-servidor-e-politica-de-cache.md) proíbe o otimizador para imagem autenticada; a correção é o primeiro ticket da frente ([#542](https://github.com/KalleoPinheiro/estomasystech/issues/542)).

## 5. Hidratação

Matriz: 28 rotas × 4 larguras × tema claro e escuro × (São Paulo, `pt-BR`) e (Tóquio, `en-US`) = **448 cargas** no build de produção. Captura de `console` (erro e aviso) e `pageerror` filtrando `hydrat`, `#418`, `#423`, `#425`, `did not match` e `server rendered`.

| Resultado | Quantidade |
| --- | ---: |
| Cargas com erro ou aviso de hidratação | **0 de 448** |
| Outros erros de console | 16 de 448, todos em `/minha-conta`: um recurso responde 404 na carga (em todas as combinações; investigar no ticket de Configurações e Minha conta) |

**CSP:** a matriz só carrega as páginas, sem interação, e não viu violação. Abrindo um modal (Agenda → "+ Nova consulta") o console registra `Applying inline style violates … 'style-src-elem 'self' 'nonce-…''`: o `<style>` do bloqueio de rolagem do Radix (`react-remove-scroll` → `react-style-singleton` → `get-nonce`) sai sem nonce ([#562](https://github.com/KalleoPinheiro/estomasystech/issues/562)). A guarda permanente de console abre um modal por tela.

O zero de hoje tem uma razão que **vai mudar com a migração**: quase nada é renderizado no servidor (o dado chega depois da hidratação, só no navegador). Os formatadores de data e hora (`formatDate`, `formatTime` em `src/lib/format.ts`) usam o fuso do ambiente que roda o código. Quando a mesma data for renderizada no servidor (fuso do processo, `America/Sao_Paulo`) e hidratada num navegador em outro fuso, o texto difere e o React acusa erro de hidratação. Por isso o ticket da guarda de hidratação vem antes das migrações e fixa o fuso dos formatadores.

## 6. O que se espera depois da frente

Metas por ticket estão nas sub-issues da [#541](https://github.com/KalleoPinheiro/estomasystech/issues/541) (#542 a #560). Em resumo, para cada rota migrada, medida com o mesmo script e os mesmos perfis:

- **Dados prontos ≤ FCP + 300 ms** no 360 (o dado vem no HTML), e zero chamadas `/api` na carga inicial (salvo paginação, busca e rota de arquivo).
- **LCP ≤ 2,5 s** em 360 e 390.
- **CLS ≤ 0,1** em todas as larguras.
- **JS da rota menor ou igual ao da linha de base**, com a página sem `'use client'`.
- **Nenhum erro de hidratação novo.**
