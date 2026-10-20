---
title: "ADR 043 — Versionamento com Changesets e release por tag"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
related: [.design/versionamento-e-release.md, docs/adr/039-deploy-manual-no-coolify-sem-down-de-migracao.md, docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md, docs/engineering/producao.md]
---

# ADR 043 — Versionamento com Changesets e release por tag

> **Parcialmente substituído pelo [ADR-052](052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md):** o release em dois passos (`prepare` na `main`, PR de versão, `publish`) virou `prepare` na `release/vX.Y.Z`, rascunho da Release e tag no commit de merge. Changesets, níveis e versão na tela seguem valendo.

- **Data:** 2026-10-20
- **Status:** aceito (decisão de @KalleoPinheiro em 2026-10-19: Changesets, e versão visível às clínicas)
- **Domínios afetados:** engenharia (release, deploy), interface (nota de versão)

## Contexto

Não havia tag, changelog nem versão além do `0.1.0` do `package.json`. O commit em produção era
anotado à mão no handoff, e ninguém sabia dizer qual versão uma clínica usava. O deploy é manual
no Coolify ([ADR-039](039-deploy-manual-no-coolify-sem-down-de-migracao.md)) e o Actions pode
ficar sem cota ([ADR-042](042-e2e-fora-do-actions-gate-local-com-recibo.md)), então o release não
pode depender dele. Desenho completo e alternativas: [`.design/versionamento-e-release.md`](../../.design/versionamento-e-release.md).

## Decisão

- **Changesets** (`@changesets/cli`) com `privatePackages: { version: true, tag: true }` (pacote
  privado só é versionado e tagueado com isso). Changelog padrão (`@changesets/cli/changelog`),
  em português, sem `GITHUB_TOKEN`.
- **Um changeset por PR** que toca `src/`, `drizzle/` ou `Dockerfile` (`npm run check:changeset`,
  também no `ci.yml`). PR só de docs ou CI usa `npx changeset --empty`.
- **Níveis:** major = migração não aditiva ou mudança que exige restaurar backup no rollback;
  minor = funcionalidade que a clínica percebe; patch = correção ou ajuste interno. A versão fica em
  `0.x` até a primeira clínica real (depois da revisão jurídica #376); `1.0.0` é o primeiro release
  com paciente real.
- **Release em dois passos locais**, que espelham o `changesets/action`: `npm run release:prepare`
  (branch `release/vX.Y.Z` com versão e CHANGELOG, vira PR normal) e, após o merge,
  `npm run release:publish -- --rollback=redeploy|backup` (tag anotada `vX.Y.Z` na `main`, push da
  tag e GitHub Release com changelog, migrações do lote e o rollback que vale para ele).
  O `--rollback` é obrigatório: cada lote declara o seu, como o ADR-039 exige. É idempotente.
- **Deploy** continua manual no Coolify, agora **de uma tag** (`producao.md` § 3.1).
- **Versão na tela:** `NEXT_PUBLIC_APP_VERSION` (do `package.json`, embutida no build) aparece como
  `v<versão>` no rodapé da barra lateral da equipe e no portal, só com sessão. Nunca em login,
  páginas públicas nem `/api/health/*` (versão exata pública facilita fingerprinting). Em homologação
  e preview mostra também o SHA curto (`VERCEL_GIT_COMMIT_SHA`).

## Alternativas

- **`changesets/action` no Actions:** abre o PR de versão e cria tag e Release sozinho. Vence quando o
  Actions estiver estável e o gate (unitários no Actions mais recibo local) rodar lá; a troca é apagar
  os dois scripts e acrescentar o workflow, sem mexer em `.changeset/` nem nos PRs.
- **release-please / semantic-release:** exigem Actions e commits convencionais; o projeto usa squash
  com título de PR livre.
- **Deploy automático por tag:** descartado enquanto as migrações não tiverem `down` (ADR-039).

## Consequências

- O gate local (`gate:local`) é de propriedade do dono (ADR-042); por isso `check:changeset` roda
  no `ci.yml` e à mão, e **não** como etapa do `gate:local`. Se o Kalléo quiser, basta acrescentá-lo
  lá (pendência registrada no PR).
- Cada release exige dois PRs pequenos (o do código e o de versão), em troca de tag, changelog e
  versão visível.
- A tag publicada e o número que a clínica vê não voltam; o resto é reversível.
