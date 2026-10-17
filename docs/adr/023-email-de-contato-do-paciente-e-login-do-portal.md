---
title: "ADR 023 — E-mail de contato do paciente é opcional e repetível; o login do portal é outra coisa"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-17
related: [docs/adr/003-modelo-de-papeis-multi-empresa.md, docs/domains/portal/README.md, docs/domains/pacientes-prontuario/README.md]
---

# ADR 023 — E-mail de contato do paciente é opcional e repetível; o login do portal é outra coisa

- **Data:** 2026-10-17
- **Status:** aceito. Implementa a #325 (fatiada da #218, pergunta 1); a decisão foi delegada pelo dono do produto: opção mais segura.
- **Domínios afetados:** pacientes-prontuario, portal, comunicacao

## Contexto

A recepção precisa cadastrar quem não tem e-mail (idoso, criança) e vários pacientes que compartilham o
e-mail de quem cuida deles. O cadastro exigia e-mail válido e **único por empresa**, o que levava a
endereços inventados ou à recusa do cadastro. Desde a #196 o portal já não identifica o titular pelo
e-mail do cadastro, e sim pelo vínculo da conta (`user_accounts.patient_id`); faltava soltar o cadastro.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — manter obrigatório e único | nada muda | endereço falso, cuidador sem como cadastrar vários pacientes |
| B — opcional e repetível; login do portal em conta própria (escolhida) | cadastro honesto; o portal não depende do contato | lembrete só sai com e-mail de contato |
| C — opcional, repetível, e o portal volta a entrar pelo e-mail do cadastro | menos telas | dois pacientes com o mesmo e-mail abrem o prontuário um do outro (LGPD) |

## Decisão

**Opção B.**

- `patients.email` passa a aceitar `NULL` e perde o índice único `uq_patients_clinic_email` (migração
  `0057`). Os dados existentes ficam como estão: nenhuma linha é alterada. A busca por e-mail segue.
- O e-mail de contato **nunca identifica o titular**. O portal só abre por conta ativa, do mesmo papel,
  vinculada ao cadastro (POR-RN-08); o e-mail de login da conta continua **único por empresa** e é
  verificado pelo convite da clínica (a pessoa define a senha pelo link enviado a ele).
- Sem e-mail de contato, lembretes de confirmação e recall são **pulados** (`skipped`), sem erro e sem
  gravar log. O WhatsApp pelo link da recepção não depende dele.
- Os métodos `findByEmail`/`countByEmail` saem do repositório de pacientes: sem unicidade, não há
  "o paciente com este e-mail" para devolver, e um deles seria a porta de volta para o erro da opção C.
- Parceiro e profissional não mudam: o e-mail deles segue obrigatório e único.

## Consequências

**Positivas**

- Cadastro sem e-mail inventado; cuidador com vários pacientes sob o mesmo contato.
- Dois pacientes com o mesmo e-mail de contato não enxergam dados um do outro (teste de rota).

**Negativas / custos aceitos**

- Paciente sem e-mail não recebe lembrete por e-mail; a recepção usa o WhatsApp.
- Lembrete de paciente com e-mail compartilhado chega ao cuidador: é o efeito pretendido, e o texto
  continua sem dado clínico (COM-RN-01/02).
- Reverter exigiria sanear duplicados antes de recriar o índice único.

**O que esta decisão fecha:** reintroduzir login do portal pelo e-mail do cadastro exige novo ADR.

## Relacionado

- Issue #325 (origem #218), PRO-RN-01, PRO-RN-20, POR-RN-18, COM-RN-18, [ADR-003](003-modelo-de-papeis-multi-empresa.md).
