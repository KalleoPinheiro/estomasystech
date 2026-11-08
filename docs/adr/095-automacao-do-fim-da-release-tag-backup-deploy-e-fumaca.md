---
title: "ADR 095 — Automação do fim da release: tag, backup pré-deploy, deploy no Coolify e fumaça de produção"
status: draft
audience: [dev, ops, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-08
related:
  - docs/adr/039-deploy-manual-no-coolify-sem-down-de-migracao.md
  - docs/adr/040-backup-cifrado-no-coolify-para-o-r2-na-ue.md
  - docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md
  - docs/adr/071-corte-de-release-em-comando-unico.md
  - docs/adr/092-emenda-088-disparo-do-corte-e-selo-sem-furos.md
  - docs/engineering/producao.md
  - docs/engineering/homologacao.md
---

# ADR 095 — Automação do fim da release: tag, backup pré-deploy, deploy no Coolify e fumaça de produção

- **Data:** 2026-11-08
- **Status:** proposto (rascunho, issue #715). **Esta entrega só planeja:** nenhum workflow, script ou
  segredo é criado aqui. Vira `aceito` quando @KalleoPinheiro aprovar as perguntas abertas abaixo.
- **Domínios afetados:** engenharia (release, deploy, segredos), operação (backup, produção).

## Contexto

O corte da release já roda no Actions ([ADR-071](071-corte-de-release-em-comando-unico.md),
[ADR-092](092-emenda-088-disparo-do-corte-e-selo-sem-furos.md)). O **fim** dela ainda depende do PC do
operador e de passos manuais, na ordem de `producao.md` § 3.1:

1. `npm run release:publish` cria a tag `vX.Y.Z` no commit de merge e publica a GitHub Release. Roda no PC
   porque a nuvem do agente recebe 403 ao empurrar tag.
2. `ssh vps` e `sudo systemctl start estomasystech-backup.service`, conferindo a olho que terminou.
3. *Deploy* da tag no painel do Coolify.
4. Fumaça somente leitura (§ 9.6) e conferência da versão no rodapé.

O repositório é **público**: qualquer segredo mal tratado em log ou em workflow é exposto, e PR de fork
nunca recebe segredos. O Actions hospedado alcança a internet pública; só o egress do agente na nuvem é
que bloqueia o domínio de produção (a edge da Hetzner expõe 22, 80 e 443).

## Opções consideradas

| Tema | Opção | Decisão |
| --- | --- | --- |
| Onde roda | Workflow `release-deploy.yml` no Actions, disparado da `main` ([ADR-092](092-emenda-088-disparo-do-corte-e-selo-sem-furos.md)) | Aceita |
| Onde roda | Runner próprio na VPS de produção | Rejeitada: código de workflow no host de produção ([ADR-093](093-gate-do-pr-so-quando-pronto-timeouts-e-orcamento.md)) |
| Onde roda | Manter no PC do operador | Rejeitada: SSD do PC em falha e dependência de uma pessoa |
| Gate humano | *Environment* `producao` com revisor obrigatório, restrito à `main` | Aceita: o clique de aprovação é o "ok escrito" e fica no log |
| Gate humano | Input `confirmo=SIM` no `workflow_dispatch` | Rejeitada: não separa quem dispara de quem aprova, e não protege segredo |
| Backup | Chave SSH dedicada, `restrict`, com comando forçado que só inicia o backup | Aceita |
| Backup | Chave SSH com shell ou token do Coolify disparando backup | Rejeitada: poder demais para um passo |
| Deploy | API do Coolify, com token de escopo mínimo | Aceita, depende do spike (ticket 1) |
| Deploy | Deploy automático por push na `main` | Rejeitada: continua valendo o [ADR-039](039-deploy-manual-no-coolify-sem-down-de-migracao.md) |
| Rollback automático em falha da fumaça | — | Rejeitada: migração sem `down`; decisão é humana |

## Decisão (proposta)

### Desenho

Um workflow `release-deploy.yml`, só `workflow_dispatch`, com "Use workflow from" = `main` e os inputs
`version` (`X.Y.Z`) e `rollback` (`redeploy` ou `backup`, igual ao `release:publish`). Valida o disparo no
primeiro passo, como o `release-cut.yml` (ADR-092), e usa `concurrency` sem cancelar. Três jobs em
sequência, cada um com `timeout-minutes` e `permissions` mínimas:

| Job | Toca produção? | Gate | O que faz |
| --- | --- | --- | --- |
| `publicar` | Não | Nenhum humano; a trava é a verificação | Confere que o HEAD da `main` é merge commit da `release/vX.Y.Z` e que `package.json` traz a versão. Roda o `release:publish` existente (tag anotada no commit de merge, Release publicada). Idempotente: tag já no remoto, segue sem erro |
| `producao` | Sim | *Environment* `producao` com revisor | Um único job, em passos: (1) backup pelo SSH com comando forçado, só segue com sucesso confirmado; (2) deploy no Coolify, esperando `healthy` com o SHA da tag |
| `fumaca` | Não (só leitura) | Nenhum | Roda `scripts/release/fumaca-producao.sh` contra o domínio público |

Backup e deploy ficam no **mesmo job** porque o GitHub pede a aprovação do *Environment* por job: assim uma
aprovação cobre os dois e o backup nunca fica separado do deploy que ele protege (a confirmar no ticket 5).
A tag é criada antes da aprovação; se o revisor recusar, a tag fica (inofensiva: deploy é manual por
natureza e o `publicar` é idempotente). A recusa não desfaz a Release; o operador roda o workflow de novo
quando quiser seguir.

**Merge na `main` continua humano** (com bypass do ruleset). O workflow nunca mergeia, nunca faz push em
branch e nunca roda sem a `main` já ter a release. O ok do operador é a aprovação do *Environment* antes
de `backup`: uma aprovação cobre o job `producao` (backup e deploy) do run; um run novo exige nova aprovação.

### Segredos (repositório público)

- Ficam como **secrets do *Environment* `producao`**, nunca do repositório, e o *Environment* só aceita
  deploy da branch `main`. Só o job `producao` referencia o *Environment*.
- O workflow é só `workflow_dispatch`. Proibido `pull_request_target` e checkout de código de PR nesse
  caminho; PR de fork não recebe segredo.
- Segredos previstos: `VPS_SSH_KEY` (chave dedicada do backup), `VPS_KNOWN_HOSTS` (impressão digital do
  host; `StrictHostKeyChecking=no` é proibido), `COOLIFY_URL`, `COOLIFY_TOKEN` e `COOLIFY_APP_UUID`.
- Contra vazamento em log: nenhum `set -x`; o segredo entra por `env:` no passo, nunca interpolado em
  `run:`; token passa por `curl -H @arquivo` ou `--config` lido de `stdin`, nunca em argumento; chave SSH
  vai para `ssh-agent`/arquivo `0600` removido ao final; respostas da API do Coolify são filtradas com
  `jq` para só o que se usa (status, SHA). Valores derivados e sensíveis passam por `::add-mask::`.
- O workflow declara `permissions` explícitas por job (`contents: write` só em `publicar`).
- Rotação: entra na tabela de `producao.md` § 6, com a ordem "gere o novo, troque no *Environment*,
  revogue o antigo".

### Backup pré-deploy

- Usuário Unix dedicado no VPS, sem senha, com sudoers que permite **somente** o script
  `/opt/estomasystech-backup/ci-backup.sh` (versionado em `deploy/backup/`).
- No `authorized_keys`: `restrict,command="sudo /opt/estomasystech-backup/ci-backup.sh"`. A chave não
  abre shell, porta, agente nem PTY.
- O script inicia `estomasystech-backup.service` (um `oneshot`, então `systemctl start` bloqueia até o
  fim), confere `Result=success` e que o objeto novo apareceu no R2 depois do início, e imprime só
  `BACKUP_OK <timestamp>` ou `BACKUP_FALHOU <motivo curto>`. Sem backup confirmado o job falha e o deploy
  não roda ([ADR-039](039-deploy-manual-no-coolify-sem-down-de-migracao.md): sem backup do dia, sem migração).
- A porta 22 segue aberta e protegida por chave + fail2ban. Restringir por IP não serve (faixas do Actions
  mudam); fechar a 22 e usar túnel fica fora deste ADR.

### Deploy da tag exata

O deploy da API do Coolify (`/api/v1/deploy`) dispara por UUID ou por *tag do Coolify* (rótulo de
recurso, não tag git); não documenta um parâmetro de ref git. Desenho preferido, sujeito ao spike:

1. Pré-condição: `git rev-parse origin/main` é igual ao commit da tag `vX.Y.Z`. A `main` só recebe merge de
   release e hotfix, então o HEAD é o commit da tag; se diferir, o job falha sem deployar.
2. `deploy` com token de habilidade **deploy** (sem escrita) no recurso da `main`.
3. Espera o deployment terminar e confere que o SHA implantado é o da tag. Divergência = falha.

Se o spike mostrar que o Coolify não implanta o HEAD da `main` de forma previsível, o plano B é fixar o
commit antes do deploy (`PATCH` do recurso com `git_commit_sha`), que exige token com escrita; nesse caso
o job usa um *Environment* separado e o escopo do token é revisto aqui antes de aceitar.

### Fumaça de produção

`scripts/release/fumaca-producao.sh` (somente leitura, sem login, sem dado de paciente) cobre os itens
de `producao.md` § 9.6 que não precisam de sessão: liveness, readiness, TLS e HSTS, CSP única com nonce,
cabeçalhos, rotas de job fechadas (`401`), salto do proxy e rate limit. **Fora do automático** a rajada de
300 requisições e os 9 logins falhos (viram passo opcional `fumaca_pesada`), porque disparam limite por
IP no runner. O script é testável (curl injetado) e tem teste de unidade no mesmo PR da implementação.

A versão no rodapé exige sessão (`/api/version`), então a fumaça confere a versão pelo **SHA do
deployment** no Coolify mais `ready` com `database` e `migrations` ok. Tornar a versão pública é decisão
de produto/segurança: pergunta aberta 2.

### Rollback pelo mesmo caminho

O mesmo workflow ganha o input `acao=rollback`: `rollback=redeploy` reimplanta o commit da tag anterior e
remove a linha de `app_releases` da versão revertida (`producao.md` § 3.1, passo 5), por um segundo comando
forçado de SSH; `rollback=backup` **não** restaura sozinho (restore apaga dado escrito depois do backup):
o job imprime o roteiro e exige uma segunda aprovação do *Environment* `producao-restore`. A falha da
fumaça nunca dispara rollback; ela avisa e para.

## Plano de implementação (tickets a abrir, nenhum feito aqui)

| # | Ticket | Depende de | Prova |
| --- | --- | --- | --- |
| 1 | Spike do Coolify 4.6.0: deploy do HEAD da `main` e leitura de SHA/estado do deployment com token mínimo | Acesso do Kalléo ao painel | Registro no ADR; define plano A ou B |
| 2 | `ci-backup.sh` + sudoers + chave restrita + doc de instalação (`backup-passo-a-passo.md`) | — | Teste do script com `systemctl` simulado; execução real no VPS pelo Kalléo |
| 3 | `scripts/release/fumaca-producao.sh` e teste | — | Teste de unidade; execução contra a staging |
| 4 | `release-deploy.yml`: validação de disparo, `publicar`, `fumaca` (sem job de produção) em `dry_run` | 3 | `actionlint`; execução `dry_run` |
| 5 | Job `producao` (backup + deploy) com o *Environment* `producao` | 1, 2, 4 | Execução real supervisionada na primeira release depois de ligada |
| 6 | Rollback (`acao=rollback`) | 5 | Ensaio no `dry_run` e documento |
| 7 | Atualizar `producao.md` § 3.1 e § 6, `homologacao.md` § 1; aposentar `release:publish` do PC (mantém para hotfix e contingência) | 5 | `check:docs` |

Cada ticket que muda workflow segue a regra de cota do Actions: `actionlint` e uma correção consolidada,
sem tentativa e erro. Mexer em `scripts/gate/` continua proibido (regra 8).

## Perguntas abertas (decisão do @KalleoPinheiro, regra 5)

1. **Revisor do *Environment* `producao`.** Recomendação: o próprio Kalléo, com "Prevent self-review"
   desligado (único dono), já que o ganho é o registro e a separação de segredo, não o duplo controle.
2. **Versão visível sem login.** Recomendação: não expor; conferir pelo SHA do Coolify. Expor a versão
   ajuda a fumaça e ajuda também quem mapeia vulnerabilidades.
3. **Primeira release com o fluxo automático.** Recomendação: rodar uma vez com o Kalléo olhando o log e o
   caminho manual de § 3.1 de reserva, e só então aposentar o `release:publish` do PC.
4. **Aprovar a permissão `contents: write` do `GITHUB_TOKEN` para empurrar tag**, ou usar o
   `RELEASE_CUT_TOKEN` já existente. Recomendação: testar o `GITHUB_TOKEN` primeiro; é escopo menor.

## Consequências

- O fim da release deixa de depender do PC e passa a ter log, aprovação registrada e SHA conferido.
- Passa a existir um caminho de credencial para produção no GitHub. O custo é mitigado por *Environment*
  restrito à `main`, token de escopo mínimo e chave SSH com comando forçado; o risco residual (conta do
  GitHub do dono comprometida) é o mesmo que já existe para o bypass do ruleset.
- O deploy continua manual no sentido de ADR-039: só roda com aprovação humana a cada release.
- Nada muda em produção até o ticket 5 ser executado e aprovado.

## Relacionado

[ADR-039](039-deploy-manual-no-coolify-sem-down-de-migracao.md) ·
[ADR-040](040-backup-cifrado-no-coolify-para-o-r2-na-ue.md) ·
[ADR-052](052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md) ·
[ADR-071](071-corte-de-release-em-comando-unico.md) ·
[ADR-092](092-emenda-088-disparo-do-corte-e-selo-sem-furos.md) ·
[`producao.md`](../engineering/producao.md) § 3.1, § 6, § 9.6.
