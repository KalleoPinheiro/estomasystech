---
title: "Gate na nuvem: como rodar numa thread sem o PC"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-31
---

# Gate na nuvem

**Por PR:** suíte unitária completa com cobertura, mais integração, mutação e E2E só no que o diff altera ou alcança (regras de impacto e fallback no ADR). **Por release:** gate completo na nuvem e Docker/backup no WSL antes do `release:cut`.

**Antes de abrir o PR (ADR-088):** só o perfil `rapido`. A cobertura completa, a integração e o E2E são do `ci.yml` e do `gate-pr.yml` no PR, que são os checks exigidos; rodá-los antes na thread repete a mesma prova no mesmo SHA.

Decisão e motivo: [ADR-084](../adr/084-gate-na-nuvem-incremental-por-pr-e-completo-por-release.md).

## Comandos

```bash
scripts/gate-cloud.sh bg rapido    # antes de abrir o PR (ADR-088): estático, integridade e testes do diff, ~3 a 5 min
scripts/gate-cloud.sh bg pr        # investigar vermelho: incremental, em segundo plano, log em .gate/cloud.log
scripts/gate-cloud.sh bg release   # release: setup + integração + gate:local (perfil pr, sem Docker)
scripts/gate-cloud.sh status       # etapas terminadas com tempo; "fim rc=N" quando acabou
```

Rode sempre em segundo plano: a ferramenta de shell mata comando em primeiro plano aos 10 min.
A árvore precisa estar limpa (o gate vale para o SHA do HEAD). A base do diff é `GATE_BASE` ou a
release aberta ([ADR-058](../adr/058-base-do-diff-dos-gates-locais-e-a-release-aberta.md)).

## Tempos medidos (release/v0.4.0 eb27585, 4 vCPU, 15 GB)

| Etapa | Tempo |
| --- | --- |
| npm ci / typecheck / lint+sv+docs | 31 s / 48 s / ~14 s |
| cobertura completa | 566 s |
| build | 73 s |
| integração (Postgres real) | 149 s |
| E2E prod / dev | 613 s / 204 s |
| mutação (2 arquivos) | 102 s |

## Armadilhas

- Sem Docker o perfil `release` do `gate:local` recusa: a nuvem usa `GATE_PERFIL=pr`; Docker e backup
  ficam como pulados no recibo e rodam no WSL.
- A integração só passa com `PG_POOL_MAX=1` (como no `ambiente:local`).
- Playwright pede uma revisão do Chromium que a imagem pode não ter: o script cria o link.
- Servidor de uma rodada interrompida na porta 3000 derruba o E2E em 3 s: o script mata antes.
- Postgres da imagem é o 16; produção e CI usam o 18.

## Recibo com duração e motivo do TESTE-ALTERADO (nota ao ADR-084)

O ADR-084 não é editado; esta seção registra duas melhorias do `scripts/gate-cloud.sh`.

- **Recibo com tempo.** Ao fim de `pr` e `release` (inclusive na falha) o script imprime e grava em
  `.gate/cloud-recibo.md` a linha `GATE-NUVEM: <sha> perfil=<pr|release> rc=<n> total=<s>` e uma tabela
  com o rc e a duração de cada etapa, mais as etapas puladas. É o texto a colar no PR. Não substitui a
  linha `E2E-GATE:` do `gate:local` no PR `release/* → main`.
- **Motivo do TESTE-ALTERADO fora do disco local.** A etapa `integridade-de-testes` repassa ao
  `check:testes` o corpo do PR (`GATE_PR_BODY_FILE=<arquivo>`) e/ou o texto (`GATE_MOTIVO_TESTE="..."`),
  além do `.gate/motivo-teste.txt` local. A checagem é a mesma (`scripts/gate/check-test-integrity.ts`,
  regra 8): só muda de onde o motivo chega. Na nuvem: salve o corpo do PR num arquivo e exporte a variável.
- **CI.** O job `ci` do Actions passou a definir `NODE_OPTIONS=--max-old-space-size=8192`: o
  `tsc --noEmit` estourava o heap padrão (~2 GB, exit 134).


## Jobs em paralelo, shards e cache (ADR-087)

Decisão e motivo: [ADR-087](../adr/087-gate-em-jobs-paralelos-com-shards-e-cache.md). Nenhum limiar muda.

- **Actions, `ci.yml`**: `estatico`, `cobertura-shard` (4 fatias) + `cobertura` (junção com os limiares de
  `vitest.config.mts`) e `build` rodam juntos; o job `ci` (nome exigido pelo ruleset) só passa se todos passaram.
  Reproduzir um shard: `npx vitest run -c vitest.shard.config.mts --coverage --reporter=blob --shard=1/4`;
  juntar: `npx vitest --merge-reports --coverage` (os blobs ficam em `.vitest-reports/`).
- **Actions, `gate-pr.yml`** (PR para `release/**`): `impacto`, `integracao`, `e2e-prod` (3 shards), `e2e-dev`
  (papéis, login, console limpo) e `mutacao` incremental; o job `gate-pr` confere que cada job que devia rodar passou.
  Reproduzir um shard de E2E: `npx playwright test -c playwright.prod.config.ts --shard=2/3`.
- **Nuvem, `gate-cloud.sh`**: estáticos juntos; E2E de produção em paralelo com dev + console limpo, cada um num
  namespace próprio (`scripts/gate-cloud/isolado.sh`); mutação com `--incremental`. `GATE_E2E_SEQUENCIAL=1` volta
  ao E2E em sequência (também é o que acontece se a máquina não tem `unshare`). Os logs de cada etapa paralela
  ficam em `.gate/par-<etapa>.log`.
- Armadilha: o E2E em namespace usa memória (servidor de produção + `next dev` + Chromium); abaixo de 12 GB prefira
  `GATE_E2E_SEQUENCIAL=1`.

### PR só de documentação (ADR-087, errata)

PR que toca só `.md` de documentação (regra do ADR-053) roda os workflows, mas os jobs pesados são pulados: o
`escopo` do `ci.yml` pula cobertura, typecheck, lint, sv, server-first e build, e o `gate-pr.yml` pula
integração, E2E e mutação. Fica o gate de docs e o de changeset, e o check exigido (`ci`) fecha verde em
poucos minutos. Não se usa `paths-ignore`, que deixaria o check exigido pendente. Qualquer arquivo fora da
regra no diff volta ao gate completo.

### Merge queue da `release/v0.x` (ADR-087): pendente até o repositório ir para uma organização

**Situação (2026-11-01):** o ruleset **não oferece «Require merge queue»**. O GitHub só liga a fila em
repositório de organização; este é de conta pessoal. Ver a errata do [ADR-087](../adr/087-gate-em-jobs-paralelos-com-shards-e-cache.md).

- Os gatilhos `merge_group` de `ci.yml`, `gate-pr.yml` e `recibo-gate.yml` **ficam** nos workflows
  (inofensivos fora da fila; o `recibo-gate` é pulado na fila).
- A proteção atual são os checks obrigatórios do ruleset (`Typecheck, lint, sv-gate, test:coverage, build`
  e `Recibo do gate local + integridade dos testes`) com a branch atualizada; quando a release anda, o autor
  mescla a release na branch e espera o CI.

Para quando houver organização (só o dono faz):

1. Settings → Rules → Rulesets → ruleset de `release/**` → marque **Require merge queue**.
2. Método de merge **Squash**; tamanho da fila 1 a 5 PRs; «Only merge non-failing pull requests».
3. Checks exigidos: `Typecheck, lint, sv-gate, test:coverage, build` (job `ci`) e, se quiser o E2E no
   bloqueio, `Gate do PR`. O recibo pode seguir exigido: na fila ele é pulado e conta como aprovado.
4. Fluxo: o autor clica **Merge when ready**; a fila monta `release + PR`, roda `ci` e `gate-pr` nesse SHA e
   faz o squash. `main` não entra na fila (`release/* → main` segue por merge commit com o recibo `E2E-GATE:`).
