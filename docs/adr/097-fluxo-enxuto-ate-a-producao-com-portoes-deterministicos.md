---
title: "ADR 097 — Fluxo enxuto até a produção: checks determinísticos, portão humano só no risco alto"
status: frozen
audience: [dev, ops, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-08
related:
  - docs/adr/039-deploy-manual-no-coolify-sem-down-de-migracao.md
  - docs/adr/042-e2e-fora-do-actions-gate-local-com-recibo.md
  - docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md
  - docs/adr/071-corte-de-release-em-comando-unico.md
  - docs/adr/093-gate-do-pr-so-quando-pronto-timeouts-e-orcamento.md
  - docs/adr/095-automacao-do-fim-da-release-tag-backup-deploy-e-fumaca.md
  - docs/engineering/producao.md
  - docs/engineering/homologacao.md
---

# ADR 097 — Fluxo enxuto até a produção: checks determinísticos, portão humano só no risco alto

- **Data:** 2026-11-08
- **Status:** aceito em direção e nas fases 1 e 2 (decisão de @KalleoPinheiro em 2026-11-08). As fases 3 a 5
  ficam **propostas**: cada uma só vale quando o seu pré-requisito estiver estável e o ADR dela (ou emenda a
  este) for aceito. **Este ADR só decide; nenhum workflow, script ou regra de proteção muda aqui.**
- **Domínios afetados:** engenharia (CI, gate, release, deploy), operação (produção), governança (portões).
- **Base:** proposta `fluxo/proposta-fluxo-enxuto-2026-11-08.md` (Projeto), issue #754.

## Contexto

O fluxo atual (ADR-042, 052, 071, 093) nasceu de uma restrição que acabou: a cota do Actions. Com o
repositório público e runners padrão sem cota, o recibo do `gate:local`, o E2E fora do CI, a `release/vX.Y.Z`
longa, a marca `homologacao/vX.Y.Z` e o PR em rascunho custam mais do que protegem. Hoje uma entrega passa
por cerca de 14 estações e 4 passos manuais do operador (merge com bypass, backup por `ssh`, tag no PC,
deploy no Coolify), e um lote só chega ao cliente quando a release inteira fecha, o que aumenta o tamanho do
risco em vez de reduzi-lo.

@KalleoPinheiro pediu o máximo de autonomia para as LLMs até a produção, com o máximo de checagem
**determinística**, sem impacto ao cliente final, mantendo `tlc-*` e `the-judge` como base de cada etapa.

## Decisão

### 1. Piso mecânico, LLM por cima

"Sem impacto algum" não é garantia absoluta; o que se garante é um conjunto de barreiras mecânicas. As
skills `tlc-*` e `the-judge` são LLM e **não são determinísticas**: ficam **acima** do piso, nunca no lugar
dele. O merge exige (a) todos os checks mecânicos verdes **e** (b) veredito estruturado do `the-judge` em
contexto limpo, de quem não escreveu o código. O `the-judge` pode reprovar; nunca substitui um check.

| Risco ao cliente | Barreira determinística |
| --- | --- |
| Código quebrado chega ao ar | CI obrigatório (tipos, lint, cobertura, integração em Postgres 18 real, build, E2E), fumaça pós-deploy e container novo `healthy` antes de o antigo sair |
| Migração quebra o código antigo no deploy | Regra "expandir, depois contrair", imposta por lint de SQL (`check:migracao`) e teste do commit anterior contra o esquema novo |
| Funcionalidade nova atinge todas as clínicas | Flag por clínica, desligada no deploy; ligar é ato separado e reversível |
| Deploy ruim | Rollback automático do código só quando a migração é provadamente aditiva |
| Perda de dado | Backup confirmado antes do deploy (ADR-095); migração destrutiva sempre com humano |

### 2. Classe de risco, calculada por script a partir do diff

| Classe | Critério | Deploy | Aprovação humana |
| --- | --- | --- | --- |
| 0 | só docs, testes, comentários | sem deploy | não |
| 1 | código sem migração e sem caminhos sensíveis | automático | não |
| 2 | migração **aditiva** (passa no lint), sem caminhos sensíveis | automático, com backup confirmado | não |
| 3 | migração destrutiva ou não aditiva; `src/domain/auth`, escopo de empresa (`tenant-scope`), cifra, auditoria; `Dockerfile`, workflows, `scripts/gate/`, `scripts/release/`; dependência de segurança; mudança nos próprios portões | automático **só após** aprovação | **sim** (Environment `producao`) |

Aprovador: @KalleoPinheiro. A classificação é de script, não de LLM; na dúvida, sobe de classe.

### 3. Portões humanos que permanecem

1. Classe 3 (dado de saúde sob LGPD e multiempresa: vazamento entre clínicas não se desfaz por rollback).
2. Ligar flag para clínica real (lançamento de produto; deploy deixa de ser decisão de negócio).
3. Regra 5 e jurídico: preço, papel, trade-off de UX, #376, credenciais, dinheiro.
4. `CODEOWNERS` em `scripts/gate/`, `.github/workflows/`, `scripts/release/` e no ruleset: quem escreve o
   portão não o abre sozinho (regra 8).

Saem das mãos do operador: merge, backup, tag, clique de deploy nas classes 0 a 2, conferência de versão,
apagar marca `homologacao`, conferência do quadro.

### 4. Sem bypass na `main`

A `main` passa a ser protegida por ruleset **sem bypass, inclusive para @KalleoPinheiro**. Exceção de
emergência: `hotfix/*` com aprovação, documentada em `producao.md`. Ninguém empurra direto na `main`.

### 5. Fases

| Fase | O que muda | Situação | Pré-requisito |
| --- | --- | --- | --- |
| 1 | [ADR-095](095-automacao-do-fim-da-release-tag-backup-deploy-e-fumaca.md) como está (v0.8.0): tag, backup, deploy e fumaça por workflow, aprovação sempre | aceita | spike do Coolify |
| 2a | E2E e mutação por diff voltam ao Actions como checks de PR; aposentar o recibo `E2E-GATE` (supera o ADR-042) | aceita; @KalleoPinheiro autorizou em 2026-11-08 mexer em `scripts/gate/` e `recibo-gate.yml` (regra 8), para a #757 | — |
| 2b | `check:migracao` e teste de compatibilidade com o commit anterior | aceita | — |
| 2c | Classificador de risco e `the-judge` com saída estruturada como check obrigatório | aceita | — |
| 2d | Remoção do bypass da `main` (item 4) | aceita | fases 2a a 2c estáveis; hotfix documentado |
| 3 | Fim da release longa: PR `feat → main`, merge queue, staging = `main`, tag automática (supera ADR-052, 071 e 093) | proposta | fases 1 e 2 estáveis por ao menos 2 releases |
| 4 | Auto-deploy das classes 0 a 2 (`producao-auto`) e rollback automático em migração aditiva | proposta | fase 3 |
| 5 | Flags por clínica, preview por PR, canário sintético | proposta, opcional | fase 4 |

Cada fase vale por si e pode parar ali. Estações 1 a 2 do fluxo (issue, triagem, plano) e o uso de
`tlc-discover`, `tlc-plan`, `tlc-implement` e `the-judge` não mudam.

### 6. O que vale hoje

**Nada do fluxo vigente muda por este ADR.** ADR-042, 052, 071, 093 e o roteiro de `producao.md` § 3.1
seguem em vigor até a fase correspondente ser implementada e o texto dela, atualizado. Os avisos em
`producao.md` § 3.1 e `homologacao.md` § 1 apontam para cá. O ADR-095 continua a fundação da fase 1; as
únicas mudanças planejadas sobre ele (dois Environments, rollback condicionado, gatilho no merge) entram na
fase 3 ou 4, por emenda, e este ADR não edita o texto dele.

## Consequências

- Mais minutos de Actions (E2E e mutação voltam ao PR). Aceito: repositório público, runners padrão. Se
  algo voltar a ser privado, o fluxo atual é o plano B.
- O `the-judge` não determinístico pode deixar passar: mitigado pelo piso mecânico, pela classe 3 sempre
  humana, pelo `CODEOWNERS` nos portões e por auditoria por amostragem (`harness-eval`).
- Rollback só é automático com migração aditiva provada; classe 3 para e avisa.
- Mudar o processo no meio de uma release é proibido: cada fase entra entre releases.
- Mexer em `scripts/gate/` exige autorização expressa (regra 8), como na #692. Para a fase 2a (#757) ela foi dada por @KalleoPinheiro em 2026-11-08; qualquer outra mudança nesse diretório pede nova autorização.

## Perguntas abertas

1. **Canário sintético em produção** (clínica fictícia, dado 100% falso, E2E mínimo de login e agenda a cada
   deploy): toca LGPD e escopo de empresa, decisão de @KalleoPinheiro. Não implementar antes.
2. As perguntas 1 a 4 do ADR-095 seguem como estão.

## Tickets

Abertos pelo coordenador, um por item da fase 2 (2a a 2d), com cenários Dado/Quando/Então e classe de risco.
Cada um é issue no GitHub (que gera o EST no Linear) antes de começar.
