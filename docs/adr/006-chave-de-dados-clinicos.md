---
title: "ADR 006 — Chave dedicada e versionada para o dado clínico em repouso"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-26
---

# ADR 006 — Chave dedicada e versionada para o dado clínico em repouso

- **Data:** 2026-09-26
- **Status:** aceito (decisão do dono do produto na issue [#195](https://github.com/KalleoPinheiro/vitta-flow/issues/195))
- **Domínios afetados:** pacientes-prontuario, agenda, acesso

## Contexto

Os campos clínicos cifrados (SOAP, notas de condição e de avaliação) usavam como chave
`sha256(AUTH_SECRET)` — o mesmo segredo que assina o cookie de sessão —, sem KDF com contexto e
sem identificador de chave no payload (`iv.tag.ct`). Rotacionar o `AUTH_SECRET` (resposta a
incidente, "derrubar todas as sessões") tornava todo o prontuário cifrado ilegível, e o vazamento
de um único segredo comprometia sessão e dado em repouso. A cobertura era parcial: anamnese,
observações do paciente, das consultas, da lista de espera, da foto enviada pelo portal e do plano
de cuidados ficavam em claro. A migração de dado (`scripts/encrypt-clinical-fields.ts`) não era
executável em produção.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — `DATA_ENCRYPTION_KEY` própria, id de chave derivado no payload, chaves anteriores só para leitura | rotação sem perda; operador não numera versões | chave nova para guardar e fazer backup |
| B — KMS gerenciado (AWS KMS, GCP KMS) | custódia fora da aplicação | dependência externa por leitura; custo; fora do alvo Vercel + Supabase sem mais decisão |
| C — manter `AUTH_SECRET` e só ampliar a cobertura | nada a configurar | mantém o acoplamento que a issue manda desfazer |

## Decisão

**Opção A.** `src/lib/data-cipher.ts`:

- Chave: `DATA_ENCRYPTION_KEY` (≥ 32 caracteres), AES-256-GCM com chave derivada por
  HKDF-SHA256 (info `vitta-flow/clinical-data/v1`). Obrigatória em produção; fora dela, sem a
  variável, cai numa chave de desenvolvimento derivada do `AUTH_SECRET`, com aviso.
- Payload `v1.<keyId>.<iv>.<tag>.<ct>`; `keyId` = 8 hex de `sha256("vitta-flow/key-id:" + chave)`.
  Número de versão digitado pelo operador foi rejeitado: um erro de numeração vira dado ilegível.
- Rotação: a chave nova vai para `DATA_ENCRYPTION_KEY`, a antiga para
  `DATA_ENCRYPTION_KEY_PREVIOUS` (lista); `npm run data:reencrypt` regrava tudo com a atual; depois
  a antiga sai da lista.
- Legado: `iv.tag.ct` (chave do `AUTH_SECRET`) é lido enquanto o `AUTH_SECRET` antigo estiver
  configurado; texto em claro é devolvido como está (lançar deixaria a ficha em 500 entre o deploy
  e a recifra). Payload `v1` com id desconhecido ou adulterado lança.
- Cobertura: SOAP (4), `clinical_conditions.notes`, `condition_assessments.notes`, `.skin_condition` e `.complications` (texto livre da avaliação), anamnese (5),
  `patients.notes`, `appointments.notes`, `waitlist_entries.notes`,
  `condition_photos.patient_note`, `care_plan_diagnoses.related_factors` e
  `.defining_characteristics`, `outcome_evaluations.notes`, `intervention_records.notes`, além do
  refresh token do Google Agenda.
- Fotos: `PutObject` com `ServerSideEncryption` conforme `S3_SSE` (`AES256` padrão, `aws:kms`, ou
  `provider` para provedor que já cifra e rejeita o cabeçalho). Disco local (VPS) conta com a cifra
  do volume no host, documentada no runbook.

B fica para quando houver exigência de custódia externa; C não resolve a issue.

## Consequências

**Positivas**

- `AUTH_SECRET` pode ser rotacionado sem tocar no dado clínico.
- Rotação da chave de dados sem janela de indisponibilidade.
- Todo texto clínico livre fica cifrado em repouso.

**Negativas / custos aceitos**

- Perder `DATA_ENCRYPTION_KEY` é perder o prontuário cifrado: a chave entra no cofre de segredos e
  no procedimento de backup ([`producao.md`](../engineering/producao.md)).
- Campo cifrado não é pesquisável nem ordenável no banco (nenhum dos campos cobertos era).
- Até a recifra rodar, linhas antigas continuam no formato anterior (legíveis, não reprotegidas).
