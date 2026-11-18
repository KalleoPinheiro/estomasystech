---
title: "JS da casca — causa dos 2 a 15 KB gz (2026-11)"
status: frozen
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-18
related:
  - docs/engineering/performance-front-medicao-final-2026-11.md
  - docs/engineering/performance-front-linha-de-base-2026-10.md
  - docs/adr/086-web-vitals-de-campo-no-log-estruturado.md
---

# JS da casca — causa dos 2 a 15 KB gz (2026-11)

> **TL;DR:** o acréscimo é código da casca, medido no first load de `.next/diagnostics/route-bundle-stats.json`. Numa rota da equipe são **+10,6 KB gz**: 404 global +3,2, `error.tsx` +2,6, `loading.tsx` +2,5, layout com `useReportWebVitals` +2,0 e runtime compartilhado +0,3. O resto da tabela é a página. O Next 16.4.2 → 16.4.5, na árvore `8902341`, mede **0 KB**. O chunk cliente do `@still-void/ui` segue **43,9 KB gz**, o mesmo de outubro. **Decisão: aceitar.** A #883 não explica este delta.

## 1. Método

Três builds de produção (`npm run build`, Turbopack). O KB gz de cada rota é a soma, com gzip, dos `.js` listados em `firstLoadChunkPaths` de `.next/diagnostics/route-bundle-stats.json`. Na árvore da linha de base (`8902341`, Next 16.4.2) essa conta reproduz a coluna de outubro do [retrato](performance-front-medicao-final-2026-11.md) § 3, em KB inteiro, nas 28 rotas.

| Build | Código | Next |
| --- | --- | --- |
| Linha de base | `8902341` | 16.4.2 |
| Só o bump | `8902341` com `next@16.4.5` | 16.4.5 |
| Retrato e `main` | `9df8b9f` e `ac18e52` | 16.4.5 |

O gzip do first load em `9df8b9f` e em `ac18e52` é o mesmo número (diferença 0,00 KB; a ficha, +0,01 KB). Os arquivos da casca (`layout` raiz, layouts de equipe, plataforma e portal, `not-found.tsx`, `error.tsx`, `loading.tsx`, `web-vitals-reporter.tsx`, `next.config.ts`) são idênticos entre esses dois commits. O buraco já está no retrato. Os commits posteriores (#918, v0.9.0, v0.9.1, #919, #920, #921, #923, #924, #926) não mudam o JS da casca. A comparação de fotos (#912) fica na ficha e soma 0,01 KB gz no first load.

## 2. JS por rota (gz, KB inteiro)

Mesmas rotas do retrato § 3. «Agora» é o build de `9df8b9f`, igual ao de `ac18e52`. A rota de build de definir senha é `/definir-senha`; a de consentimento é `/documentos/consentimento/[patientId]`.

| Rota | Linha de base 2026-10 | Agora | Diferença |
| --- | ---: | ---: | ---: |
| `/login` | 210 | 204 | -6 |
| `/esqueci-senha` | 197 | 201 | +4 |
| `/definir-senha?token=invalido` | 198 | 202 | +4 |
| `/privacidade` | 195 | 195 | 0 |
| `/` | 220 | 229 | +9 |
| `/agenda` | 228 | 243 | +15 |
| `/pacientes` | 216 | 229 | +13 |
| `/pacientes/[id]` | 239 | 237 | -2 |
| `/triagem` | 213 | 225 | +12 |
| `/faturamento` | 219 | 231 | +12 |
| `/repasses` | 216 | 228 | +12 |
| `/materiais` | 218 | 230 | +12 |
| `/procedimentos` | 216 | 228 | +12 |
| `/profissionais` | 214 | 227 | +13 |
| `/parceiros` | 213 | 225 | +12 |
| `/relatorios` | 213 | 221 | +8 |
| `/auditoria` | 214 | 223 | +9 |
| `/pedidos-titular` | 213 | 221 | +8 |
| `/configuracoes` | 232 | 221 | -11 |
| `/minha-conta` | 223 | 226 | +3 |
| `/mais` | 209 | 219 | +10 |
| `/documentos/consentimento/[id]` | 211 | 219 | +8 |
| `/plataforma` | 200 | 213 | +13 |
| `/plataforma/auditoria` | 202 | 215 | +13 |
| `/plataforma/taxonomia` | 199 | 211 | +12 |
| `/plataforma/clinicas/nova` | 200 | 213 | +13 |
| `/plataforma/minha-conta` | 218 | 222 | +4 |
| `/portal` | 223 | 237 | +14 |

**24 de 28 rotas ficam acima da linha de base.** As exceções são `/login` (−6), `/pacientes/[id]` (−2), `/configuracoes` (−11) e `/privacidade` (igual). O retrato no navegador coincide com esta tabela em 19 rotas (até 1 KB). Em `/`, `/faturamento`, `/repasses`, `/relatorios`, `/auditoria`, `/pedidos-titular`, `/mais`, `/documentos/consentimento/[id]` e `/portal` o navegador ficou 3 a 4 KB abaixo. Como os builds de `9df8b9f` e `ac18e52` são iguais, essa folga já estava no retrato.

## 3. Causa e KB

Camadas novas no first load, gzip, árvore `8902341` + Next 16.4.5 contra o código de `ac18e52`. Em outubro não havia `not-found.tsx`, `error.tsx` nem `loading.tsx`.

| Causa | KB gz | Onde entra |
| --- | ---: | --- |
| Next.js 16.4.2 → 16.4.5, mesma árvore `8902341` | 0 | 26 rotas no mesmo KB inteiro; `/procedimentos` e `/plataforma/auditoria` ficam 1 KB abaixo no arredondamento |
| Chunk cliente do `@still-void/ui` | 0 | 43,9 KB gz nos dois lados (148 985 bytes cru em outubro) |
| `src/app/not-found.tsx` | +3,2 | first load de todas as rotas; em `/privacidade` o chunk da página sai e o líquido fica ~0 |
| `error.tsx` da área (equipe, plataforma, portal) | +2,6 | um chunk por área |
| `loading.tsx` da área | +2,5 | um chunk só, compartilhado pelas três áreas |
| Layout da equipe, com `useReportWebVitals` | +2,0 | rotas da equipe |
| Layout da plataforma | +3,9 | rotas `/plataforma/*`, no lugar dos +2,0 da equipe |
| Layout do portal | +4,2 | `/portal`, no lugar dos +2,0 da equipe |
| Runtime compartilhado (framework + layout raiz) | +0,3 | todas as rotas |

Na equipe a casca soma **+10,6 KB gz** (3,2 + 2,6 + 2,5 + 2,0 + 0,3). Na plataforma, com o layout de +3,9 no lugar de +2,0, a casca soma **+12,5 KB gz**. No portal, **+12,8 KB gz**. O que passa disso, ou o que fica abaixo, é o JS da própria rota. Em KB gz com uma casa: a agenda soma +3,5 na página e a rota inteira fecha em +15 KB; a ficha perde 12,2 na página (rota −2); Configurações perde 21,2 na página (rota −11); login perde 8,9 na página (rota −6).

O 404 global existe para a CSP (#656): sem o arquivo, a 404 padrão do Next injeta estilo sem nonce. O `error.tsx` e o `loading.tsx` são as boundaries da leitura no servidor. O `useReportWebVitals` é o coletor de campo da [ADR-086](../adr/086-web-vitals-de-campo-no-log-estruturado.md), dentro do chunk do layout.

## 4. Decisão

**Aceitar** o delta. O peso medido é essa casca. Um corte tiraria o 404 que a CSP usa, as boundaries de erro e de espera, ou o Web Vitals de campo. Esta nota não corta nada e não altera `@still-void/ui`.

A [#883](https://github.com/KalleoPinheiro/estomasystech/issues/883) fica onde está: o chunk cliente de 43,9 KB gz já estava em outubro e não cresceu. Dividir a biblioteca não explica os 2 a 15 KB desta tabela.
