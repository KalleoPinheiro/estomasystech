import { beforeAll, describe, expect, it } from 'vitest';
import { TimeSlot } from '@/domain/shared/time-slot';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  buildAppointment,
  buildPatient,
  buildProfessional,
} from '../support/builders';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * #603 e #605: as ações sobre uma consulta (confirmar, concluir, cancelar,
 * marcar falta e remarcar) aplicam a R4 na rota `PATCH /api/appointments/:id`:
 * Profissional sem vínculo recebe 403, consulta de outra empresa recebe 404, e
 * a tentativa negada não grava nem audita. Agendar (avulso ou série) só vale
 * no nome do próprio Profissional. Série com paciente alheio é 404 sem trilha.
 */

let week = 0;
/** Segunda-feira distante, 10:00 em São Paulo (13:00Z), dentro da grade padrão. */
const slot = (hourUtc = 13) => {
  const start = new Date(Date.UTC(2033, 0, 3 + 28 * week, hourUtc, 0));
  return {
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 30 * 60_000).toISOString(),
  };
};

const PATCH_BODIES = {
  confirm: () => ({ action: 'confirm' }),
  complete: () => ({ action: 'complete' }),
  cancel: () => ({ action: 'cancel', requestedBy: 'clinic' }),
  no_show: () => ({ action: 'no_show' }),
  reschedule: () => ({ action: 'reschedule', ...slot(15) }),
} as const;
type Action = keyof typeof PATCH_BODIES;
const ACTIONS = Object.keys(PATCH_BODIES) as Action[];

describe('Feature: R4 nas ações de consulta (#603, #605)', () => {
  let linkedProfessionalId: string;
  let strangerProfessionalId: string;

  const as = (
    role: 'profissional' | 'atendente' | 'company_admin',
    professionalId?: string,
    clinicId = CLINIC_A_ID,
  ) => cookieHeaderFor(role, `${role}@clinica.com`, clinicId, professionalId);

  const seed = async (clinicId: string = CLINIC_A_ID) => {
    week += 1;
    const repos = await getRepositories(clinicScope(clinicId));
    const patient = buildPatient();
    await repos.patients.save(patient);
    const { startsAt, endsAt } = slot();
    const appointment = buildAppointment({
      patientId: patient.id,
      slot: TimeSlot.create(new Date(startsAt), new Date(endsAt)),
    });
    await repos.appointments.save(appointment);
    if (clinicId === CLINIC_A_ID) {
      await repos.professionalPatientLinks.ensureLink(
        linkedProfessionalId,
        patient.id,
      );
    }
    return { repos, patient, appointment };
  };

  const patch = async (
    id: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ) => {
    const route = await import('@/app/api/appointments/[id]/route');
    return route.PATCH(
      jsonRequest(`/api/appointments/${id}`, 'PATCH', body, headers),
      { params: Promise.resolve({ id }) },
    );
  };

  const auditOf = async (resourceId: string) => {
    const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
    return (await auditEvents.findAll()).filter(
      (event) => event.resourceId === resourceId,
    );
  };

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

  describe.each(ACTIONS)('Cenário: %s', (action) => {
    it('Dado profissional sem vínculo com o paciente, Quando age sobre a consulta, Então recebe 403 e nada muda', async () => {
      const { repos, appointment } = await seed();

      const response = await patch(
        appointment.id,
        PATCH_BODIES[action](),
        as('profissional', strangerProfessionalId),
      );

      expect(response.status).toBe(403);
      const after = await repos.appointments.findById(appointment.id);
      expect(after?.status).toBe(appointment.status);
      expect(after?.slot.start).toEqual(appointment.slot.start);
    });

    it('Dado consulta de outra empresa, Quando o profissional age sobre ela, Então recebe 404', async () => {
      const { appointment } = await seed(CLINIC_B_ID);

      const response = await patch(
        appointment.id,
        PATCH_BODIES[action](),
        as('profissional', linkedProfessionalId),
      );

      expect(response.status).toBe(404);
    });

    it('Dado profissional vinculado, Quando age sobre a consulta, Então a ação é aceita', async () => {
      const { appointment } = await seed();

      const response = await patch(
        appointment.id,
        PATCH_BODIES[action](),
        as('profissional', linkedProfessionalId),
      );

      expect(response.status).toBe(200);
    });

    it('Dado atendente, Quando age sobre consulta de qualquer paciente, Então mantém o acesso', async () => {
      const { appointment } = await seed();

      const response = await patch(
        appointment.id,
        PATCH_BODIES[action](),
        as('atendente'),
      );

      expect(response.status).toBe(200);
    });
  });

  it('Dado profissional sem vínculo, Quando tenta confirmar, Então não há evento de auditoria da consulta', async () => {
    const { appointment } = await seed();

    await patch(
      appointment.id,
      PATCH_BODIES.confirm(),
      as('profissional', strangerProfessionalId),
    );

    expect(await auditOf(appointment.id)).toHaveLength(0);
  });

  describe('Cenário: agendar só no próprio nome', () => {
    const book = async (
      path: 'route' | 'recurring',
      patientId: string,
      professionalId: string | null,
      headers: Record<string, string>,
    ) => {
      week += 1;
      const body = {
        patientId,
        ...slot(),
        procedure: 'Curativo',
        priceCents: 9000,
        professionalId,
        ...(path === 'recurring' ? { occurrences: 2 } : {}),
      };
      if (path === 'recurring') {
        const route = await import('@/app/api/appointments/recurring/route');
        return route.POST(
          jsonRequest('/api/appointments/recurring', 'POST', body, headers),
        );
      }
      const route = await import('@/app/api/appointments/route');
      return route.POST(
        jsonRequest('/api/appointments', 'POST', body, headers),
      );
    };

    it.each(['route', 'recurring'] as const)(
      'Dado profissional, Quando agenda (%s) com o professionalId de outro, Então recebe 403 e não concede vínculo',
      async (path) => {
        const { repos, patient } = await seed();

        const response = await book(
          path,
          patient.id,
          strangerProfessionalId,
          as('profissional', linkedProfessionalId),
        );

        expect(response.status).toBe(403);
        expect(
          await repos.professionalPatientLinks.hasLink(
            strangerProfessionalId,
            patient.id,
          ),
        ).toBe(false);
      },
    );

    it.each(['route', 'recurring'] as const)(
      'Dado profissional, Quando agenda (%s) em seu próprio nome para paciente novo, Então é aceito e ganha o vínculo',
      async (path) => {
        const { repos } = await seed();
        const fresh = buildPatient();
        await repos.patients.save(fresh);

        const response = await book(
          path,
          fresh.id,
          linkedProfessionalId,
          as('profissional', linkedProfessionalId),
        );

        expect(response.status).toBe(200);
        expect(
          await repos.professionalPatientLinks.hasLink(
            linkedProfessionalId,
            fresh.id,
          ),
        ).toBe(true);
      },
    );

    it('Dado atendente, Quando agenda com qualquer profissional, Então é aceito', async () => {
      const { patient } = await seed();

      const response = await book(
        'route',
        patient.id,
        strangerProfessionalId,
        as('atendente'),
      );

      expect(response.status).toBe(200);
    });
  });

  describe('Cenário: série com paciente alheio (#605)', () => {
    const recurring = async (
      patientId: string,
      headers: Record<string, string>,
    ) => {
      week += 1;
      const route = await import('@/app/api/appointments/recurring/route');
      return route.POST(
        jsonRequest(
          '/api/appointments/recurring',
          'POST',
          {
            patientId,
            ...slot(),
            procedure: 'Curativo',
            priceCents: 9000,
            occurrences: 2,
          },
          headers,
        ),
      );
    };

    it('Dado paciente inexistente, Quando agenda a série, Então recebe 404 e não audita', async () => {
      const response = await recurring('nao-existe', as('atendente'));

      expect(response.status).toBe(404);
      expect(await auditOf('nao-existe')).toHaveLength(0);
    });

    it('Dado paciente de outra empresa, Quando agenda a série, Então recebe 404', async () => {
      const { patient } = await seed(CLINIC_B_ID);

      const response = await recurring(patient.id, as('company_admin'));

      expect(response.status).toBe(404);
    });
  });
});
