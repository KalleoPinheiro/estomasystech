---
title: "ADR 024 — Responsável ou cuidador do paciente é entidade própria, só de contato"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-17
related: [docs/adr/023-email-de-contato-do-paciente-e-login-do-portal.md, docs/adr/001-multi-tenancy.md, docs/domains/pacientes-prontuario/README.md]
---

# ADR 024 — Responsável ou cuidador do paciente é entidade própria, só de contato

- **Data:** 2026-10-17
- **Status:** aceito. Implementa a #329 (fatiada da #218, pergunta 3); a decisão foi delegada pelo dono do produto e a #325 (ADR-023) já definiu a relação com o portal.
- **Domínios afetados:** pacientes-prontuario, comunicacao, portal, acesso

## Contexto

Pacientes idosos, crianças e pessoas dependentes são atendidos com um familiar ou cuidador que agenda,
recebe os avisos e assina o termo de consentimento. Hoje a recepção não tem onde registrar essa pessoa:
o e-mail dela vai no campo do paciente (agora permitido, ADR-023) e o termo impresso traz uma linha em
branco para o nome. Um mesmo cuidador costuma responder por vários pacientes da família.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — campos de responsável dentro do paciente | uma tabela só | dado repetido por paciente; corrigir um telefone exige editar cada ficha |
| B — entidade `Guardian` por empresa, ligada ao paciente (escolhida) | uma correção vale para a família; escopo e auditoria próprios; remoção clara | uma tabela e um vínculo a mais |
| C — responsável com conta e acesso ao portal | cuidador confirma consulta sozinho | acesso a dado de saúde de terceiro; exige consentimento, prova de parentesco e fluxo de convite (novo ADR) |

## Decisão

**Opção B**, só como contato.

- Tabela `guardians` (migração `0059`): nome, parentesco, telefone (E.164, como PRO-RN-18), e-mail
  opcional, `clinic_id` obrigatório. `patients.guardian_id` é opcional; **um paciente tem no máximo um
  responsável** e um responsável liga vários pacientes da **mesma** empresa. A mesma empresa é garantida
  pelo repositório escopado (`withTenant`): o vínculo só aceita um responsável que a sessão enxerga.
- Parentesco é uma lista fechada (mãe, pai, cônjuge ou companheiro(a), filho(a), irmão(ã), avô ou avó,
  neto(a), outro familiar, representante legal, cuidador contratado), com rótulo por extenso no documento.
  Texto livre não entra: não é pesquisável e vira dado clínico por acidente.
- **Quem gerencia:** Admin de Empresa e Atendente cadastram, editam, vinculam, desvinculam e excluem. O
  Profissional vê o responsável na ficha de um paciente a que tem acesso (vem embutido em
  `GET /api/patients/:id`, sob o vínculo do R4) e recebe `403` nas rotas `/api/guardians` e ao enviar
  `guardianId`. Isso evita que a listagem de responsáveis da empresa vaze nomes de quem não é paciente dele.
- **Excluir** só é possível sem paciente ligado (`409` com a mensagem); a tela "Excluir cadastro" da
  ficha desvincula este paciente e tenta apagar. Desvincular não apaga o cadastro.
- **Auditoria:** `create`/`update`/`delete` em `guardian` gravados antes da resposta (write-ahead), só com
  o nome dos campos alterados (ADR-014: nunca nome, telefone ou e-mail na trilha); trocar o vínculo grava
  `update`/`patient` com `patientId`.
- **Lembretes:** o e-mail do paciente vale sempre. Sem ele, o lembrete vai ao e-mail do responsável,
  saudando o responsável e falando do paciente em terceira pessoa ("a consulta de José é em…"), **sem link
  do portal** (a conta do portal é do paciente, ADR-023) e sem dado clínico (COM-RN-01/02). Sem e-mail em
  nenhum dos dois, `skipped`, como antes. O telefone do paciente segue obrigatório, então o `wa.me` da
  recepção não muda.
- **Termo de consentimento:** com responsável cadastrado, o documento imprime "Responsável legal: nome
  (parentesco)" e deixa só o CPF em branco (o sistema não guarda CPF de terceiro); sem responsável, a linha
  em branco de antes continua (DOC-08).
- **Retenção (#294):** o contato é dado de terceiro. Ao anonimizar um paciente, o vínculo é desfeito na
  mesma transação e o responsável é apagado se nenhum outro paciente o usa. A exportação do titular (LGPD
  art. 18) inclui o responsável ligado a ele.
- **Fora do escopo, por decisão:** responsável com login ou acesso ao portal; mais de um responsável por
  paciente; CPF e documento do responsável (a #326 trata CPF no recibo, outro assunto).

## Consequências

**Positivas**

- Corrigir o telefone da cuidadora de três irmãos é uma edição só.
- O aviso chega a quem de fato cuida, sem e-mail inventado no cadastro do paciente.
- O termo sai preenchido; a trilha mostra quem mexeu no cadastro, sem expor o contato.

**Negativas / custos aceitos**

- Profissional não vincula responsável nem ao cadastrar paciente: pede à recepção.
- Um responsável com e-mail errado recebe o aviso de saúde-adjacente do paciente (nome, data e clínica);
  é o mesmo risco do e-mail de contato do ADR-023.
- A exclusão pela ficha desvincula antes de apagar; se outro paciente usa o cadastro, só o vínculo desta
  ficha se desfaz e a tela avisa.

**O que esta decisão fecha:** responsável com acesso ao portal ou mais de um por paciente exigem novo ADR.

## Relacionado

- Issue #329 (origem #218), PRO-RN-21, COM-RN-19, POR-RN-19, [ADR-023](023-email-de-contato-do-paciente-e-login-do-portal.md), [ADR-001](001-multi-tenancy.md), PRO-RN-15.
