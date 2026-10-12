---
title: Retenção e anonimização automática por tipo de dado (#294)
type: spec
status: done
---

# Retenção e anonimização (#294) — Specification

## Problem Statement

Nada era expurgado nem anonimizado (#216, item 3; #210, item 2). Decisão de @KalleoPinheiro em
2026-10-11 (#216, item 4; #294): ao fim do prazo o dado é **anonimizado**, nunca excluído.

| Dado | Prazo | Ao fim |
| --- | --- | --- |
| Prontuário (anamnese, avaliações, SOAP) e fotos | 20 anos após o último atendimento | anonimizar |
| Trilha de auditoria | 5 anos | anonimizar |
| Lista de espera | 2 anos | anonimizar |
| Contas inativas (equipe/paciente) | 2 anos após a desativação | anonimizar |

Hospedagem decidida: VPS Hetzner com docker compose e fotos no volume local (#206). Anonimizar a
foto é apagar o arquivo e manter o registro sem texto livre.

## Requisitos (EARS)

| ID | Requisito | Teste |
| --- | --- | --- |
| RET-01 | O job **deve** rodar por `POST /api/retention/run` com `x-cron-secret` (ou `GET` com `Authorization: Bearer`), pelo mesmo `CRON_SECRET` dos lembretes. Sem o segredo, `503`; segredo errado, `401`. | `tests/api/retention-run.test.ts` |
| RET-02 | O corte de cada tipo **deve** ser a mesma data e hora N anos antes da execução (calendário UTC; 29/02 sem par vira 28/02). Só entra o que tem a data de referência **estritamente anterior** ao corte. | `tests/domain/retention-policy.test.ts` |
| RET-03 | **Quando** a última atividade clínica do paciente for anterior ao corte de 20 anos, o job **deve** anonimizar o paciente e o prontuário dele numa transação (regras abaixo). | `tests/infrastructure/retention-repository.test.ts` |
| RET-04 | **Depois** de anonimizar o paciente, o job **deve** apagar o arquivo de cada foto dele e só então marcar a foto (`anonymized_at`). Foto cujo arquivo falhou fica pendente e é retomada na próxima execução. | `tests/application/run-retention.test.ts`, `tests/infrastructure/retention-repository.test.ts` |
| RET-05 | Evento de auditoria com mais de 5 anos **deve** perder ator, recurso, paciente e detalhe; tipo de recurso, ação, papel, empresa e data ficam. Vale para a trilha de cada clínica e para a de plataforma. | idem |
| RET-06 | Entrada da lista de espera **já resolvida** (`scheduled`/`removed`) há mais de 2 anos **deve** perder o paciente e a observação; procedimento, profissional, período, origem, status e datas ficam. | idem |
| RET-07 | Conta da equipe (`company_admin`, `atendente`, `profissional`) ou de paciente desativada há mais de 2 anos **deve** perder o e-mail e a senha, ter as sessões revogadas e os tokens, o segundo fator e os códigos de recuperação apagados. Papel, empresa e vínculos ficam. | idem |
| RET-08 | Rodar de novo **não deve** alterar nada nem contar de novo o que já foi anonimizado. | `tests/infrastructure/retention-repository.test.ts`, `tests/api/retention-run.test.ts` |
| RET-09 | O job **deve** gravar, por clínica e para a plataforma, um evento de auditoria `update`/`retention` só com as contagens por tipo (sem PII), e só quando algo foi anonimizado. | `tests/application/run-retention.test.ts` |
| RET-10 | Falha numa clínica **não deve** parar as outras: a entrada dela traz `error` genérico (o detalhe fica no log) e as contagens do que já foi anonimizado antes da falha, que também vão para a trilha. | idem |
| RET-11 | A desativação de uma conta **deve** gravar `deactivated_at`; a reativação o limpa. Contas já inativas antes da migração contam a partir da migração. | `tests/infrastructure/retention-repository.test.ts` |

## Regras de anonimização por tipo

**Princípio:** sai identificador direto e todo texto livre; fica o dado estruturado (medidas,
códigos, status, datas, valores), para as estatísticas agregadas continuarem certas.

### Prontuário e fotos (20 anos)

Referência do paciente = a data **mais recente** entre: cadastro, consulta (fim, qualquer status,
inclusive futura), anamnese (atualização), evolução, condição, avaliação, foto, plano de cuidados,
avaliação de resultado e registro de intervenção. É o "último atendimento" lido do jeito mais
conservador: qualquer registro posterior adia a anonimização.

| Tabela | Sai | Fica |
| --- | --- | --- |
| `patients` | nome → "Paciente anonimizado", e-mail → `anonimizado+<id>@anonimizado.invalid`, telefone → vazio, observação; data de nascimento vira 1º de janeiro do mesmo ano; `active = false`, `anonymized_at` | parceiro indicador, data de cadastro |
| `anamneses` | os cinco textos | data |
| `evolution_notes` | S, O, A, P | consulta, profissional, data |
| `clinical_conditions` | título → "Condição anonimizada", observação | tipo, tipo de estomia, início, status, data |
| `condition_assessments` | observação, pele periestomal, complicações em texto | medidas, tecido, exsudato, dor, códigos de complicação, escala DET |
| `condition_photos` | observação do paciente, **arquivo** | tipo, tamanho, origem, triagem, data |
| `care_plan_diagnoses` | fatores relacionados, características definidoras | código, tipo |
| `outcome_evaluations`, `intervention_records` | observação | escores, datas, profissional |
| `appointments` | observação, motivo do cancelamento | datas, procedimento, preço, status, profissional |
| `follow_ups` | motivo (vira vazio) | vencimento, status |
| `consent_records`, `partner_share_consents` | IP | tipo, hash e versão do texto, data |
| `user_accounts` (portal do paciente) | como na regra de contas abaixo, e `active = false` | papel, empresa, vínculo |

Lote de até 200 pacientes por clínica por execução; o resto entra na próxima.

### Trilha de auditoria (5 anos)

`actor_id` e `resource_id` → `anonimizado`; `patient_id` e `detail` → nulos. O marcador
`actor_id = 'anonimizado'` torna o passo idempotente. O repositório de auditoria continua
append-only: a anonimização mora no repositório próprio da retenção.

### Lista de espera (2 anos)

Referência = resolução (ou cadastro, se faltar). `patient_id` passa a aceitar nulo (migração);
o nulo é o marcador. Leituras da fila ignoram entrada sem paciente.

### Contas inativas (2 anos)

E-mail → `anonimizado+<id>@anonimizado.invalid`; senha → hash sentinela que nenhuma senha
satisfaz; `session_version + 1`; apaga `auth_tokens`, `user_mfa` e `mfa_recovery_codes`;
`anonymized_at` marca.

## Decisões de escopo

| Decisão | Motivo |
| --- | --- |
| Referência do prontuário = atividade clínica mais recente, não só a última consulta concluída | A decisão fala em "último atendimento". Qualquer registro posterior adia: nunca anonimiza antes do que a leitura estrita faria. |
| Data de nascimento generalizada para o ano | Mantém faixa etária nos relatórios sem a data exata. |
| Clínica suspensa também é processada | O prazo é legal e por tipo de dado; suspender não pausa a retenção. |
| Evento do job só com contagens, e só quando houve mudança | "Auditado só com contagens" (#294); evento diário zerado só faria a trilha crescer. |
| Repositório próprio (`RetentionRepository`) | O de auditoria segue append-only; a única atualização permitida é esta, num lugar só. |
| `deactivated_at` gravado no `save` da conta | Todo caminho de desativação passa por ele; contas já inativas contam a partir da migração (mais tarde = mais conservador). |

## Perguntas abertas (decididas em 2026-10-12 — ver [`retencao-restante`](../retencao-restante/spec.md), #311)

| Pergunta | Opção conservadora adotada |
| --- | --- |
| Entrada da lista de espera ainda `waiting` com período vencido há anos entra na regra de 2 anos? | Não processa: só entradas resolvidas. |
| Conta de **parceiro** inativa entra na regra de contas? (a decisão diz "equipe/paciente") | Não processa. |
| Cadastro do **profissional** (nome, registro) de conta anonimizada também é anonimizado? Ele assina o prontuário, que tem guarda de 20 anos. | Não processa: só a conta de login. |
| Fatura e pagamento do paciente anonimizado (descrição, motivo do desconto) | Não processa: financeiro fora da decisão. |
| Conta anonimizada pode ser reativada? | Sem bloqueio: sem e-mail nem senha, ela não entra. |
| Eventos já criados no Google Agenda da clínica levam o nome do paciente no título (`Consulta: <nome>`). A retenção deve apagá-los ou renomeá-los? | Não processa: dado fora do banco, na conta Google da clínica. |

## Fora do escopo

- Índice composto e paginação por cursor da trilha (#210, outros itens).
- Exclusão de dado (a decisão é anonimizar).
