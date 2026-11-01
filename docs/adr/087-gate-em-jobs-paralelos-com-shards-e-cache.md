---
title: "ADR 087 — Gate em jobs paralelos: shards, E2E dev em paralelo, cache e mutação incremental"
status: frozen
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-01
related:
  - docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md
  - docs/adr/051-mutacao-por-arquivo-no-gate-local-e-rotina-mensal.md
  - docs/adr/084-gate-na-nuvem-incremental-por-pr-e-completo-por-release.md
  - docs/engineering/gate-na-nuvem.md
---

# ADR 087 — Gate em jobs paralelos: shards, E2E dev em paralelo, cache e mutação incremental

- **Data:** 2026-11-01
- **Status:** aceito (decisão de PO do coordenador, com a autonomia dada por @KalleoPinheiro em 2026-10-24;
  @KalleoPinheiro mandou incluir na v0.4.0 em 2026-11-01). Cumpre o item 4 do [ADR-084](084-gate-na-nuvem-incremental-por-pr-e-completo-por-release.md)
  («quando o Actions voltar, o mesmo fluxo vira workflow») e não muda nenhum limiar.
- **Domínios afetados:** engenharia (gate, CI)

## Contexto

O último gate por PR levou 27 min 32 s, em série: E2E de produção 11,5 min, cobertura 8,5 min, E2E de dev
4 min, mais typecheck, lint, build, integração e mutação. Todos os testes são necessários; o que sobra é
espera: etapas independentes rodando uma depois da outra. A cota do Actions voltou (intermitente), e a
nuvem tem 4 vCPU.

## Decisão

Cortar o tempo **sem cortar teste, limiar ou rigor** (regra 8). Nada em `scripts/gate/` e nenhum limiar
(cobertura 100% nas camadas de regra e piso 90, mutação com `break` 85) é tocado.

1. **`ci.yml` em jobs paralelos.** `estatico` (changeset, typecheck, lint, sv, docs, server-first),
   `cobertura-shard` (4 fatias) + `cobertura` (junção); o job `ci` fica com o build. O job `ci` ao final mantém o **nome do
   check exigido pelo ruleset** e só passa se todos os anteriores passaram (resultado diferente de `success`,
   inclusive `skipped` e `cancelled`, reprova): paralelo e shard não mascaram falha.
2. **Cobertura em 4 shards do Vitest com junção.** Cada shard roda `vitest --shard=i/4 --coverage
   --reporter=blob` com `vitest.shard.config.mts`, que é a config da suíte **menos os limiares** (uma
   fatia sozinha nunca atinge 100%). A junção (`vitest --merge-reports --coverage`) usa a config da suíte
   inteira, com os limiares de `vitest.config.mts` sem alteração, e confere que chegaram os 4 blobs. Teste
   vermelho em qualquer fatia reprova a fatia e, por `needs`, o gate.
3. **`gate-pr.yml` (novo, perfil `pr` do ADR-084 como workflow).** Jobs paralelos: `impacto`
   (`scripts/gate-cloud/impacto.ts`, «na dúvida, inclui»), `integracao` (Postgres 18, suíte inteira, fora do
   caminho crítico), `e2e-prod` em 3 shards do Playwright (cada shard com servidor e banco PGlite próprios),
   `e2e-dev` (papéis, login e console limpo) e `mutacao` incremental. O job final `gate-pr` reprova se um job que devia rodar não
   passou e só aceita `skipped` quando o impacto mandou pular. O E2E volta ao Actions **apenas neste
   workflow**; a linha `E2E-GATE:` do `gate:local` continua sendo o recibo do PR `release/* → main`
   (ADR-042), e o `gate-pr` não é exigido pelo ruleset até @KalleoPinheiro decidir.
4. **E2E de dev em paralelo ao de produção na nuvem.** Os specs fixam `localhost:3000` e as duas suítes
   gravam `e2e/.auth`, `test-results` e o `.next`; por isso `scripts/gate-cloud/isolado.sh` roda cada uma num
   namespace de rede e de montagem próprio (`unshare -n -m`, loopback ligado por ioctl porque a imagem não
   tem `ip`, pastas de estado privadas por `mount --bind`). Dev e console limpo (ambos `next dev`) dividem
   um namespace em fila, para não somar dois dev servers aos 15 GB junto do servidor de produção. Sem
   `unshare` (ou com `GATE_E2E_SEQUENCIAL=1`) o script volta à sequência de antes.
5. **Verificações estáticas em paralelo no `gate-cloud.sh`** (typecheck, lint, sv, docs, integridade dos
   testes); a cobertura, que usa todos os núcleos, vem depois. `espera` imprime os logs na ordem de disparo e
   sai com a primeira falha.
6. **Cache** do `.next/cache` (build e E2E de produção) e do `node_modules` (`setup-node` com `cache: npm`)
   entre rodadas. Cache só acelera a compilação: o build roda inteiro e falha igual.
7. **Mutação incremental** (`stryker --incremental`) no `gate-cloud.sh` e no `gate-pr.yml`, com o arquivo
   `reports/mutation/stryker-incremental.json` em cache. O Stryker só reaproveita o resultado do mutante
   cujo código e cujos testes não mudaram; o `break` 85 vale sobre o conjunto inteiro.

8. **Fechamento da release (emenda ao [ADR-071](071-corte-de-release-em-comando-unico.md)).** Aprovado por
   escrito por @KalleoPinheiro em 2026-11-01 (mensagem `cmsg_01D6ist5ZPDEqtgML2r9GFJfJQd1ihuZFmEeJrCGybVKmr`,
   «aprovado», em resposta à proposta de manter E2E completo, integração completa, build e cobertura no SHA
   final e rodar só a mutação de forma incremental, porque o arquivo de regra já foi mutado no PR que o mudou
   e a mutação não depende da interação entre PRs). Conferência do código: o perfil `release` do
   `gate:local` (`scripts/gate/plano.ts`) **já não tem etapa de mutação** (ADR-071), então
   `scripts/gate/` não precisou mudar e a trava `GATE_OWNER_EDIT` não entrou em jogo. A mutação cheia só
   aparece no `gate-cloud.sh release`, que usa `GATE_PERFIL=pr` (a nuvem não tem Docker) e mutaria todos os
   arquivos de regra desde a `main`. Para essa rodada ser incremental sem tocar no gate do dono,
   `stryker.config.json` passa a ter `"incremental": true`: qualquer `test:mutacao` (PR, release na nuvem,
   rotina mensal) reaproveita `reports/mutation/stryker-incremental.json` e só reavalia o mutante cujo código
   ou testes mudaram. `thresholds.break` continua 85 sobre o conjunto inteiro e nenhum teste é afrouxado.
   Num contêiner novo o arquivo não existe e a primeira rodada é cheia; o ganho vem do cache (Actions) e do
   disco do WSL.
9. **Tensão com o ADR-042, registrada.** O ADR-042 tirou o E2E do Actions por falta de cota. Com a cota de
   volta, o `gate-pr.yml` o traz de volta só como gate de PR para a release, sem substituir o recibo
   `E2E-GATE:`. O teste `C47` (`tests/infrastructure/ci-workflow.test.ts`) só confere `ci.yml`,
   `docker.yml` e `recibo-gate.yml`, que seguem sem Playwright; foi mantido sem alteração.

10. **Merge queue do GitHub para a `release/v0.x`** (item 3 da proposta de 2026-11-01, aprovado por
    @KalleoPinheiro como parte da v0.4.0). Quando a release anda, o autor refazia o gate à mão; a fila
    serializa os merges e roda os checks no SHA que ela vai mergear (PR + os que estão à frente). Para isso
    os workflows respondem a `merge_group`: `ci.yml` e `gate-pr.yml` rodam no SHA da fila (no `gate-pr` a base
    do diff é o `base_sha` do evento); `recibo-gate.yml` é pulado na fila, porque o recibo e a integridade
    dos testes dependem do corpo do PR e já foram conferidos nele (check pulado conta como aprovado). A
    fila só vale depois de ligada no painel (passo a passo no PR e em `engineering/gate-na-nuvem.md`); sem
    isso os workflows seguem funcionando só por `pull_request`. A fila usa o método **squash**, o mesmo da
    release (ADR-052); `release/* → main` continua por merge commit, fora da fila.

## Consequências

- **Ganho esperado** (a medir pelo recibo; comparação no PR): no Actions, o caminho crítico passa a ser o
  maior entre o E2E de produção por shard (~1/3 de 11,5 min + build), a cobertura por shard (~1/4 de 8,5 min +
  junção) e a mutação; ~10 a 12 min. Na nuvem, o ganho vem do E2E dev e console em paralelo ao de produção
  e das etapas estáticas juntas; cobertura em shard não acelera uma máquina de 4 vCPU (o Vitest já usa os
  núcleos), por isso lá segue inteira.
- Gasto de minutos do Actions sobe (cada shard instala dependências); a cota é intermitente, e o `gate-pr`
  não bloqueia merge até a decisão do dono.
- Shard de E2E só vale se os specs não dependem da ordem entre arquivos; a independência foi conferida
  rodando as fatias separadas (relatório no PR). Spec novo que dependa de outro reprova na sua fatia e
  deve ser corrigido, não agrupado.
- `vitest.shard.config.mts` é config de infraestrutura do gate: não é teste nem limiar, mas qualquer
  mudança nele passa pela revisão do dono, porque é onde o shard sem limiar poderia virar o gate.
