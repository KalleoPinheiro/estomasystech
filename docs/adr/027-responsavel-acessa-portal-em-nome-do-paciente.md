---
title: "ADR 027 — O responsável acessa o portal em nome do paciente, com conta própria e evidência"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-17
related: [docs/adr/024-responsavel-do-paciente.md, docs/adr/023-email-de-contato-do-paciente-e-login-do-portal.md, docs/adr/003-modelo-de-papeis-multi-empresa.md, docs/domains/portal/README.md]
---

# ADR 027 — O responsável acessa o portal em nome do paciente, com conta própria e evidência

- **Data:** 2026-10-17
- **Status:** aceito. Implementa a [#351](https://github.com/KalleoPinheiro/vitta-flow/issues/351). @KalleoPinheiro decidiu que o responsável do paciente pode acessar o portal em nome dele, desde que isso fique evidenciado; o desenho abaixo foi delegado ao coordenador (PO e arquiteto). Fecha o "fora do escopo" do [ADR-024](024-responsavel-do-paciente.md).
- **Domínios afetados:** portal, acesso, pacientes-prontuario

## Contexto

O ADR-024 criou o responsável como cadastro reutilizável (um por paciente, vários pacientes por responsável) e deixou o portal de fora: acesso a dado de saúde de terceiro exige base legal, prova de que o titular concorda e rastro de quem fez o quê. O portal identifica o titular só pela conta vinculada ao cadastro (ADR-023, POR-RN-08), então o cuidador de um idoso ou de uma criança só podia agir pelo telefone da clínica.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — o responsável usa a conta do paciente | zero código | some a evidência: a trilha diz "paciente" para o que o familiar fez; a senha do paciente é compartilhada |
| B — conta própria, papel `patient` com `guardianId` | reaproveita o papel | um papel com dois significados; a trilha não distingue quem agiu sem olhar a conta |
| C — papel novo `guardian`, conta própria, paciente escolhido por requisição (escolhida) | ator é sempre o responsável; permissões próprias; o titular enxerga quem tem acesso | mais um papel no catálogo (7) |

## Decisão

**Opção C.**

- **Conta própria.** Papel `guardian` (catálogo de 7), coluna `user_accounts.guardian_id` e um acesso por responsável por empresa (migração `0061`, índice único parcial). Segue a senha da equipe de portal (ACE-RN-41), sem segundo fator (como paciente e parceiro). Quem concede: Admin de Empresa e Atendente (`PROVISIONING_MATRIX`); o Profissional não, como já não gerencia responsáveis (ADR-024).
- **Pré-condições para conceder** (todas `400`): o cadastro existe na empresa; há ao menos um paciente **ativo** ligado a ele; a equipe **atesta** (caixa de confirmação, `guardianAuthorization`) que o paciente ou o representante legal autorizou. A concessão é gravada **antes** de responder (`create`/`account`, com a atestação no `detail`). O sistema não guarda prova de parentesco: a equipe responde por ela, como já responde pelo consentimento em papel (POR-RN-16).
- **Quem o responsável representa** é derivado do vínculo `patients.guardian_id`, não copiado: desvincular o paciente, inativá-lo, desativar a conta ou anonimizar encerra o acesso sem outro passo. Com mais de um paciente, o responsável **escolhe** (`PUT /api/portal/guardian/acting-for`): a escolha vira cookie `httpOnly` com o id, **revalidado em toda requisição** contra o vínculo; cookie adulterado não abre outro paciente (`409`/`404`). Com um só paciente, ele já é o escolhido.
- **Evidência na interface.** Em toda tela do responsável, um aviso fixo: "Acessando em nome de X" (com "Trocar paciente" quando há mais de um). O paciente vê, no próprio portal, **quem** tem acesso em nome dele (nome e parentesco) e **quando foi o último acesso**; encerrar o acesso é pela clínica.
- **Evidência na trilha.** Ator = conta do responsável (`actorRole = guardian`, `actorId` = e-mail de login), titular = paciente (`patientId`). Cada requisição do responsável grava `read`/`guardian-access` **antes** de seguir (write-ahead): se a trilha falha, o acesso falha. A escolha do paciente grava `update`/`guardian-acting-for`. Os eventos de ação já existentes (agendar, cancelar, remarcar, fila de espera, foto) passam a dizer "pelo responsável" no `detail`. Nada de nome, telefone ou e-mail no `detail` (ADR-014).
- **O que o responsável faz:** ver consultas, evolução, fotos e faturas; confirmar, agendar, cancelar e remarcar (mesmos limites do POR-RN-17); entrar e sair da lista de espera; enviar e remover fotos **se o paciente já aceitou o termo**. **O que não faz (`403`):** aceitar ou revogar o termo de consentimento, autorizar ou revogar o parceiro indicador, baixar a cópia dos dados e abrir pedido de correção ou eliminação (LGPD art. 18). São atos do titular; quem representa o titular nesses casos é a clínica, com o papel/documento, como hoje. O responsável **lê** o estado do consentimento (precisa dele para saber por que a foto está bloqueada) e a tela diz que o aceite é do próprio paciente.
- **Cadastro do responsável com conta** não pode ser excluído (`409`); o acesso se encerra desativando a conta. A retenção anonimiza a conta do responsável junto com o último paciente dele (ou após 2 anos inativa, ACE-RN-45) e solta o vínculo.

## Consequências

**Positivas**

- O cuidador resolve consultas e acompanha a evolução sem usar a senha do paciente, e cada passo dele é distinguível do paciente na trilha.
- O titular pode saber quem acessa em nome dele e quando.

**Negativas / custos aceitos**

- Sem aceite do termo pelo próprio paciente, o responsável não envia fotos. Quando o texto final do #216 sair, o aceite continua do paciente.
- A concessão depende da atestação da equipe; não há convite ao paciente nem assinatura eletrônica dele. Se o paciente adulto discordar, ele pede à clínica para desativar a conta (a tela dele diz isso).
- Um `read` por requisição enche a trilha; a retenção de 5 anos (ACE-RN-44) já cobre o volume esperado de um responsável por clínica pequena. Se pesar, agregar por sessão é mudança futura.
- O responsável com dois pacientes escolhe um por vez; não há visão combinada.

**O que esta decisão fecha:** o responsável com ato personalíssimo (consentimento, LGPD) ou combinando pacientes numa tela exige novo ADR.

## Relacionado

- Issue #351, POR-RN-19 (superado), POR-RN-21..23, ACE-RN-56, [ADR-024](024-responsavel-do-paciente.md), [ADR-023](023-email-de-contato-do-paciente-e-login-do-portal.md), [ADR-003](003-modelo-de-papeis-multi-empresa.md), [ADR-014](014-observabilidade-sem-pii.md).
