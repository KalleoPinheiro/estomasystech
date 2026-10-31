---
title: "Estado da release v0.4.0 e fila"
status: living
audience: [agent, dev, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-31
---

# Estado da release v0.4.0 e fila

> **TL;DR.** `release/v0.4.0` (aberta em 2026-10-25 a partir de `5e39180`) está em `5a0682e2` (#612).
> Em voo: **#619** (PR 2 da #552, head `836f9f72`, em revisão), **PR 2 da #553** (portal) e **#618**
> (gate na nuvem, ADR-084). Fila e dependências na § 4. Foto de **2026-10-31 ~11:30**; confira o GitHub
> (`git log origin/release/v0.4.0`, `gh pr list`) antes de agir. Como o coordenador trabalha:
> [`coordenacao.md`](coordenacao.md).

O épico é a #541 (performance e server first). Padrão de implementação: ADR-069, ADR-074 e ADR-075.
Os briefs executáveis da leva 2 estão em [`briefs-v0.4.0-leva2.md`](briefs-v0.4.0-leva2.md).

## 1. Já na release

| PR | Issue | Observação |
| --- | --- | --- |
| #583, #586 | #578 | |
| #585 | #580 | |
| #587 | #582 | |
| #590 | #588 | |
| #592 | #591 | |
| #593 | lint | |
| #584 | #543 | guarda E2E de console + fuso (ADR-073); issue fica aberta até a etapa `console-limpo-dev` entrar no gate local |
| #589 | #544 | fundação server first (ADR-074) |
| #594 | #545 | casca da equipe (ADR-075) |
| #596 | #548 | tela Hoje |
| #598 | #597 | R4 no PATCH de retornos |
| #599 | #547 | faturamento e repasses (ADR-076) |
| #601, #602 | #551 | agenda leituras (ADR-077) e gravações (ADR-078) |
| #600 | #549 | lista de pacientes e triagem |
| #607 | #606 | recibo com CPF instável (só teste) |
| #608 | #603, #605 | R4 nas ações de consulta e série (ADR-079) |
| #610 | #552 PR 1 | ficha do paciente, leituras (`3d3f12a`; fechou #616) |
| #612 | #553 PR 1 | portal, leituras (`5a0682e`; fechou #613 e #614) |

Fechar à mão o que ainda estiver aberto de #545, #549, #551, #547, #548, #597, #603, #605 e marcar
#542–#549, #551, #562 no checklist da #541. Para os PRs de #549 e #551, a conferência limpa e o
`test:integracao` em Postgres real devem constar no handoff antes de fechar.

## 2. Em andamento (próximo passo de cada frente)

| Frente | Branch / PR | Head | Estado | Próximo passo |
| --- | --- | --- | --- | --- |
| **#552 PR 2**: 18 Server Actions da ficha (ADR-080) | `feat/ficha-paciente-servidor-acoes` / **#619** | `836f9f72` | revisão limpa em andamento (cobertura no head, regras de acesso/auditoria, Stryker em `src/lib/server`, Playwright 360/390/768/1280 por papel, medição #615) | 1) fechar a revisão e comentar o veredito; 2) `git merge origin/release/v0.4.0` e conferir conflito (`TransactionScope` ganhou 13 repositórios; resolver a união); 3) gate (nuvem ou WSL) + `test:integracao` Postgres; 4) merge squash na release; 5) fechar #552 à mão. A meta **#615 (JS gz ≤ 215 KB) não foi atingida (240 KB)**: fica aberta, pergunta para a #559 |
| **#553 PR 2**: Server Actions do portal (ADR-081) | thread do portal (branch `feat/*` a criar a partir da release) | — | iniciado | cobrir o **mutante sobrevivente** em `src/lib/server/data/portal.ts` (`loadPatientPortalView`): trocar `consent.data?.canSign` por `consent.data.canSign` derruba a tela do responsável quando a leitura do termo falha; escrever o cenário «termo falha, responsável ainda abre a tela» **antes** do código e anotar no handoff. Depois: mesma esteira (revisão limpa, gate, merge) |
| **#618**: gate na nuvem (ADR-084) | `claude/project-thread-m4hdtb` / **#618** | `7470aba8` | PR aberto, checks vermelhos do Actions por cota | revisão limpa + `the-judge`; mergear na release. Não toca `scripts/gate/` nem `src/` (sem changeset) |
| Disco a 100% no PC durante o gate | thread de diagnóstico no PC | — | travada (sem resposta desde 09:50) | partes medidas: repo no ext4 do WSL (bom), `ext4.vhdx` 237,7 GB, C: a 91%, cobertura presa à CPU (~70% user, I/O 0%). Retomar o diagnóstico ou descartar se o gate na nuvem substituir o PC |

## 3. Decisões de PO e clínicas vigentes

Decisões do produto (tomadas pelo coordenador com a autonomia delegada; cite-as, não reabra):

- **Agenda no celular:** visões Mês + Dia, sem Semana. Autoagendamento do portal **só retorno** (#483);
  «Li e concordo» (#481); termos v3; avaliação em BottomSheet (#523); auditoria paginada 25/50 (#521).
- **Acesso:** `forbidden` de **página** = 200 (a API devolve 403/404); auditoria na **mesma transação**
  que a gravação. Sem vínculo R4 = **403** (inclui remarcar); outra clínica = **404**. Profissional só
  agenda com o próprio `professionalId`, **sem exigir vínculo prévio** (é como ganha paciente novo; regra
  que ninguém decidiu, registrada como pergunta aberta). Série com paciente inexistente = 404.
- **Performance:** CLS < 0,05 **estrito** em todo papel, com dados reais e CPU 4x; long task da triagem
  < 200 ms; tela Hoje com **um** Suspense e no máximo 3 retornos; `loadBlock` único em
  `src/lib/server/data/load-block.ts`; sem cache compartilhado de dado de clínica (ADR-069→074); sem
  Cache Components/PPR; imagem autenticada sempre `unoptimized`; specs E2E com massa por projeto
  (prod e dev no mesmo banco no gate). Notas para a #559: foco vai ao `body` após decisão de triagem;
  contador de triagem do casco sem limite. Linha de base e régua: `perf-next/linha-base.spec.ts`
  (copiar para `e2e/`, rodar com `playwright.prod.config.ts`, apagar).
- **Clínico (ADR-062):** infecção local ou pior gera alerta na triagem; percentual de tecido fora do
  PUSH; coerência nível × sinais vira aviso (não bloqueio).
- **#546 documentos:** emissão via Server Action em ilha cliente. Pergunta aberta: «achar ou criar»
  sem `unique` (duas abas geram dois números).
- Seed do time só em **banco vazio**. Vercel só constrói `staging`; conectores Vercel e GitHub só nas threads.

## 4. Fila priorizada e dependências

Limites: máx. 3 threads de código, nunca duas no mesmo domínio.

| Ordem | Issue | Depende de | Domínio | Nota |
| --- | --- | --- | --- | --- |
| 1 | #619 → merge | revisão limpa, gate | pacientes-prontuário | fecha #552 |
| 2 | #553 PR 2 | PR 1 (#612) feito | portal | ADR-081; pendência do mutante acima |
| 3 | #618 → merge | revisão limpa | transversal | destrava o gate sem o PC |
| 4 | **#604** testes instáveis sob carga (`reset-password-flow`, `staging-rebuild`) | nada | qualidade | reproduzir antes de teorizar; cada flake custa um gate de ~22 min. Abrir também issue do flake de `test:integracao` com timeouts sob carga (o #612 passou na 3ª corrida) |
| 5 | **#556** materiais e procedimentos (2 PRs) | #603+#605 (feitos) | estoque + catálogo | ADR-083; não junto com #550 |
| 6 | **#546** documentos imprimíveis | #547 (feito) | documentos | ADR-082 |
| 7 | **#550** profissionais e parceiros | nada (não junto com #556) | equipe-parceiros | |
| 8 | **#595** remover `RoleGate` sem uso → **#554** telas públicas → **#555** relatórios/auditoria → **#557** configurações → **#558** plataforma | #594 validado na staging | acesso | série; #595 antes |
| 9 | **#559** Web Vitals de campo, bundle, medição final | todas as migrações | transversal | recebe a pergunta do #615 (JS gz) |
| 10 | **#560** spike Cache Components, PPR e SRI | #559 | transversal | |

Sugestão pendente: incluir `src/lib/server` no `mutate` do Stryker (a revisão da #619 já mutou ali).

## 5. Passo a passo para continuar uma frente

1. `git fetch origin && git switch -c <tipo>/<slug> origin/release/v0.4.0` (nunca da `main`).
2. Recarregar as skills (`coordenacao.md` § 1), ler o brief da issue e escrever o teste que prova o
   comportamento novo; vê-lo falhar; implementar.
3. `npm run test:changed -- origin/release/v0.4.0`, `typecheck`, `lint`, `check:sv` (JSX), `check:docs`
   (`.md`), `check:changeset`, `check:testes`. Atualizar docs do domínio e ADR reservado.
4. `git merge origin/release/v0.4.0`, conferir conflito, escrever o handoff em
   `.specs/archive/handoff-2026.md` no último commit.
5. PR squash com base `release/v0.4.0` e `## Homologação`; rodar o gate (`coordenacao.md` § 7); revisão
   limpa em thread nova; merge pelo coordenador; fechar a issue à mão.
6. Série de PRs na mesma issue: o PR 2 só começa depois do merge do PR 1; handoff do PR 1 não muda
   depois que o SHA foi aprovado no gate.

## 6. Lições registradas

Autor mergeia a release na branch antes de avisar pronto; checar conflito antes do gate; serializar
merges; recibo em comentário vale; GitHub não fecha issue por merge na release; shell em primeiro
plano morre aos 10 min (gate em segundo plano); nada em `scripts/gate/` por shell.
