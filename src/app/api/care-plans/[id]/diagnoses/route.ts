import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { AddCarePlanDiagnosis } from '@/application/clinical/add-care-plan-diagnosis';
import { CARE_PLAN_DIAGNOSIS_TYPES } from '@/domain/clinical/care-plan-diagnosis';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { writeScope } from '@/lib/auth/tenant-scope';
import { toCarePlanDiagnosisDto } from '@/lib/dto';

const diagnosisBodySchema = z.object({
  diagnosisCode: z.string().min(1).max(20),
  type: z.enum(CARE_PLAN_DIAGNOSIS_TYPES),
  relatedFactors: z.string().max(2000).nullish(),
  definingCharacteristics: z.string().max(2000).nullish(),
});

type DiagnosisBody = z.infer<typeof diagnosisBodySchema>;

type PesFields = Pick<
  DiagnosisBody,
  'relatedFactors' | 'definingCharacteristics'
>;

function validateRiscoFields(body: PesFields, ctx: z.RefinementCtx): void {
  if (!body.relatedFactors?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['relatedFactors'],
      message: 'Fator relacionado é obrigatório para este tipo de diagnóstico',
    });
  }
  if (body.definingCharacteristics?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['definingCharacteristics'],
      message: 'Diagnóstico de risco não tem características definidoras',
    });
  }
}

function validateRealFields(body: PesFields, ctx: z.RefinementCtx): void {
  if (!body.relatedFactors?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['relatedFactors'],
      message: 'Fator relacionado é obrigatório para este tipo de diagnóstico',
    });
  }
  if (!body.definingCharacteristics?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['definingCharacteristics'],
      message:
        'Característica definidora é obrigatória para este tipo de diagnóstico',
    });
  }
}

function validatePromocaoSaudeFields(
  body: PesFields,
  ctx: z.RefinementCtx,
): void {
  if (body.relatedFactors?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['relatedFactors'],
      message: 'Diagnóstico de promoção da saúde não tem fatores relacionados',
    });
  }
  if (!body.definingCharacteristics?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['definingCharacteristics'],
      message:
        'Característica definidora é obrigatória para este tipo de diagnóstico',
    });
  }
}

/** Espelha as regras PES de `CarePlanDiagnosis` para falhar cedo, com mensagem clara. */
function validatePesFields(body: DiagnosisBody, ctx: z.RefinementCtx): void {
  if (body.type === 'risco') {
    validateRiscoFields(body, ctx);
  } else if (body.type === 'real') {
    validateRealFields(body, ctx);
  } else {
    validatePromocaoSaudeFields(body, ctx);
  }
}

const diagnosisSchema = diagnosisBodySchema.superRefine(validatePesFields);

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = diagnosisSchema.parse(await request.json());
    const { carePlanDiagnoses, carePlans, nursingDiagnoses, auditEvents } =
      await getRepositories(writeScope(guard.session));
    const diagnosis = await new AddCarePlanDiagnosis(
      carePlanDiagnoses,
      carePlans,
      nursingDiagnoses,
    ).execute({
      carePlanId: id,
      diagnosisCode: body.diagnosisCode,
      type: body.type,
      relatedFactors: body.relatedFactors ?? null,
      definingCharacteristics: body.definingCharacteristics ?? null,
    });
    const [plan, catalogEntry] = await Promise.all([
      carePlans.findById(id),
      nursingDiagnoses.findByCode(body.diagnosisCode),
    ]);
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'care_plan_diagnosis',
      resourceId: diagnosis.id,
      patientId: plan?.patientId ?? null,
    });
    return toCarePlanDiagnosisDto(
      diagnosis,
      catalogEntry?.label ?? diagnosis.diagnosisCode,
    );
  });
}
