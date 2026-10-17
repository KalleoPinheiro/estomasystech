---
title: "ADR 020 — Evento do Google Agenda só com iniciais, horário e link"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-17
related: [docs/adr/018-transferencia-internacional-ue.md, docs/engineering/integrations/google-calendar.md]
---

# ADR 020 — Evento do Google Agenda só com iniciais, horário e link

- **Data:** 2026-10-17
- **Status:** aceito. Implementa a decisão de @KalleoPinheiro de 2026-10-11 (issue #217); a pergunta da conta Workspace foi delegada e decidida aqui.
- **Domínios afetados:** agenda

## Contexto

O evento criado no Google Agenda levava nome completo, telefone e procedimento (dado de saúde, LGPD
art. 5º II / 11) para o calendário de quem conectou, que pode ser pessoal, compartilhado ou
sincronizado no celular, e é terceiro fora do país (ADR-018). Na remarcação o título virava
"Consulta remarcada" e o paciente sumia.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — só "Consulta" + horário + link | exposição mínima | a equipe não reconhece a consulta de relance |
| B — iniciais + horário + link | reconhece sem identificar; é o que o dono escolheu | iniciais ainda são pseudo-identificadores |
| C — nome sem procedimento/telefone | prático | identifica o paciente num calendário de terceiro |
| D — como estava | zero esforço | vaza dado de saúde |

## Decisão

**Opção B.** Título `Consulta · J.S.` (primeira e última inicial, sem partículas), horário e descrição
`Abrir no VittaFlow: <APP_URL>/agenda?consulta=<id>&em=<início ISO>`. Mesmo conteúdo na criação e na
remarcação. A conexão **não** é restrita por código a Workspace: o escopo `calendar.events` não expõe o
domínio da conta, e exigir o claim pediria mais escopo (mais dado) para um risco já baixo com iniciais;
fica como recomendação em `google-calendar.md`.

## Consequências

**Positivas**

- Nenhum nome, telefone ou procedimento sai para o Google; o bug do título some.
- O link leva direto à consulta e só abre para quem tem sessão na clínica.

**Negativas / custos aceitos**

- Eventos anteriores mantêm o conteúdo antigo até a remarcação (sem reescrita em lote).
- Sem `APP_URL` válida (http/https), o evento sai sem link.

**O que esta decisão fecha:** acrescentar campo clínico ao evento exige novo ADR.

## Relacionado

- Issue #217, AGE-RN-18, [integração](../engineering/integrations/google-calendar.md).
