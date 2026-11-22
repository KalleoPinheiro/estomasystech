---
title: "ADR 117 — Aprovação de classe 3 vale pelo conteúdo sensível, não pelo SHA"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-22
related:
  - docs/adr/097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md
  - docs/adr/109-fluxo-de-entrega-simplificado.md
  - docs/engineering/classe-de-risco.md
---

# ADR 117 — Aprovação de classe 3 vale pelo conteúdo sensível, não pelo SHA

- **Data:** 2026-11-22
- **Status:** aceito. Pedido do dono (Kalléo, 2026-11-22): "existe uma forma de evitar que isso aconteça a todo
  momento? se sim faça a correção definitiva".
- **Domínios afetados:** nenhum domínio do produto; esteira de entrega (portão de risco).

## Contexto

Três travas se repetiram nas entregas de 2026-11-22:

1. **Clique perdido.** A aprovação no Environment `aprovacao-classe-3` valia por execução. O PR 990 perdeu dois
   cliques: PRs entraram na `main` enquanto o dono aprovava, o PR ganhou conflito em arquivo de fila
   (`PROXIMOS-PASSOS.md`), o merge da `main` na branch disparou execução nova e o portão pediu outro clique para
   o mesmo conteúdo sensível. O ruleset da `main` não exige branch atualizada (`strict: false`); só o conflito
   obriga o push.
2. **Merge travado por conversa de bot.** Com CI verde e clique dado, o merge parou na regra
   `required_review_thread_resolution` por conversas do CodeRabbit sobre documentação, que as sessões de agente
   não podem resolver.
3. **Push na branch errada.** Uma atualização foi para outra branch e o PR ficou 45 min parado sem ninguém notar.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — Merge queue / segurar a `main` enquanto um classe 3 espera | Sem conflito, sem push | Para todas as entregas pelo tempo do clique; depende de disciplina ou de configuração do GitHub; não resolve o conflito que já existe |
| B — Aprovação vinculada ao conteúdo de classe 3 | Push que não muda o conteúdo sensível não pede clique; o dono continua aprovando todo conteúdo sensível novo | Uma consulta à API do Actions no job `risco` |
| C — Aprovação por SHA (hoje) | Simples | Clique repetido a cada conflito |

Para as conversas: resolver por script conversas de bot equivale a desligar a regra, com mais código; a revisão
desta esteira é o CI (ADR-109) e o ruleset já exige 0 aprovações humanas. Para o push: um check no CI não vê um
push que foi para outra branch; quem vê é quem empurra.

## Decisão

**Opção B**, mais duas medidas pequenas.

1. **Impressão de classe 3.** O job `risco` (scripts da base, head só como objeto) calcula, para o head, os motivos
   da classe 3 e o `git patch-id --verbatim` do diff `base...head` restrito aos arquivos que explicam a classe
   (o lockfile entra junto de dependência sensível). Se uma execução anterior **desta PR** teve o job
   `Aprovação do dono (classe 3)` verde **e** o histórico de revisão do Environment registra `approved` em
   `aprovacao-classe-3`, e o head daquela execução tem a mesma impressão, o job de aprovação é pulado e o
   `Portão de risco` passa citando a execução aprovada (`scripts/release/reaproveitar-aprovacao*.ts`).
2. **Conversas não travam o merge.** O dono desliga "Require conversation resolution before merging" no ruleset
   `main`. Achado de bot continua visível no PR; o que for real vira correção ou issue.
3. **`npm run pr:push -- <N>`.** Recusa empurrar quando o HEAD local não descende do head do PR (branch errada) e
   só termina com sucesso quando `refs/pull/N/head` no origin é o HEAD local.

### Por que é seguro

- O patch-id ignora só número de linha; contexto e espaço em branco contam. Mesmo trecho em outro lugar do
  arquivo, ou qualquer byte diferente nos arquivos sensíveis, dá impressão nova e clique novo. Arquivo sensível
  novo no diff muda os motivos e também pede clique.
- O patch-id não tem número de linha: se o contexto de algum trecho se repete no arquivo da base, o lugar seria
  ambíguo, então não há impressão e o dono clica.
- O que muda sem clique são arquivos de classe 0 a 2, que numa PR própria também entrariam sem clique.
- Sem registro de aprovação do Environment não há reaproveitamento: um workflow alterado que crie um job com o
  mesmo nome sem Environment não basta.
- Falha fechada: classe 3 sem arquivo (`diff-vazio-com-head`), erro de API, de git ou script ausente na base
  (bootstrap) dão `reaproveitada=false` e o dono clica. Este próprio PR passa pelo clique normal.
- O risco aceito: uma mudança na `main` perto (até 3 linhas) do trecho da PR num arquivo sensível pede clique
  de novo; é o lado conservador.

## Consequências

- Conflito em fila, doc ou código comum durante a espera do clique deixa de custar clique.
- O job `risco` ganha `actions: read` (só leitura do histórico de execuções desta PR).
- A regra de "PR de classe 3 não mexe na fila" vira recomendação, não necessidade.
