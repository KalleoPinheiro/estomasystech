---
title: "Baseline de carga"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related:
  - docs/engineering/producao.md
  - scripts/load/run.ts
  - scripts/load/seed.ts
  - .specs/STATE.md
---

# Baseline de carga

> **TL;DR:** com 30 usuários simultâneos (≈15 req/s, pausa de 2 s entre cliques) numa VPS de 4 vCPU, toda leitura da equipe e do portal fica com **p95 ≤ 100 ms**, inclusive com 100 mil consultas e 1 milhão de eventos de auditoria; só o autoagendamento do portal (`/slots`) chega a 460 ms nesse volume. Zero erro em todas as medições. O ponto fraco é o laço por candidato do `/slots`; sob saturação o limite é o processo Node (um núcleo a 110 %, Postgres a 20 %), não o banco. Issue [#222](https://github.com/KalleoPinheiro/vitta-flow/issues/222); decisão AD-049 em [`STATE.md`](../../.specs/STATE.md).

## 1. Perfis medidos

Os números são premissas de medição, não regra de negócio. O alvo de produção é **uma clínica, uma réplica** ([`producao.md`](producao.md) § 1).

| Perfil | Empresas | Profissionais | Pacientes | Consultas | Faturas | Eventos de auditoria | Banco |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `tipica` | 1 | 5 | 2 000 | 20 000 | 12 000 | 100 000 | ≈ 65 MB |
| `multi` | 20 | 5 por empresa | 2 000 por empresa | 20 000 por empresa (400 mil) | 12 000 por empresa | 100 000 por empresa (2 milhões) | 1,3 GB |
| `issue` | 1 | 20 | 10 000 | 100 000 | 60 000 | 1 000 000 | 510 MB |

O `multi` existe para tirar a seletividade do filtro `clinic_id`, que é o que os índices compostos da #222 supostamente resolveriam. O `issue` reproduz o volume citado na issue. A agenda semeada vai de 15 meses atrás até o futuro, sem choque de horário (a constraint anti-double-booking vale no seed).

**Usuários virtuais:** 30 simultâneos, cada um escolhendo uma de 15 rotas por peso (agenda e dashboard, pacientes, faturamento, relatório, auditoria, opções e 2 do portal; os pesos estão em `scripts/load/run.ts`) com pausa média de **2 s** (`thinkMs`). A segunda série, **saturação**, tira a pausa para achar o teto de vazão.

## 2. Ambiente e método

| Item | Valor |
| --- | --- |
| Máquina | container com 4 vCPU Xeon 2,1 GHz e 15 GB; app, Postgres e gerador de carga **na mesma máquina** (pessimista para CPU) |
| App | `npm run build` + `node .next/standalone/server.js` (o mesmo comando da imagem), `NODE_ENV=production`, 1 processo |
| Banco | Postgres 16 local, `shared_buffers=512MB`, `fsync=off` (isola CPU/consulta; produção com `fsync` ligado paga mais nas **escritas**, que este baseline não mede) |
| Sessão | cookie assinado com `AUTH_SECRET`, como o E2E; conta `company_admin` e 50 contas `patient` semeadas |
| Rate limit | `API_RATE_LIMIT_MAX=1000000` (o teto padrão cortaria o teste) |
| Janela | 10 s de aquecimento descartados + 60 s medidos (30 s na saturação); percentil exato sobre as amostras |

Só leitura: a medição não grava nada (as leituras de prontuário gravam auditoria, o que já está incluído).

## 3. Como reproduzir

```bash
# 1. Postgres 16 vazio + app migrado (o boot migra com advisory lock)
export DATABASE_URL=postgres://vitta:vitta@localhost:5432/vitta AUTH_SECRET=... DATA_ENCRYPTION_KEY=...
export API_RATE_LIMIT_MAX=1000000 TZ=America/Sao_Paulo APP_TIMEZONE=America/Sao_Paulo
npm run build && (cd .next/standalone && PORT=3000 node server.js &)

# 2. semear um perfil (apaga e recria as empresas load-clinic-*; recusa host que não seja local)
npx tsx scripts/load/seed.ts tipica        # ou multi | issue

# 3. medir (realista, depois saturação)
npx tsx scripts/load/run.ts tipica --duration 60 --warmup 10 --think-ms 2000
npx tsx scripts/load/run.ts tipica --duration 30 --warmup 5 --think-ms 0
```

Nunca aponte o seed para um banco de produção. Os arquivos ficam em `scripts/load/` (`profiles.ts` define os perfis).

## 4. Resultados

### 4.1 Uso realista (30 usuários, pausa de 2 s, ≈ 15 req/s) — p50 / p95 em ms

| Rota | típica | multi (20 empresas) | issue (100 mil consultas) |
| --- | ---: | ---: | ---: |
| `GET /api/appointments (hoje, dashboard)` | 11 / 17 | 11 / 15 | 32 / 63 |
| `GET /api/appointments (semana, agenda)` | 17 / 23 | 18 / 25 | 60 / 97 |
| `GET /api/audit (trilha)` | 8 / 11 | 8 / 10 | 6 / 18 |
| `GET /api/follow-ups?status=pending` | 16 / 25 | 15 / 24 | 22 / 48 |
| `GET /api/invoices (lista)` | 9 / 15 | 10 / 15 | 9 / 35 |
| `GET /api/invoices/summary` | 16 / 22 | 15 / 21 | 50 / 69 |
| `GET /api/options/professionals` | 6 / 8 | 5 / 7 | 5 / 44 |
| `GET /api/patients (lista)` | 6 / 11 | 7 / 11 | 6 / 33 |
| `GET /api/patients/{id} (ficha)` | 7 / 10 | 6 / 10 | 6 / 16 |
| `GET /api/patients?search=` | 10 / 14 | 8 / 13 | 10 / 23 |
| `GET /api/portal/patient (portal)` | 11 / 19 | 11 / 30 | 11 / 31 |
| `GET /api/portal/patient/slots (autoagendamento)` | 29 / 47 | 28 / 41 | 233 / 460 |
| `GET /api/reports (mês)` | 22 / 32 | 3 / 6 | 3 / 12 |
| `GET /api/schedule-config` | 6 / 10 | 4 / 8 | 4 / 8 |
| `GET /api/summary (dashboard)` | 13 / 17 | 13 / 18 | 46 / 90 |
| **Total** | 11 / 26 | 11 / 24 | 20 / 92 |

Zero erro e vazão de 14,6 a 14,9 req/s nos três perfis. `/api/reports` cobra ≈ 100 ms frio (mês de 4,8 mil consultas); o relatório de mês fechado é cacheado no processo, por isso a mediana de 3 ms.

### 4.2 Saturação (30 usuários sem pausa) — p50 / p95 em ms

| Rota | típica | multi (20 empresas) | issue (100 mil consultas) |
| --- | ---: | ---: | ---: |
| `GET /api/appointments (hoje, dashboard)` | 142 / 182 | 140 / 196 | 302 / 443 |
| `GET /api/appointments (semana, agenda)` | 148 / 200 | 147 / 205 | 318 / 448 |
| `GET /api/audit (trilha)` | 139 / 191 | 139 / 194 | 260 / 383 |
| `GET /api/follow-ups?status=pending` | 202 / 248 | 198 / 266 | 391 / 535 |
| `GET /api/invoices (lista)` | 195 / 249 | 194 / 263 | 374 / 548 |
| `GET /api/invoices/summary` | 99 / 138 | 95 / 136 | 242 / 334 |
| `GET /api/options/professionals` | 83 / 122 | 84 / 126 | 166 / 270 |
| `GET /api/patients (lista)` | 84 / 130 | 82 / 122 | 168 / 272 |
| `GET /api/patients/{id} (ficha)` | 140 / 185 | 139 / 195 | 269 / 395 |
| `GET /api/patients?search=` | 86 / 125 | 86 / 129 | 166 / 269 |
| `GET /api/portal/patient (portal)` | 404 / 483 | 403 / 502 | 812 / 1014 |
| `GET /api/portal/patient/slots (autoagendamento)` | 1094 / 1251 | 1090 / 1283 | 2430 / 2863 |
| `GET /api/reports (mês)` | 203 / 264 | 29 / 60 | 48 / 128 |
| `GET /api/schedule-config` | 83 / 126 | 83 / 126 | 170 / 302 |
| `GET /api/summary (dashboard)` | 147 / 198 | 147 / 211 | 334 / 469 |
| **Total** | 143 / 426 | 138 / 424 | 292 / 846 |

Vazão máxima com 1 processo: **≈ 165 req/s** (`tipica` e `multi`) e **≈ 82 req/s** (`issue`), 5 a 11 vezes a carga realista. Nenhuma requisição falhou. A latência cresce porque o `next-server`, que é um processo só, satura um núcleo (≈ 110 % de CPU contra ≈ 20 % de cada backend do Postgres, lido com `top` durante a rodada `tipica`); o `EXPLAIN` das consultas de agenda, faturas e follow-ups fica abaixo de 2 ms no volume `issue`.

## 5. Orçamento adotado

Decisão registrada em AD-049 (a #222 pedia um orçamento; ficou o mais conservador que a medição sustenta):

| Cenário | Meta |
| --- | --- |
| Uso realista, rota de leitura da equipe ou do portal | **p95 ≤ 300 ms** |
| Uso realista, `/api/portal/patient/slots` | **p95 ≤ 500 ms** (calcula grade por candidato) |
| Qualquer cenário | **0 erro** |
| Saturação | só diagnóstico, sem meta; serve para dimensionar (§ 6) |

Resultado: **todas as rotas cumprem**; o `/slots` com 20 profissionais e 100 mil consultas está a 40 ms do teto (460 ms).

## 6. Leitura e consequências

- **Dimensionamento:** 30 usuários pedem ≈ 15 req/s e a máquina entrega 80 a 165; há folga de 5× a 10× numa VPS de 4 vCPU. A segunda réplica não é necessária para o go-live.
- **`/slots` do portal** é a única rota que escala com o número de profissionais (29 ms com 5, 233 ms com 20; 1,1 s e 2,4 s sob saturação): `ListAvailableSlots` faz `await isFree(...)` por candidato (`src/application/portal/list-available-slots.ts`). Ticket [#360](https://github.com/KalleoPinheiro/vitta-flow/issues/360).
- **Portal `/api/portal/patient`** custa ≈ 400 ms sob saturação (cerca de 3× a ficha de paciente da equipe, 140 ms); no uso realista fica em 11 ms de mediana. Sem ticket.
- **Índices compostos da #222 (item 1): não construir agora.** No `multi` (400 mil consultas, 2 milhões de eventos, 20 empresas) as rotas de agenda, faturas, follow-ups e auditoria ficam em p95 ≤ 25 ms; a trilha de auditoria já tem o índice `(clinic_id, occurred_at desc, id desc)` (#322). Revisar se uma empresa passar de ≈ 1 milhão de consultas ou se o p95 realista de qualquer rota passar de 300 ms.
- **Bundle (item 4):** na build desta medição o maior chunk tem 229 KB (72 KB gzip), contra 428 KB (131 KB gzip) em 2026-09-26. Não foi refeita a tabela por página.

## 7. O que este baseline não cobre

| Lacuna | Por quê | Próximo passo |
| --- | --- | --- |
| Escritas (agendar, pagar, baixa de estoque) | script só lê; escrita concorrente pede cenário próprio | medir se o p95 de escrita preocupar em produção |
| Job de lembretes (item 3) | **Resolvido na [#361](https://github.com/KalleoPinheiro/vitta-flow/issues/361).** Medido contando as leituras de repositório por execução (4 e 40 pacientes, cada um com consulta amanhã e retorno vencido, metade com responsável): antes 14 e 122 (cerca de 3 por lembrete); depois 6 e 6, fixas (COM-RN-21). O teste `tests/application/send-reminders-queries.test.ts` falha se uma leitura voltar a crescer com o lote. Latência em tempo real não medida: exige canal de e-mail e o custo era de idas ao banco | nenhum |
| Navegador (LCP, hidratação) | não houve browser nesta rodada | rodar Lighthouse na Hetzner depois do go-live |
| Rede e disco reais | tudo em loopback, `fsync=off` | repetir `tipica` na VPS definitiva (§ 3 funciona igual) |
| `getRepositories` (item 5) | custo por requisição já aparece nos p50 de 4 a 6 ms das rotas leves; [#220](https://github.com/KalleoPinheiro/vitta-flow/issues/220) segue aberta | nenhum |
