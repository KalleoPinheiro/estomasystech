# Passivo de complexidade cognitiva (#731)

Medido em 2026-11-14 na `release/v0.7.0` (ae82b7c) com `complexity/noExcessiveCognitiveComplexity`
(máximo 10). **71 funções em 56 arquivos de `src/`** passam de 10 (maior: 35). O `biome.json` liga a regra
como `error` em todo `src/`; os arquivos abaixo ficam em `warn` numa lista de `overrides`, sem `biome-ignore`.
`tests/**` fica fora da regra, como já está a regra de linhas.

## Como pagar

Refatore o arquivo até a complexidade ≤ 10 e **remova-o da lista** em `biome.json` no mesmo PR: a partir daí
ele reprova (`error`). Subir por domínio: acesso, agenda, financeiro, pacientes-prontuário, portal, o resto.
Nunca acrescente arquivo à lista para fazer o lint passar: código novo nasce ≤ 10.

## Arquivos (maior complexidade medida na função pior)

| Complexidade máx. | Arquivo |
| ---: | --- |
| 35 | `src/app/(staff)/pacientes/[id]/conditions-section.tsx` |
| 32 | `src/app/(staff)/agenda/agenda-screen.tsx` |
| 29 | `src/app/api/accounts/route.ts` |
| 24 | `src/app/portal/consent-card.tsx` |
| 20 | `src/domain/clinic/svg-sanitizer.ts` |
| 19 | `src/app/(staff)/pacientes/patients-client.tsx` |
| 18 | `src/app/(staff)/agenda/appointment-detail.tsx` |
| 18 | `src/app/(staff)/agenda/week-view.tsx` |
| 18 | `src/app/documentos/consentimento/[patientId]/page.tsx` |
| 17 | `src/app/(staff)/configuracoes/accounts-section.tsx` |
| 17 | `src/app/portal/patient-view.tsx` |
| 16 | `src/app/(staff)/pacientes/[id]/care-plans-section.tsx` |
| 16 | `src/app/(staff)/pacientes/patient-form.tsx` |
| 16 | `src/app/api/patients/[id]/route.ts` |
| 16 | `src/domain/billing/commission-payout.ts` |
| 15 | `src/app/(staff)/pacientes/[id]/patient-record-client.tsx` |
| 15 | `src/app/api/appointments/[id]/route.ts` |
| 15 | `src/application/auth/create-account.ts` |
| 15 | `src/lib/use-api-query.ts` |
| 14 | `src/app/(staff)/faturamento/invoice-adjust-forms.tsx` |
| 14 | `src/app/(staff)/parceiros/partners-board.tsx` |
| 14 | `src/app/portal/page.tsx` |
| 14 | `src/components/summary-card.tsx` |
| 14 | `src/components/triage-photo-list.tsx` |
| 14 | `src/domain/professional/professional.ts` |
| 13 | `src/app/(staff)/configuracoes/calendar-integration-section.tsx` |
| 13 | `src/app/(staff)/profissionais/professional-form.tsx` |
| 13 | `src/app/(staff)/profissionais/professionals-board.tsx` |
| 13 | `src/app/(staff)/relatorios/revenue-table.tsx` |
| 13 | `src/app/api/portal/patient/photos/route.ts` |
| 13 | `src/app/documentos/relatorio/[conditionId]/page.tsx` |
| 13 | `src/app/plataforma/clinicas/[id]/clinic-admins-section.tsx` |
| 13 | `src/app/portal/partner-view.tsx` |
| 13 | `src/application/scheduling/waitlist.ts` |
| 13 | `src/domain/clinical/image-sanitizer.ts` |
| 12 | `src/app/(staff)/agenda/calendar-grid.tsx` |
| 12 | `src/app/(staff)/agenda/mobile-month.tsx` |
| 12 | `src/app/(staff)/agenda/status-filter.tsx` |
| 12 | `src/app/(staff)/pacientes/[id]/condition-photos.tsx` |
| 12 | `src/app/(staff)/pacientes/[id]/evolutions-section.tsx` |
| 12 | `src/app/documentos/plano-cuidados/[carePlanId]/page.tsx` |
| 12 | `src/application/guardians/majority-review.ts` |
| 12 | `src/application/taxonomy/import-taxonomy-catalog.ts` |
| 12 | `src/domain/shared/phone.ts` |
| 11 | `src/app/(staff)/_hoje/follow-up-row-actions.tsx` |
| 11 | `src/app/(staff)/agenda/waitlist-panel.tsx` |
| 11 | `src/app/(staff)/auditoria/page.tsx` |
| 11 | `src/app/(staff)/faturamento/invoices-list.tsx` |
| 11 | `src/app/(staff)/majority-review-card.tsx` |
| 11 | `src/app/(staff)/pacientes/[id]/guardian-panel.tsx` |
| 11 | `src/app/api/patients/route.ts` |
| 11 | `src/components/identity-image-field.tsx` |
| 11 | `src/infrastructure/persistence/drizzle/recover-super-admin.ts` |
| 11 | `src/lib/auth/session.ts` |
| 11 | `src/lib/redact.ts` |
| 11 | `src/lib/use-condition-photos.ts` |
