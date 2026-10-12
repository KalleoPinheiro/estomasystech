---
title: "Integração: cron de retenção e anonimização"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-11
---

# Cron de retenção (`POST /api/retention/run`)

## Propósito

Um agendador externo chama a rota uma vez por dia para **anonimizar** o que passou do prazo de
retenção (#294, [ADR-013](../../adr/013-retencao-por-anonimizacao.md)). Mesmo mecanismo e mesmo
segredo do [cron de lembretes](cron.md). Regras por tipo:
[spec](../../../.specs/features/retencao-anonimizacao/spec.md).

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
{ "clinicalRecords": 1, "photos": 3, "auditEvents": 420, "waitlistEntries": 2, "accounts": 0,
  "platform": { "auditEvents": 15 },
  "clinics": [
    { "clinicId": "…", "clinicalRecords": 1, "photos": 3, "auditEvents": 405, "waitlistEntries": 2, "accounts": 0 }
  ] }
```

| Tipo | Prazo | O que acontece |
| --- | --- | --- |
| `clinicalRecords` | 20 anos após a última atividade clínica do paciente | paciente, prontuário e conta de portal anonimizados (PRO-RN-15) |
| `photos` | junto com o paciente | arquivo apagado do volume (ou bucket); o registro fica |
| `auditEvents` | 5 anos | ator, recurso, paciente e detalhe saem (ACE-RN-44) |
| `waitlistEntries` | 2 anos após a resolução | paciente e observação saem (AGE-RN-14) |
| `accounts` | 2 anos após a desativação | e-mail, senha, sessões, tokens e segundo fator saem (ACE-RN-45) |

Uma entrada por empresa, inclusive suspensa (o prazo é legal). A trilha de plataforma (eventos sem
empresa) vem em `platform`. Até 200 pacientes e 500 fotos por empresa a cada execução; o resto
entra na próxima. Rodar de novo não muda nem conta nada (idempotente). Cada empresa que mudou
algo ganha um evento de auditoria `update`/`retention` só com as contagens.

## Modos de falha

| Situação | Resposta |
| --- | --- |
| `CRON_SECRET` não configurado | `503` — job desativado |
| header ausente ou diferente | `401` |
| falha numa empresa | `200`; a entrada traz `error` genérico e as contagens do que já foi feito (também gravadas na trilha); o detalhe fica no log; as demais seguem |
| falha ao apagar o arquivo de uma foto | `200`; a foto fica pendente e volta na próxima execução |
| falha na trilha de plataforma | `200`; `platform.error` genérico; detalhe no log |

## Teste local

```bash
CRON_SECRET=dev npm run dev
curl -X POST -H "x-cron-secret: dev" http://localhost:3000/api/retention/run
```
