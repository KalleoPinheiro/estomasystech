---
title: Retenção — o que a #294 deixou sem processar (#311)
type: spec
status: active
---

# Retenção restante (#311) — Specification

## Problem Statement

A [#294](https://github.com/KalleoPinheiro/estomasystech/issues/294) (PR #302, [ADR-013](../../../docs/adr/013-retencao-por-anonimizacao.md))
deixou seis perguntas abertas, que o dono do produto decidiu em 2026-10-12 (AD-032). Esta spec cobre
os cinco itens que exigem código; "cadastro do profissional: guardar" e "backups: 30 dias" não
mudam código e só entram na doc.

## Requisitos (EARS)

| ID | Requisito | Teste |
| --- | --- | --- |
| RES-01 | **Quando** o período (`to_date`) de uma entrada `waiting` da lista de espera terminou (dia anterior a hoje, no fuso da aplicação), o job **deve** marcá-la `expired` com `resolved_at` = fim do período. A partir daí vale a regra de 2 anos (RET-06): a entrada `expired` é anonimizada como as resolvidas. | `tests/infrastructure/retention-repository.test.ts` |
| RES-02 | Entrada `waiting` com período vigente (último dia = hoje ou futuro) **não deve** ser expirada nem anonimizada. | idem |
| RES-03 | Conta de **parceiro** (`partner`) desativada há mais de 2 anos **deve** ser anonimizada como as contas da equipe (RET-07). Como a conta nova do mesmo parceiro precisa poder ser criada, o vínculo `partner_id` da conta anonimizada é solto. | idem |
| RES-04 | Ao anonimizar o paciente, a descrição e o motivo do desconto de **todas** as faturas dele **devem** ser substituídos (`Fatura anonimizada` / nulo); valor, desconto, datas, status, forma de pagamento e vínculos ficam. O recebimento (`invoice_payments`) só tem valor, forma e data: nada a limpar. | idem |
| RES-05 | Ao anonimizar o paciente, o job **deve** apagar no Google Agenda da clínica cada evento que o sistema criou para as consultas dele e só então limpar `appointments.google_event_id` (o marcador). Evento já inexistente (404/410) conta como apagado. | `tests/application/run-retention.test.ts`, `tests/infrastructure/retention-repository.test.ts` |
| RES-06 | Falha ao apagar um evento (ou ao resolver a credencial) **não deve** interromper o job: é logada, o `google_event_id` fica e a próxima execução tenta de novo. Sem integração configurada (gateway nulo), nada é apagado nem limpo. | `tests/application/run-retention.test.ts` |
| RES-07 | Conta anonimizada **não deve** ser reativada: `PATCH /api/accounts/:id` com `active: true` (e qualquer caminho que chame `UserAccount.reactivate`) responde `409` "Conta anonimizada não pode ser reativada. Convide a pessoa novamente.". A tela não oferece "Reativar" e mostra a situação "Anonimizada". | `tests/domain/user-account.test.ts`, `tests/api/accounts-anonymized.test.ts`, `tests/pages/configuracoes-role.test.tsx` |
| RES-08 | O job continua idempotente (rodar de novo não muda nem conta nada) e auditado só com contagens (novos contadores: `waitlistExpired`, `calendarEvents`). | `tests/application/run-retention.test.ts`, `tests/api/retention-run.test.ts` |
| RES-09 | Todos os passos novos rodam no escopo da clínica; a de outra clínica não é tocada. | `tests/infrastructure/retention-repository.test.ts` |

## Decisões de escopo

| Decisão | Motivo |
| --- | --- |
| Evento do Google Agenda é **apagado**, não renomeado | A #311 aceita as duas; apagar não deixa nada do paciente, e o `removed()` já apaga no cancelamento. O horário vago some da agenda externa, mas a consulta passada fica no VittaFlow. |
| O marcador do evento é o próprio `google_event_id` (nulo = limpo) | Idempotente e sem migração: o que falhou continua com o id e entra na busca seguinte, como a foto (ADR-013 §5). |
| Gateway nulo ⇒ não limpa o id | Sem credencial o evento não foi apagado; limpar o id perderia a chance de apagá-lo quando a integração voltar. |
| `expired` sem migração | `waitlist_entries.status` é texto sem `CHECK`. |
| "Hoje" da expiração no fuso da aplicação (`APP_TIMEZONE`) | O período é uma data de calendário da clínica; UTC expiraria a entrada algumas horas cedo. |
| `partner_id` solto na conta de parceiro anonimizada | `findByPortalLink` e o índice `uq_user_accounts_clinic_partner` impediriam o convite novo ("como conta nova"). O cadastro do parceiro (`partners`) não muda. |
| Reativar bloqueia no domínio (`UserAccount.reactivate`) | Cobre o PATCH da equipe e a rota da plataforma de uma vez. |
| Sem migração | Nenhuma coluna nova: reaproveita `anonymized_at`, `google_event_id` e `status` texto. Evita colisão com a #309. |

## Perguntas abertas (decididas em 2026-10-17, [ADR-017](../../../docs/adr/017-retencao-decisoes-complementares.md))

| Pergunta | Opção adotada na PR → decisão final |
| --- | --- |
| O **cadastro** do parceiro (`partners`: nome, e-mail, telefone, CRM) também é anonimizado quando a conta é? A decisão fala só em conta. | Não processa → **guardado** (ADR-017 B.2). |
| O **cadastro do paciente** anonimizado pode ser reativado em `Pacientes`? A decisão fala em "conta". | Sem bloqueio → **bloqueado**, `409` (ADR-017 B.3, PRO-RN-17). |
| Troca de senha, reenvio de convite e link de redefinição numa conta anonimizada também devem recusar? | Só a reativação → **recusa**, e já recusava: conta inativa, tokens apagados (ADR-017 B.4, ACE-RN-50). |
| Eventos do Google Agenda de pacientes **não** anonimizados criados antes da #217 ainda levam nome completo. | Fora desta issue; segue na #217. |

## Fora do escopo

- Conteúdo dos eventos novos do Google Agenda (iniciais, link): é a #217.
- Cadastro do profissional: guardado por decisão. Backups: 30 dias, só doc (ADR-013 e runbook).
