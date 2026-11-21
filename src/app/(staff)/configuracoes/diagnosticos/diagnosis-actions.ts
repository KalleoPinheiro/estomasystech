'use server';

import { z } from 'zod';
import {
  CreateClinicDiagnosis,
  ImportClinicDiagnoses,
  SetClinicDiagnosisActive,
} from '@/application/taxonomy/clinic-diagnoses';
import { writeClinicId } from '@/lib/auth/tenant-scope';
import { toClinicNursingDiagnosisDto } from '@/lib/dto';
import { CLINIC_DIAGNOSES_API } from '@/lib/server/data/clinic-diagnoses';
import { defineAction } from '@/lib/server/define-action';
import { rolesWithAccessTo } from '@/lib/staff-pages';

/**
 * Catálogo de diagnósticos da clínica (#954): só o Admin de Empresa (mesma matriz da rota
 * `/api/settings/nursing-diagnoses`). Gravação e trilha na mesma transação, no escopo da empresa
 * da sessão. O CSV é lido no navegador e chega como texto: nada é guardado fora do banco.
 */
const ROLES = rolesWithAccessTo(CLINIC_DIAGNOSES_API);

/** 1000 linhas de até ~2,5 mil caracteres cabem com folga. */
const CSV_MAX_CHARS = 2_000_000;

const diagnosisFields = z.object({
  code: z.string().max(10).nullish(),
  label: z.string().min(1).max(200),
  domain: z.string().max(120).nullish(),
  class: z.string().max(120).nullish(),
  edition: z.string().max(120).nullish(),
  definition: z.string().max(2000).nullish(),
});

export const createClinicDiagnosis = defineAction({
  access: { kind: 'staff', roles: ROLES },
  input: diagnosisFields,
  handler: async ({ input, session, tx }) =>
    toClinicNursingDiagnosisDto(
      await new CreateClinicDiagnosis(tx.clinicDiagnoses).execute({
        ...input,
        clinicId: writeClinicId(session),
      }),
    ),
  audit: ({ result }) => ({
    action: 'create',
    resourceType: 'clinic_nursing_diagnosis',
    resourceId: result.id,
    detail: 'cadastrado',
  }),
});

export const importClinicDiagnoses = defineAction({
  access: { kind: 'staff', roles: ROLES },
  input: z.object({ csv: z.string().min(1).max(CSV_MAX_CHARS) }),
  handler: async ({ input, session, tx }) => {
    const result = await new ImportClinicDiagnoses(tx.clinicDiagnoses).execute({
      clinicId: writeClinicId(session),
      csv: input.csv,
    });
    return {
      created: result.created.length,
      duplicates: result.duplicates,
      errors: result.errors,
    };
  },
  audit: ({ result }) =>
    result.created === 0
      ? null
      : {
          action: 'create',
          resourceType: 'clinic_nursing_diagnosis',
          resourceId: 'importacao-csv',
          detail: `importados ${result.created}`,
        },
});

export const setClinicDiagnosisActive = defineAction({
  access: { kind: 'staff', roles: ROLES },
  input: z.object({ id: z.string().min(1).max(100), active: z.boolean() }),
  handler: async ({ input, tx }) =>
    toClinicNursingDiagnosisDto(
      await new SetClinicDiagnosisActive(tx.clinicDiagnoses).execute(input),
    ),
  audit: ({ result }) => ({
    action: 'update',
    resourceType: 'clinic_nursing_diagnosis',
    resourceId: result.id,
    detail: result.active ? 'reativado' : 'desativado',
  }),
});
