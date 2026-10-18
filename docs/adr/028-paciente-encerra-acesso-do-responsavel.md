---
title: "ADR 028 — O paciente encerra sozinho o acesso do responsável ao portal"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related: [docs/adr/027-responsavel-acessa-portal-em-nome-do-paciente.md, docs/adr/024-responsavel-do-paciente.md, docs/domains/portal/README.md]
---

# ADR 028 — O paciente encerra sozinho o acesso do responsável ao portal

- **Data:** 2026-10-18
- **Status:** aceito. Implementa a [#354](https://github.com/KalleoPinheiro/vitta-flow/issues/354). @KalleoPinheiro decidiu que o paciente adulto pode revogar o responsável sozinho, pelo portal. Fecha a pergunta aberta do [ADR-027](027-responsavel-acessa-portal-em-nome-do-paciente.md) ("encerrar esse acesso, fale com a clínica").
- **Domínios afetados:** portal, acesso, pacientes-prontuario

## Contexto

O acesso do responsável depende de a equipe atestar a autorização do paciente (ADR-027), mas só a clínica o encerrava. O titular dos dados de saúde precisa poder retirar a autorização que deu (LGPD art. 8º, § 5º) sem depender de ligar para a clínica.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — o paciente desativa a conta do responsável | reaproveita a desativação de conta | o responsável pode representar outros pacientes: cortaria o acesso de quem não pediu |
| B — o paciente desvincula o responsável do cadastro | zero coluna nova | apaga o responsável como contato (ADR-024: lembrete, termo impresso); perde o histórico de quem era |
| C — marca por paciente em `patients.guardian_portal_revoked_at` (escolhida) | corta só aquele paciente; conta e contato do responsável intactos; a data vira evidência | uma coluna nova (migração `0062`) |

## Decisão

**Opção C.**

- **Quem:** só a conta `patient` do próprio titular (`DELETE /api/portal/patient/guardian-access`); o responsável recebe `403` (não revoga a própria autorização). Parceiro e equipe têm guardas próprias.
- **Efeito imediato:** o paciente sai da lista de representados (`listRepresentablePatients`) e some o cartão "quem acessa em nome dele". A representação já é revalidada em toda requisição (ADR-027), então não há sessão para derrubar; cookie do paciente revogado não o reabre. Os outros pacientes do mesmo responsável não mudam.
- **Evidência:** `update`/`guardian-access-revocation`, ator = conta do paciente (`actorRole = patient`), titular = paciente, gravada **antes** (write-ahead): se a trilha falha, nada muda. Sem dado pessoal no `detail` (ADR-014).
- **Tela do paciente:** o aviso "X pode acessar este portal em seu nome" ganha o botão **Encerrar acesso**, com confirmação.
- **Tela da equipe:** a ficha do paciente mostra que o paciente encerrou o acesso, e quando.
- **Conceder de novo:** só a equipe, **desvinculando e vinculando** o responsável de novo (qualquer troca de responsável zera a marca). Reativar a conta do responsável não basta, de propósito: a vontade do paciente prevalece sobre a conta.
- **Sem revogação:** paciente sem responsável, ou com o acesso já encerrado → `404`; nada é gravado.

## Consequências

**Positivas**

- O titular retira a autorização sozinho e na hora, com prova de quando.
- Revogar para um paciente não atinge a família do responsável.

**Negativas / custos aceitos**

- O responsável não é avisado (sem e-mail ao revogar); ele só percebe o acesso fechado. Aviso é decisão de produto futura.
- A marca fica no cadastro do paciente; religar exige um ato manual da equipe, sem nova atestação formal além da que a equipe já responde.
- Paciente menor ou sem capacidade: o portal do paciente é dele; quem decide por ele é a clínica com o representante legal, como hoje (ADR-027). Não há tratamento especial por idade.

## Relacionado

- Issue #354, POR-RN-22, POR-RN-24, [ADR-027](027-responsavel-acessa-portal-em-nome-do-paciente.md), [ADR-024](024-responsavel-do-paciente.md), [ADR-014](014-observabilidade-sem-pii.md).
