import { beforeAll, describe, expect, it } from 'vitest';
import { FollowUp } from '@/domain/followup/follow-up';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { buildPatient, buildProfessional } from '../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * #597: `PATCH /api/follow-ups/:id` aplica a mesma R4 e o mesmo escopo de
 * empresa da ação `resolveFollowUp` da tela Hoje (#548): Profissional sem
 * vínculo recebe 403 sem nada gravado; outra empresa recebe 404; a gravação e
 * a auditoria saem na mesma transação (ADR-075).
 */

const patch = async (
  id: string,
  status: string,
  headers: Record<string, string>,
) => {
  const route = await import('@/app/api/follow-ups/[id]/route');
  return route.PATCH(
    jsonRequest(`/api/follow-ups/${id}`, 'PATCH', { status }, headers),
    { params: Promise.resolve({ id }) },
  );
};

const auditOf = async (resourceId: string) => {
  const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
  return (await auditEvents.findAll()).filter(
    (event) => event.resourceId === resourceId,
  );
};

describe('Feature: PATCH /api/follow-ups/:id aplica R4 (#597)', () => {
  let linkedProfessionalId: string;
  let strangerProfessionalId: string;

  const seed = async (clinicId: string = CLINIC_A_ID) => {
    const repos = await getRepositories(clinicScope(clinicId));
    const patient = buildPatient();
    await repos.patients.save(patient);
    const followUp = FollowUp.create({
      patientId: patient.id,
      appointmentId: null,
      dueDate: new Date('2026-10-30T12:00:00Z'),
      reason: 'Retorno: avaliação de ferida',
    });
    await repos.followUps.save(followUp);
    await repos.professionalPatientLinks.ensureLink(
      linkedProfessionalId,
      patient.id,
    );
    return { repos, followUp };
  };

  const as = (
    role: 'profissional' | 'atendente' | 'company_admin',
    id?: string,
  ) => cookieHeaderFor(role, `${role}@clinica.com`, CLINIC_A_ID, id ?? null);

  beforeAll(async () => {
    await ensureTestClinics();
    const repos = await getRepositories(clinicScope(CLINIC_A_ID));
    const linked = buildProfessional();
    const stranger = buildProfessional();
    await repos.professionals.save(linked);
    await repos.professionals.save(stranger);
    linkedProfessionalId = linked.id;
    strangerProfessionalId = stranger.id;
  });

  it('Dado profissional sem vínculo com o paciente, Quando cancela o retorno, Então recebe 403 e nada é gravado nem auditado', async () => {
    const { repos, followUp } = await seed();

    const response = await patch(
      followUp.id,
      'cancelled',
      as('profissional', strangerProfessionalId),
    );

    expect(response.status).toBe(403);
    expect((await repos.followUps.findById(followUp.id))?.status).toBe(
      'pending',
    );
    expect(await auditOf(followUp.id)).toHaveLength(0);
  });

  it('Dado profissional sem professionalId na sessão, Quando conclui o retorno, Então recebe 403', async () => {
    const { repos, followUp } = await seed();

    const response = await patch(followUp.id, 'done', as('profissional'));

    expect(response.status).toBe(403);
    expect((await repos.followUps.findById(followUp.id))?.status).toBe(
      'pending',
    );
  });

  it('Dado profissional vinculado, Quando conclui o retorno, Então recebe 200, grava e audita', async () => {
    const { repos, followUp } = await seed();

    const response = await patch(
      followUp.id,
      'done',
      as('profissional', linkedProfessionalId),
    );

    expect(response.status).toBe(200);
    expect((await repos.followUps.findById(followUp.id))?.status).toBe('done');
    const [event] = await auditOf(followUp.id);
    expect(event?.resourceType).toBe('follow_up');
    expect(event?.detail).toBe('retorno: done');
  });

  it.each(['company_admin', 'atendente'] as const)(
    'Dado %s, Quando cancela o retorno de qualquer paciente, Então mantém o acesso (200) e audita',
    async (role) => {
      const { repos, followUp } = await seed();

      const response = await patch(followUp.id, 'cancelled', as(role));

      expect(response.status).toBe(200);
      expect((await repos.followUps.findById(followUp.id))?.status).toBe(
        'cancelled',
      );
      expect(await auditOf(followUp.id)).toHaveLength(1);
    },
  );

  it('Dado retorno de outra empresa, Quando profissional da clínica A o cancela, Então recebe 404 e nada muda', async () => {
    const { repos, followUp } = await seed(CLINIC_B_ID);

    const response = await patch(
      followUp.id,
      'cancelled',
      as('profissional', linkedProfessionalId),
    );

    expect(response.status).toBe(404);
    expect((await repos.followUps.findById(followUp.id))?.status).toBe(
      'pending',
    );
  });

  it('Dado que não há sessão, Quando chama o PATCH, Então recebe 401 e nada muda', async () => {
    const { repos, followUp } = await seed();

    const response = await patch(followUp.id, 'cancelled', { cookie: '' });

    expect(response.status).toBe(401);
    expect((await repos.followUps.findById(followUp.id))?.status).toBe(
      'pending',
    );
  });
});
