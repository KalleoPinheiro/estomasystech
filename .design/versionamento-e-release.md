# Versionamento semântico, changelog, tag e release com Changesets

> Plan this with **tlc-plan**.
> Decisions below carry the literal shape - copy them, do not re-derive them.

## Situation

- Project: em uso (produção no ar desde 2026-10-19), sem paciente real ainda.
- Decision: comprometida por @KalleoPinheiro, 2026-10-19, nesta thread — usar Changesets para versão semântica, changelog, tag e release, e **exibir a versão no sistema para as clínicas**.
- In flight: discovery "E2E fora do GitHub Actions" recomenda recibo local `E2E-GATE: <sha>` conferido no PR; o Actions hoje falha em 2-3 s por travamento de cobrança (#401 não resolveu), então nada roda lá até o Billing ser conferido. Este desenho precisa funcionar **local agora** e migrar para o Actions sem mudar os PRs. ADR-039 (deploy manual) pede reavaliação agora que há staging (ADR-041); este trabalho **não** o reavalia.
- At stake: reversível em uma tarde, exceto o que vira público: a tag e a Release no GitHub e o número exibido às clínicas.

## Problem

Ausência: ninguém consegue dizer, olhando para a tela ou para o Git, qual versão da aplicação uma clínica está usando. O substituto de hoje é anotar o SHA do commit em produção à mão no handoff (`producao.md` § 3.1, passo 1 e 7) e lê-lo em *Deployments* do Coolify. `package.json` está em `0.1.0`, o repositório não tem nenhuma tag e há 50 commits de uma única pessoa.

Quem não consegue: Kalléo, ao atender uma clínica ("em qual versão você está?") e ao decidir rollback (§ 3.1 passos 5 e 6, que dependem de saber o lote e as migrações). Continua impossível, se nada mudar: apontar qual release introduziu um problema, e saber quais migrações entraram em qual lote sem comparar SHAs.

## Evidence

- Sem `.changeset/`, sem tags, `version` `0.1.0` - leitura do repositório em 2026-10-19.
- O Actions está fora (falha em 2-3 s, cobrança); sem E2E o run cairia de ~25-30 min para ~8-11 - relato da thread "E2E fora do GitHub Actions".
- `privatePackages` existe no Changesets e, por padrão, **não versiona nem cria tag de pacote privado** (`version` e `tag` valem `false`) - documentação do Changesets (Context7, `config-file-options.md`). O `package.json` deste projeto é privado, então a configuração é obrigatória.
- Não medido: quantos releases por semana haverá e quantas perguntas de suporte dependem da versão. Nada a medir hoje; o substituto é o SHA anotado à mão.

## Journey

Sequência de quem desenvolve, depois que o PR do código está pronto:

1. O PR traz um arquivo `.changeset/<nome>.md` (nível patch, minor ou major + resumo em português).
2. Merge squash na `main` (regra de sempre).
3. `npm run release:prepare` cria a branch `release/vX.Y.Z` com `changeset version` (sobe `package.json`, gera `CHANGELOG.md`, apaga os changesets consumidos) e empurra; o PR "Version Packages" é aberto e mergeado como qualquer outro.
4. `npm run release:publish` (a partir da `main` atualizada) cria a tag `vX.Y.Z` no commit de merge, empurra a tag e cria a GitHub Release com o trecho do changelog mais a lista de migrações do lote.
5. Kalléo faz o *Deploy* manual dessa tag no Coolify (§ 3.1, inalterado) e confere `/api/health/ready`.
6. A tela mostra `v<versão>` para quem está logado.

Estados que importam:

- **PR sem changeset:** o gate local (`changeset status --since=origin/main`) barra o PR que toca `src/`, `drizzle/` ou `Dockerfile`; PR só de docs ou de CI usa `npx changeset --empty`.
- **Vários changesets, níveis diferentes:** vence o maior (comportamento do Changesets).
- **Nada pendente ao rodar `release:prepare`:** o script sai com mensagem e código 0, sem criar branch.
- **Falha entre o merge do PR de versão e a tag:** `release:publish` é idempotente; se a tag já existe no remoto, sai sem erro.
- **Hotfix:** mesmo caminho, changeset `patch`.
- **Rollback:** *Redeploy* da tag anterior; a tela passa a mostrar a versão anterior. O corpo da Release de cada lote declara se o rollback é por redeploy ou por backup (exigência do ADR-039).
- **Staging e Preview:** mostram a versão e o SHA curto (ambiente descartável, ajuda a diagnosticar); produção mostra só a versão.
- **Sem versão disponível (dev local, build sem `package.json` lido):** não renderiza nada, nunca `undefined`.
- **Não autenticado:** `/login`, `/esqueci-senha`, `/definir-senha`, `/privacidade` e `/api/health/*` **não** mostram a versão. Versão exata pública facilita fingerprinting; quem precisa dela já está logado.

## Verdict

Already committed - see Situation. Nada no trabalho de problema contradiz o compromisso.

Cheaper paths considered: continuar anotando o SHA no handoff - descartado porque não resolve a visibilidade para a clínica nem a rastreabilidade por release. Tag manual sem Changesets (`npm version` + `git tag`) - descartado porque não gera changelog e perde o resumo por PR que o Kalléo pediu.

## Success

- Worked if: cada deploy de produção corresponde a uma tag `vX.Y.Z` com Release, e a versão exibida na tela bate com a tag implantada - a partir do primeiro release depois do merge.
- Early signal: o primeiro ciclo (`release:prepare`, merge, `release:publish`, deploy) fecha em uma sessão sem passo manual fora do roteiro; sinal ruim é precisar editar `CHANGELOG.md` ou a tag à mão.
- Review: depois do terceiro release, ou no go-live da primeira clínica real, o que vier primeiro - Kalléo.
- Não medido: a redução de perguntas de suporte não tem baseline. Proxy observável: o handoff deixa de registrar o SHA em produção à mão e passa a citar a versão.

## Boundary

In: Changesets, scripts de release, tag, GitHub Release, versão visível em área autenticada, atualização de `producao.md` § 3.1 e do `AGENTS.md`, ADR.
Out:
- Deploy automático por tag ou webhook do Coolify - o ADR-039 mantém o deploy manual enquanto migrações não tiverem `down`.
- Workflow `changesets/action` no Actions - a cobrança trava o Actions hoje; entra quando o Billing for resolvido (ver Open).
- Página "Novidades" com o changelog para a clínica - ninguém pediu; só o número da versão.
- Mudança no fluxo `staging` (ADR-041).

## Prior art

- Changesets Action (`changesets/action`): abre o PR "Version Packages" e, no merge, publica/tag. - O desenho local reproduz exatamente esses dois passos, então a migração é trocar os scripts pelo workflow.
- Changesets não versiona pacote privado por padrão - exige `privatePackages: { version: true, tag: true }`.
- Os mantenedores desenham Changesets para monorepo de bibliotecas publicadas; a parte que este projeto não compartilha é a publicação no npm, que aqui fica desligada.
- O `still-void` (mesmo autor) já usa Changesets com `changelog-github`; aqui o changelog padrão basta, porque `changelog-github` pediria `GITHUB_TOKEN` no computador.

## Shape

A aposta: o contrato é o arquivo `.changeset/*.md` por PR e o `package.json` como fonte única da versão. Os scripts locais fazem o que o `changesets/action` fará depois, então trocar de executor não toca nos PRs nem no changelog. O custo de mudar depois é baixo; o número que a clínica vê e as tags já publicadas são o que não volta.

### Adds

- `.changeset/config.json` com `privatePackages: { "version": true, "tag": true }`, `baseBranch: "main"`, `changelog: "@changesets/cli/changelog"`, `access: "restricted"`.
- `.changeset/README.md` com o contrato de níveis (ver Decisions).
- `scripts/release/prepare.sh` e `scripts/release/publish.sh` (mesmo estilo de `scripts/seed/rebuild.sh`: roda no computador, sem `gh` nem Actions obrigatórios).
- `npm run release:prepare`, `npm run release:publish`, `npm run changeset`.
- `src/lib/app-version.ts` (lê `NEXT_PUBLIC_APP_VERSION` e `NEXT_PUBLIC_APP_COMMIT`) e `src/components/app-version.tsx`, com teste unitário; montado no layout autenticado do staff e do portal.
- `CHANGELOG.md` (gerado, nunca editado à mão).
- ADR novo (próximo número livre na `main`): "Versionamento por Changesets e release por tag".

### Changes

- `package.json` → `@changesets/cli` em `devDependencies`; `version` segue em `0.x` (ver Open).
- `next.config.ts` → define `env.NEXT_PUBLIC_APP_VERSION` a partir de `package.json` e `NEXT_PUBLIC_APP_COMMIT` a partir do SHA do build quando houver.
- `docs/engineering/producao.md` § 3.1 → o deploy passa a ser "de uma tag"; passo 1 cita a versão em vez do SHA anotado à mão.
- `AGENTS.md` (tabela de comandos) → acrescenta `release:prepare` e `release:publish`.
- Gate local de PR → inclui `changeset status --since=origin/main`, ao lado do recibo `E2E-GATE`.

### Leaves

- Deploy manual no Coolify, backup antes de migração e rollback (ADR-039, § 3.1 passos 2 a 6).
- Fluxo de git com `staging` e Preview (ADR-041).
- `ci.yml` e `staging.yml` (nenhum workflow novo agora).

O formato pesado - workflow `changesets/action` abrindo o PR de versão e criando tag e Release sozinho - só vence quando o Billing do Actions estiver resolvido e o gate (unitários no Actions mais recibo local de E2E) rodar lá; hoje nenhuma das duas condições é verdade.

Também no campo, só como perspectiva: release-please e semantic-release - exigem Actions e commits convencionais, e o projeto usa squash com título de PR livre.

## Roadmap

| Block | Delivers | Clarity |
|---|---|---|
| Changesets e scripts de release | `.changeset/`, `release:prepare`, `release:publish`, tag e Release com migrações do lote, ADR e docs | clear |
| Versão visível no app | `app-version.ts`, `app-version.tsx`, montagem no layout autenticado, teste | clear |
| Changeset no gate de PR | `changeset status` no gate local, integrado ao recibo `E2E-GATE` quando aquela thread fechar o formato | open |
| Migração para o Actions | workflow `changesets/action` no lugar dos scripts | open |

## Decisions

| Decision | Choice | Why this | Alternative, and what would make it win | Reversibility |
|---|---|---|---|---|
| Ferramenta | `@changesets/cli` com `privatePackages: { "version": true, "tag": true }` | confirmado na documentação; mesmo autor já usa no `still-void` | release-please, se o Actions voltar e os títulos de PR virarem convencionais | reversible |
| Changelog | `@changesets/cli/changelog`, em português nos resumos | funciona sem `GITHUB_TOKEN` local | `@changesets/changelog-github`, quando o release rodar no Actions | reversible |
| Níveis de semver | major = migração não aditiva ou mudança que exige backup para rollback; minor = funcionalidade visível à clínica; patch = correção ou ajuste interno | liga a versão ao critério de rollback do ADR-039 | semver só por API, se virar biblioteca (não é) | costly |
| Origem da tag | `vX.Y.Z` no commit de merge do PR de versão na `main`, criada por `scripts/release/publish.sh` | o que se implanta é o commit que a `main` já validou | tag em branch de release, se houver manutenção de versões antigas (não há) | one-way |
| Executor | dois scripts locais que espelham o `changesets/action` (PR de versão, depois tag e Release) | funciona sem Actions e migra sem tocar nos PRs | workflow no Actions, quando o Billing voltar e o gate rodar lá | reversible |
| GitHub Release | corpo = trecho do `CHANGELOG.md` + migrações do lote (`git diff --name-only <tag anterior>..HEAD -- drizzle/*.sql`) + linha "Rollback: redeploy da tag anterior \| backup" | cumpre o ADR-039 (cada lote declara o rollback) | nenhum | reversible |
| Exibição da versão | `NEXT_PUBLIC_APP_VERSION` embutida no build; texto `v<versão>` no rodapé do layout autenticado (staff e portal), nunca em páginas públicas nem em `/api/health/*` | evita fingerprinting por quem não é cliente | mostrar também no login, se suporte precisar e Kalléo aceitar o risco | reversible |
| Changeset obrigatório | PR que toca `src/`, `drizzle/` ou `Dockerfile` precisa de `.changeset/*.md`; docs/CI usam `--empty` | sem CI no Actions, o gate local é quem garante | check no Actions, quando voltar | reversible |

## Needs an RFC

Nada.

## Open

Baixo impacto, com padrão adotado; a revisão acontece no diff.

1. Ligação com o recibo `E2E-GATE`: a ordem exata dentro do gate local depende do formato que a thread "E2E fora do GitHub Actions" definir - padrão: `changeset status` roda antes do recibo e falha rápido.
2. Fase do número: manter `0.x` até a primeira clínica real, depois da revisão jurídica #376; `1.0.0` é o primeiro release com paciente real - padrão adotado, o Kalléo pode mudar o marco.
3. Origem do SHA exibido em staging e Preview: `VERCEL_GIT_COMMIT_SHA` na Vercel; em produção o SHA não é exibido e não é preciso ler variável do Coolify.
4. Criação da GitHub Release: usa `gh release create` quando o `gh` existir no computador; sem ele, o script empurra a tag e imprime o texto da Release para colar - padrão adotado.
5. Migração para o Actions: ficar para depois do Billing; a troca é apagar os dois scripts e adicionar `changesets/action`, sem alterar `.changeset/` nem os PRs.

## Sources

- Changesets, `config-file-options.md` e guia de migração (opções `privatePackages.version` e `.tag`, padrão `false`) - consultado via Context7 em 2026-10-19.
- `docs/engineering/producao.md` § 3.1 e `docs/adr/039-deploy-manual-no-coolify-sem-down-de-migracao.md` - deploy manual e declaração de rollback por lote.
- `docs/engineering/homologacao.md` e ADR-041 - staging é espelho descartável (main + branches), não candidato a release.
- Relato da thread "E2E fora do GitHub Actions" (recibo `E2E-GATE`, Actions travado por cobrança).
