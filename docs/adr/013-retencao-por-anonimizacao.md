---
title: "ADR 013 — Retenção por anonimização, num job e num repositório só"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-11
---

# ADR 013 — Retenção por anonimização, num job e num repositório só

- **Data:** 2026-10-11
- **Status:** aceito (prazos e destino decididos pelo dono do produto na
  [#216](https://github.com/KalleoPinheiro/vitta-flow/issues/216), item 4, e na
  [#294](https://github.com/KalleoPinheiro/vitta-flow/issues/294))
- **Domínios afetados:** pacientes-prontuário, acesso, agenda
- **Amplia:** [ADR-010](./010-trilha-de-auditoria-de-plataforma.md), que deixou a retenção da trilha em aberto.

## Contexto

Nada era expurgado nem anonimizado: prontuário, fotos, trilha de auditoria, lista de espera e
contas desativadas cresciam para sempre (LGPD art. 15 e 16; Lei 13.787/2018 para o prontuário).
O dono do produto decidiu os prazos (prontuário e fotos 20 anos após o último atendimento, trilha
5 anos, lista de espera e contas inativas 2 anos) e que, ao fim, o dado é **anonimizado**, não
excluído. A trilha de auditoria era append-only por contrato (`AuditEventRepository`).

## Decisão

1. **Anonimizar, nunca excluir.** Sai identificador direto e texto livre; fica o dado
   estruturado (medidas, códigos, status, datas, valores). Os relatórios agregados seguem certos e
   nenhuma chave estrangeira quebra. A foto é a exceção física: o arquivo é apagado do
   armazenamento e o registro fica, sem texto.
2. **Um job, pelo mecanismo dos lembretes.** `POST /api/retention/run` (ou `GET` com `Bearer`),
   protegido pelo mesmo `CRON_SECRET`, lista as empresas em escopo de sistema e trata cada uma em
   `clinicScope`. A trilha de plataforma (eventos sem empresa) é tratada em `systemScope`.
3. **Um repositório só pode reescrever a trilha.** `RetentionRepository`
   (`drizzle-retention-repository.ts`) é a única escrita sobre `audit_events` além do `save`.
   `AuditEventRepository` continua sem update nem delete.
4. **Idempotente por marcador.** `patients.anonymized_at`, `condition_photos.anonymized_at`,
   `user_accounts.anonymized_at`, `waitlist_entries.patient_id` nulo e `audit_events.actor_id =
   'anonimizado'`. Rodar de novo não muda nem conta nada.
5. **Arquivo antes da marca.** O paciente é anonimizado numa transação; depois o arquivo de cada
   foto é apagado e só então a foto é marcada. Falha no armazenamento deixa a foto pendente para a
   próxima execução.
6. **Auditado só com contagens.** Cada empresa que mudou algo ganha um evento `update`/`retention`
   com as contagens por tipo; nenhum identificador.

## Alternativas consideradas

| Alternativa | Por que não |
| --- | --- |
| Excluir as linhas vencidas | Contraria a decisão; quebraria chaves estrangeiras e relatórios. |
| Gatilho no banco por tipo | Regras espalhadas em SQL, sem teste de unidade e sem a foto, que mora fora do banco. |
| Método de update no `AuditEventRepository` | Abriria a trilha para qualquer chamador; a exceção fica isolada num repositório que só o job usa. |

## Consequências

- O job processa até 200 pacientes e 500 fotos por empresa a cada execução; o resto entra no dia
  seguinte.
- `waitlist_entries.patient_id` aceita nulo; as leituras da fila ignoram entrada sem paciente.
- As perguntas abertas desta decisão (parceiro, cadastro do profissional, fila ainda `waiting`,
  faturas, Google Agenda, reativação) foram decididas em 2026-10-12 — ver a atualização abaixo.

## Atualização de 2026-10-12 ([#311](https://github.com/KalleoPinheiro/vitta-flow/issues/311))

Decisões de @KalleoPinheiro sobre o que a primeira versão deixou sem processar. Não mudam a
decisão acima; completam o que o job cobre ([spec](../../.specs/features/retencao-restante/spec.md)).

1. **Fila `waiting` vencida:** quando o período desejado termina, a entrada vira `expired`; daí
   contam os 2 anos e ela é anonimizada como as resolvidas (AGE-RN-14, AGE-RN-15).
2. **Contas de parceiro inativas:** mesma regra das contas da equipe, 2 anos após a desativação
   (ACE-RN-45, EQP-RN-07).
3. **Textos livres de fatura:** descrição e motivo do desconto são anonimizados junto com o
   paciente; valores, datas e status ficam pelo prazo fiscal (FIN-RN-13).
4. **Google Agenda:** o job apaga os eventos que o sistema criou para o paciente anonimizado. O id
   do evento é o marcador: só é limpo depois de apagar, e a falha fica para a próxima execução
   (AGE-RN-16). Complementa o §5 desta decisão.
5. **Reativação:** conta anonimizada não volta; a pessoa entra por convite novo, como conta nova
   (ACE-RN-47).
6. **Cadastro do profissional: guardado.** Nome e conselho aparecem na autoria do prontuário, que
   tem guarda de 20 anos (EQP-RN-08).
7. **Backups: 30 dias de guarda**, como o [runbook](../engineering/producao.md) (§ 5) já faz.
   Depois disso o dado anonimizado também some dos backups: uma cópia de antes da anonimização
   deixa de existir 30 dias depois dela, e restaurar um backup mais antigo desfaz a anonimização
   até o job rodar de novo (idempotente, ele a refaz).

