---
title: "ADR 034 — Repositório renomeado para estomasystech; o que muda e o que fica com o nome antigo"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related: [docs/engineering/producao.md, docs/adr/035-renomeacao-completa-para-estomasystech.md]
---

# ADR 034 — Repositório renomeado para estomasystech; o que muda e o que fica com o nome antigo

- **Data:** 2026-10-18
- **Status:** aceito. @KalleoPinheiro renomeou o repositório GitHub de `KalleoPinheiro/vitta-flow` para `KalleoPinheiro/estomasystech` e pediu a troca das referências ao nome antigo (o deploy na VPS, via Coolify, passa a apontar para o repositório novo, no domínio `estomasystech.kalleopinheiro.com.br`).
- **Domínios afetados:** engenharia (repositório, deploy)

## Contexto

O nome `vitta-flow` aparecia em quatro papéis diferentes: nome do repositório (URLs de issue e PR), nome do pacote npm, rótulos de derivação de chave criptográfica e nome do produto na interface. Só os dois primeiros acompanham o repositório. O GitHub redireciona as URLs antigas, mas os docs não devem depender disso.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — Trocar tudo, inclusive rótulos de chave | uma busca por `vitta-flow` não acha nada | muda a chave derivada: dado clínico cifrado e tokens pendentes de segundo fator deixam de abrir |
| B — Trocar só nome de repositório e infraestrutura (escolhida) | nenhum dado existente é afetado; escopo claro | sobra `vitta-flow` em constantes que parecem esquecidas |

## Decisão

**Opção B.**

- **Trocado:** URLs `github.com/KalleoPinheiro/vitta-flow` e `KalleoPinheiro/vitta-flow#N` nos docs, `.specs/features`, `.design`, `.checks`, `.tasks` e `AGENTS.md`; `name` em `package.json` e `package-lock.json`; `/opt/vitta-flow` no runbook de produção (`docs/engineering/producao.md`); a ponte do Cursor passou a `.cursor/rules/00-estomasystech.mdc`; prefixo do diretório temporário de testes; `estomasystech` entrou na lista de senhas comuns.
- **Não trocado, de propósito:**
  - rótulos de chave em `src/lib/data-cipher.ts` (`vitta-flow/clinical-data/v1`, `vitta-flow/key-id:`, `vitta-flow-dev-only-data-key:`) e `src/lib/auth/mfa-pending-token.ts` (`vitta-flow/mfa-pending/v1`): são entrada de derivação de chave; mudá-los invalida dados cifrados e tokens em voo;
  - textos de ADRs aceitos e `.specs/archive/` (histórico): os links antigos redirecionam;
  - banco/usuário `vitta`, variáveis `VITTA_*` e cookie `vitta_session`: configuração de operação já aplicada na VPS, sem relação com o nome do repositório;
  - nome de produto "VittaFlow" / "Vitta Flow" (interface, e-mails, README, `EMAIL_FROM`) e e-mails de teste `@e2e.vittaflow.test`: decisão de marca é do dono.

## Consequências

- Clones locais devem trocar o remote (`git remote set-url origin https://github.com/KalleoPinheiro/estomasystech`); o GitHub redireciona enquanto isso.
- Se o nome do produto mudar, é um ADR novo; as constantes de chave seguem fora dele (exigem migração de dados).
