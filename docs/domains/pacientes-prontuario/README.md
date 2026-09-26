---
title: "Domínio: Pacientes e prontuário"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-26
domain: pacientes-prontuario
---

# Pacientes e prontuário

## Resumo

Cadastro do paciente e o prontuário de estomaterapia: anamnese, evoluções SOAP, condições
clínicas (estomias e feridas) com avaliações seriadas e fotos, planos de cuidado e documentos
clínicos. É dado de saúde sob LGPD: consentimento, imutabilidade e isolamento por empresa são
requisitos, não detalhes.

**Termos ([`CONTEXT.md`](../../../CONTEXT.md)):** `Patient`, `Anamnesis`, `Evolution Note`, `Clinical Condition`, `Condition Assessment`, `Condition Photo`, `Consent Record`.

## Regras de negócio

| ID | Regra | Onde é garantida |
| --- | --- | --- |
| PRO-RN-01 | Paciente: nome ≥ 3 caracteres, e-mail válido e único, telefone obrigatório; inativo não recebe agendamento | `src/domain/patient/patient.ts` |
| PRO-RN-02 | Evolução SOAP é imutável após registrada (exigência COFEN) e exige ao menos um campo | `src/domain/clinical/evolution-note.ts` |
| PRO-RN-03 | Autoria da evolução vem sempre da sessão — o corpo da requisição não escolhe o profissional | `.specs/features/fase-b-clinico-legal-critico/` |
| PRO-RN-04 | Estomia exige tipo (colostomia, ileostomia, urostomia); ferida registra C×L×P em mm e área C×L | `src/domain/clinical/clinical-condition.ts`, `condition-assessment.ts` |
| PRO-RN-05 | Condição resolvida não recebe novas avaliações | `src/application/clinical/add-condition-assessment.ts` |
| PRO-RN-06 | Foto e registro exigem consentimento ativo; texto do termo versionado por hash | `src/domain/consent/consent-record.ts` |
| PRO-RN-07 | Metadados de imagem (EXIF/GPS) removidos antes de gravar | `src/domain/clinical/image-sanitizer.ts` (AD-002) |
| PRO-RN-08 | Profissional só vê pacientes com quem tem consulta ou evolução | `src/domain/clinical/professional-patient-link.ts` |
| PRO-RN-09 | Atestado, relatório e plano de cuidados bloqueiam sem CNPJ e responsável técnico da empresa; atestado exige consulta `completed` | `src/app/documentos/` |
| PRO-RN-10 | Alergias aparecem em destaque no topo do prontuário | UI do prontuário |
| PRO-RN-11 | Exportação LGPD do titular (JSON com o prontuário completo) só para Admins e Profissional com vínculo; o link "Exportar dados (LGPD)" some para quem não pode exportar | `src/app/api/patients/[id]/export/`, `.specs/STATE.md` AD-025 |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Cadastro, busca e desativação de paciente | entregue | `/pacientes` |
| Anamnese estruturada | entregue | `/pacientes/[id]` |
| Evoluções SOAP | entregue | `/pacientes/[id]` |
| Condições, avaliações seriadas, gráfico de cicatrização | entregue | `/pacientes/[id]` |
| Fotos (equipe e envio remoto pelo paciente) e fila de triagem | entregue | `/pacientes/[id]`, `/triagem` |
| Plano de cuidados (diagnóstico, intervenção, resultado) | entregue | `/pacientes/[id]` |
| Documentos: atestado, relatório, plano, consentimento | entregue | `/documentos/*` |

Specs de execução: `.specs/features/{fase-3-compliance-ux-clinico,fase-b-clinico-legal-critico,prontuario-p1-p3-pontuais,documentos-clinicos-pontuais}/`. PRD: [fase 1](../../product/prd-fase-1.md).

## Código

| Camada | Caminho |
| --- | --- |
| domínio | `src/domain/{patient,clinical,consent,taxonomy}/` |
| casos de uso | `src/application/{patients,clinical,taxonomy}/` |
| API | `src/app/api/{patients,conditions,photos,care-plans,care-plan-interventions,care-plan-outcomes,documents,taxonomy}/` |
| UI | `src/app/(staff)/{pacientes,triagem}/`, `src/app/documentos/` |
| testes | `tests/domain/`, `tests/application/`, `e2e/{pacientes,clinico,triagem,plano-cuidados,documentos}.spec.ts` |

## Decisões

- `.specs/STATE.md` AD-002 — sanitização de imagem em TypeScript puro, sem `sharp`
- [ADR-003](../../adr/003-modelo-de-papeis-multi-empresa.md) — acesso clínico do Profissional por vínculo
- Integração: [armazenamento de fotos](../../engineering/integrations/s3-storage.md)
