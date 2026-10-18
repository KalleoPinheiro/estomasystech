---
title: "Integração: cron de retenção e anonimização"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
---

# Cron de retenção (`POST /api/retention/run`)

## Propósito

Um agendador externo chama a rota uma vez por dia para **anonimizar** o que passou do prazo de
retenção (#294, [ADR-013](../../adr/013-retencao-por-anonimizacao.md)). Mesmo mecanismo e mesmo
segredo do [cron de lembretes](cron.md). Regras por tipo:
[spec](../../../.specs/features/retencao-anonimizacao/spec.md) e
[#311](../../../.specs/features/retencao-restante/spec.md).

| Campo | Valor |
| --- | --- |
| Direção | **entrada** |
| Obrigatória? | sim em produção (LGPD) |
| Rota | `src/app/api/retention/run/route.ts` |
| Caso de uso | `src/application/retention/run-retention.ts` |
| Repositório | `src/infrastructure/persistence/drizzle/drizzle-retention-repository.ts` |

## Credenciais

| Credencial | Obrigatória | Nota |
| --- | --- | --- |
| `CRON_SECRET` | para a rota existir | o mesmo dos lembretes; comparado em tempo constante |

## Contrato

```http
POST /api/retention/run
x-cron-secret: $CRON_SECRET
```

Ou `GET` com `Authorization: Bearer $CRON_SECRET` (formato do Vercel Cron). Resposta `200` no
envelope `{ success, data }`, só com contagens:

```json
{ "clinicalRecords": 1, "photos": 3, "auditEvents": 420, "waitlistExpired": 1, "waitlistEntries": 2,
  "accounts": 0, "calendarEvents": 4,
  "platform": { "auditEvents": 15 },
  "clinics": [
    { "clinicId": "…", "clinicalRecords": 1, "photos": 3, "auditEvents": 405, "waitlistExpired": 1,
      "waitlistEntries": 2, "accounts": 0, "calendarEvents": 4 }
  ] }
```

| Tipo | Prazo | O que acontece |
| --- | --- | --- |
| `clinicalRecords` | 20 anos após a última atividade clínica do paciente | paciente, prontuário e conta de portal anonimizados (PRO-RN-15) |
| `photos` | junto com o paciente | arquivo apagado do volume (ou bucket); o registro fica |
| `auditEvents` | 5 anos | ator, recurso, paciente e detalhe saem (ACE-RN-44) |
| `calendarEvents` | junto com o paciente | evento apagado no Google Agenda da clínica; só então o id é limpo (AGE-RN-16) |
| `waitlistExpired` | período desejado terminado | entrada `waiting` vira `expired` (AGE-RN-15); não é anonimização, é o início do prazo de 2 anos |
| `waitlistEntries` | 2 anos após a resolução ou a expiração | paciente e observação saem (AGE-RN-14) |
| `accounts` | 2 anos após a desativação | e-mail, senha, sessões, tokens e segundo fator saem; vale para equipe, paciente e parceiro (ACE-RN-45, EQP-RN-07). A conta anonimizada não é reativada (ACE-RN-47) |

Junto com o paciente (`clinicalRecords`) também saem a descrição e o motivo do desconto das
faturas dele (FIN-RN-13).

**Fronteira (#323, [ADR-031](../../adr/031-retencao-em-dias-inteiros-e-fonte-unica.md)):** o prazo
conta em dias inteiros no `APP_TIMEZONE`. Na execução de 18/10/2026, um evento de 18/10/2021 (a
qualquer hora) fica; sai na de 19/10/2026. Os prazos moram em `RETENTION_YEARS`
(`src/domain/retention/retention-policy.ts`), que o aviso de privacidade lê; mudar um deles exige
subir `PRIVACY_NOTICE_VERSION`.

Uma entrada por empresa, inclusive suspensa (o prazo é legal). A trilha de plataforma (eventos sem
empresa) vem em `platform`. Até 200 pacientes e 500 fotos por empresa a cada execução; o resto
entra na próxima. Rodar de novo não muda nem conta nada (idempotente). Cada empresa que mudou
algo ganha um evento de auditoria `update`/`retention` só com as contagens. A trilha de plataforma
ganha um a **cada execução**, mesmo com tudo zero, com `clinics` (empresas processadas),
`failedClinics` (quantas falharam, sem identificar) e `auditTrailCutoff` (o corte usado): é o
registro de que o job rodou (#323).

## Modos de falha

| Situação | Resposta |
| --- | --- |
| `CRON_SECRET` não configurado | `503` — job desativado |
| header ausente ou diferente | `401` |
| falha numa empresa | `200`; a entrada traz `error` genérico e as contagens do que já foi feito (também gravadas na trilha); o detalhe fica no log; as demais seguem |
| falha ao apagar o arquivo de uma foto | `200`; a foto fica pendente e volta na próxima execução |
| falha ao apagar um evento do Google Agenda (ou ao ler a credencial) | `200`; o id do evento fica e volta na próxima execução. Sem integração configurada, nada é apagado |
| falha na trilha de plataforma | `200`; `platform.error` genérico; detalhe no log |

## Teste local

```bash
CRON_SECRET=dev npm run dev
curl -X POST -H "x-cron-secret: dev" http://localhost:3000/api/retention/run
```
