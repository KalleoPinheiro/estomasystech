---
title: "Performance do front — medição final da frente #541 (2026-11)"
status: frozen
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-17
related:
  - docs/engineering/performance-front-linha-de-base-2026-10.md
  - docs/engineering/performance-front-depois-2026-11.md
  - docs/adr/080-ficha-do-paciente-no-servidor.md
  - docs/adr/086-web-vitals-de-campo-no-log-estruturado.md
---

# Performance do front — medição final da frente #541 (2026-11)

> **TL;DR:** com os dados no servidor, as 28 rotas medidas abrem **sem chamada `/api`** (uma exceção: `/minha-conta`, uma), com LCP de 0,83 a 0,94 s em 360 px (era 2,7 a 3,1 s), **0 rotas com LCP > 2,5 s** (era 18/28), **0 rotas com CLS > 0,1** (era 6/28 em 360 e 18/28 em 1280) e **0 erro de hidratação em 448 cargas**. **A meta de JS «nenhuma rota acima da linha de base» não foi atingida: 24 das 28 rotas pesam de 2 a 15 KB gz a mais que em 2026-10** (§ 3). TTFB e LCP na staging **não foram medidos** nesta entrega. Este retrato é `frozen`: não se edita.

## 1. Ambiente e método

Mesmo da [linha de base](performance-front-linha-de-base-2026-10.md) § 1 (script `linha-base.spec.ts`, 28 rotas, quatro larguras, CPU 4x e 1,6 Mbps em 360 e 390 px, sem cache HTTP, depois de uma visita de aquecimento), com estas diferenças: `main` @ `9df8b9f` (Next.js 16.4.5; a linha de base usou 16.4.2), uma rodada por rota (a linha de base também), PGlite com a semente do E2E, contêiner de nuvem (CPU e disco diferentes dos da linha de base). Hidratação: 4 larguras × tema claro e escuro × 2 fusos e locales × 28 rotas. JS por rota: soma dos `.js` baixados, gzip (`encodedBodySize`).

## 2. Resumo por largura

| Largura | FCP mediana (ms) | LCP mediana (ms) | LCP pior (ms) | CLS pior | Rotas com LCP > 2,5 s | Rotas com CLS > 0,1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 360 | 868 | 868 | 940 | 0,04 | 0/28 (era 18/28) | 0/28 (era 6/28) |
| 390 | 860 | 860 | 932 | 0,06 | 0/28 (era 18/28) | 0/28 (era 5/28) |
| 768 | 240 | 240 | 284 | 0,02 | 0/28 | 0/28 (era 5/28) |
| 1280 | 84 | 84 | 220 | 0,01 | 0/28 | 0/28 (era 18/28) |

TTFB mediano local: 21 a 25 ms nas quatro larguras (servidor na mesma máquina; não representa a staging). Chamadas `/api` na carga: 0 em 27 rotas e 1 em `/minha-conta` (a linha de base tinha de 0 a 13 por rota). Como a leitura agora vem no HTML, o «dados prontos» da linha de base (fim da última chamada `/api`) coincide com o primeiro desenho: 0,83 a 0,94 s em 360 px, contra 2 886 ms de mediana antes (o critério era ≤ 1 200 ms).

## 3. JS por rota em 360 px (gz, KB)

| Rota | Linha de base 2026-10 | Agora | Diferença |
| --- | ---: | ---: | ---: |
| `/login` | 210 | 204 | -6 |
| `/esqueci-senha` | 197 | 201 | +4 |
| `/definir-senha?token=invalido` | 198 | 202 | +4 |
| `/privacidade` | 195 | 195 | +0 |
| `/` | 220 | 226 | +6 |
| `/agenda` | 228 | 243 | +15 |
| `/pacientes` | 216 | 229 | +13 |
| `/pacientes/[id]` | 239 | 237 | -2 |
| `/triagem` | 213 | 225 | +12 |
| `/faturamento` | 219 | 228 | +9 |
| `/repasses` | 216 | 225 | +9 |
| `/materiais` | 218 | 230 | +12 |
| `/procedimentos` | 216 | 228 | +12 |
| `/profissionais` | 214 | 227 | +13 |
| `/parceiros` | 213 | 225 | +12 |
| `/relatorios` | 213 | 217 | +4 |
| `/auditoria` | 214 | 219 | +5 |
| `/pedidos-titular` | 213 | 218 | +5 |
| `/configuracoes` | 232 | 221 | -11 |
| `/minha-conta` | 223 | 225 | +2 |
| `/mais` | 209 | 216 | +7 |
| `/documentos/consentimento/[id]` | 211 | 215 | +4 |
| `/plataforma` | 200 | 213 | +13 |
| `/plataforma/auditoria` | 202 | 215 | +13 |
| `/plataforma/taxonomia` | 199 | 211 | +12 |
| `/plataforma/clinicas/nova` | 200 | 213 | +13 |
| `/plataforma/minha-conta` | 218 | 222 | +4 |
| `/portal` | 223 | 234 | +11 |

**24 de 28 rotas ficaram acima da linha de base** (as exceções são `/login`, `/pacientes/[id]`, `/configuracoes` e `/privacidade`, igual). A diferença é quase uniforme (+12 a +15 KB nas rotas da equipe e da plataforma), o que aponta para a casca compartilhada e não para uma tela. Candidatos, **não verificados** aqui: a troca do Next.js de 16.4.2 para 16.4.5, o código de Server Actions e de `useReportWebVitals` na casca, e o chunk único de cliente do `@still-void/ui` (58 KB gz, [#883](https://github.com/KalleoPinheiro/estomasystech/issues/883)). As quatro rotas de menor diferença são as públicas, que não usam a casca da equipe. A maior rota é `/agenda` (243 KB).

## 4. Hidratação

448 cargas (28 rotas × 4 larguras × 2 temas × 2 fusos/locales): **0** com erro ou aviso de hidratação (a linha de base também tinha 0).

## 5. O que ficou de fora

- **TTFB e LCP na staging (Vercel) e em produção:** as sessões de desenvolvimento não alcançam esses ambientes. Ler as linhas `web-vital` do log segue o procedimento de [`producao.md`](producao.md) § 9.4.1.
- **Meta de JS:** não atingida (§ 3). Fica como pergunta aberta para o dono: aceitar a diferença como o custo da casca atual, ou abrir um ticket para achar a causa.
- **Route Handlers de leitura sem consumidor na UI** (`/api/portal/guardian/patients`, `/api/portal/partner`): têm testes próprios; apagá-los exige mudança de requisito (regra 8). Pergunta aberta.
- `check:server-first`: **0 páginas `'use client'`, allowlist vazia** (`npm run check:server-first`).
