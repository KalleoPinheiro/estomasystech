import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { AddEvolutionNote } from '@/application/clinical/add-evolution-note';
import { ListEvolutionNotes } from '@/application/clinical/list-evolution-notes';
import type { UserAccountRepository } from '@/domain/auth/user-account';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { assertPatientAccessibleToProfessional } from '@/lib/auth/professional-patient-scope';
import { requireStaffSession } from '@/lib/auth/require-session';
import type { Session } from '@/lib/auth/session';
import {
  clinicScope,
  sessionScope,
  writeClinicId,
} from '@/lib/auth/tenant-scope';
import { toEvolutionNoteDto } from '@/lib/dto';
import { ensureLinkBestEffort } from '@/lib/patient-link';

const evolutionSchema = z.object({
  appointmentId: z.string().nullish(),
  subjective: z.string().max(5000).default(''),
  objective: z.string().max(5000).default(''),
  assessment: z.string().max(5000).default(''),
  plan: z.string().max(5000).default(''),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Autoria automática: sempre a conta autenticada na sessão, nunca o corpo da
 * requisição (issue #64) — sem isso, qualquer papel podia atribuir a nota a
 * outro profissional (autoria forjada), risco de compliance com conselhos
 * profissionais (COFEN). Extraída do handler POST para manter a complexidade
 * dentro do limite do projeto (issue #48).
 */
async function resolveProfessionalId(
  session: Session | null | undefined,
  userAccounts: UserAccountRepository,
): Promise<string | null> {
  if (session?.role === 'profissional') {
    return session.professionalId;
  }
  const subject = session?.subject;
  if (!subject || subject === 'local') {
    return null;
  }
  const account = await userAccounts.findByEmail(subject);
  if (!account) {
    return null;
  }
  return account.professionalId;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { id } = await context.params;
    const { evolutions, auditEvents, professionalPatientLinks } =
      await getRepositories(sessionScope(guard.session));
    await assertPatientAccessibleToProfessional(
      guard.session,
      id,
      professionalPatientLinks,
    );
    const notes = await new ListEvolutionNotes(evolutions).execute({
      patientId: id,
    });
    recordAudit(auditEvents, guard.session, {
      action: 'read',
      resourceType: 'evolutions',
      resourceId: id,
      patientId: id,
    });
    return notes.map(toEvolutionNoteDto);
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  const clinicId = writeClinicId(guard.session);

  return handleRequest(async () => {
    const { id } = await context.params;
    const body = evolutionSchema.parse(await request.json());
    const {
      evolutions,
      patients,
      auditEvents,
      userAccounts,
      professionalPatientLinks,
    } = await getRepositories(clinicScope(clinicId));
    const { session } = guard;
    await assertPatientAccessibleToProfessional(
      session,
      id,
      professionalPatientLinks,
    );
    const professionalId = await resolveProfessionalId(session, userAccounts);
    const note = await new AddEvolutionNote(evolutions, patients).execute({
      patientId: id,
      appointmentId: body.appointmentId ?? null,
      professionalId,
      subjective: body.subjective,
      objective: body.objective,
      assessment: body.assessment,
      plan: body.plan,
    });
    // Nota de evolução com profissional concede/renova o vínculo com o
    // paciente (RBAC-19/20).
    if (professionalId) {
      await ensureLinkBestEffort(professionalPatientLinks, professionalId, id);
    }
    recordAudit(auditEvents, guard.session, {
      action: 'create',
      resourceType: 'evolution',
      resourceId: note.id,
      patientId: id,
    });
    return toEvolutionNoteDto(note);
  });
}
