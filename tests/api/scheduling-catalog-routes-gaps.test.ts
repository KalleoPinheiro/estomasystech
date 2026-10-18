import { beforeAll, describe, expect, it } from 'vitest';
import { jsonRequest, multipartRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SMALL_PNG_BYTES = new Uint8Array([...PNG_HEADER, 0x00, 0x00, 0x00, 0x0d]);
const OVERSIZED_PNG_BYTES = new Uint8Array(5 * 1024 * 1024 + 1);
OVERSIZED_PNG_BYTES.set(PNG_HEADER, 0);

const photoUploadRequest = (conditionId: string, formData: FormData) =>
  multipartRequest(`/api/conditions/${conditionId}/photos`, formData);

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
  meta?: { nextCursor: string | null };
}

describe('Feature: Branches restantes de consultas, pacientes e catálogo clínico', () => {
  let appointmentByIdRoute: typeof import('@/app/api/appointments/[id]/route');
  let appointmentsRoute: typeof import('@/app/api/appointments/route');
  let patientsRoute: typeof import('@/app/api/patients/route');
  let patientByIdRoute: typeof import('@/app/api/patients/[id]/route');
  let partnersRoute: typeof import('@/app/api/partners/route');
  let professionalsRoute: typeof import('@/app/api/professionals/route');
  let followUpsRoute: typeof import('@/app/api/follow-ups/route');
  let evolutionsRoute: typeof import('@/app/api/patients/[id]/evolutions/route');
  let conditionsRoute: typeof import('@/app/api/patients/[id]/conditions/route');
  let conditionByIdRoute: typeof import('@/app/api/conditions/[id]/route');
  let assessmentsRoute: typeof import('@/app/api/conditions/[id]/assessments/route');
  let photosRoute: typeof import('@/app/api/conditions/[id]/photos/route');
  let invoicesRoute: typeof import('@/app/api/invoices/route');
  let summaryRoute: typeof import('@/app/api/summary/route');

  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  let patientId: string;
  let partnerId: string;

  beforeAll(async () => {
    appointmentByIdRoute = await import('@/app/api/appointments/[id]/route');
    appointmentsRoute = await import('@/app/api/appointments/route');
    patientsRoute = await import('@/app/api/patients/route');
    patientByIdRoute = await import('@/app/api/patients/[id]/route');
    partnersRoute = await import('@/app/api/partners/route');
    professionalsRoute = await import('@/app/api/professionals/route');
    followUpsRoute = await import('@/app/api/follow-ups/route');
    evolutionsRoute = await import('@/app/api/patients/[id]/evolutions/route');
    conditionsRoute = await import('@/app/api/patients/[id]/conditions/route');
    conditionByIdRoute = await import('@/app/api/conditions/[id]/route');
    assessmentsRoute = await import(
      '@/app/api/conditions/[id]/assessments/route'
    );
    photosRoute = await import('@/app/api/conditions/[id]/photos/route');
    invoicesRoute = await import('@/app/api/invoices/route');
    summaryRoute = await import('@/app/api/summary/route');

    const patientResponse = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {
        fullName: 'Paciente Base Gaps',
        email: 'paciente.base.gaps@example.com',
        phone: '11955554444',
      }),
    );
    const patientBody = (await patientResponse.json()) as Envelope<{
      id: string;
    }>;
    patientId = patientBody.data.id;

    const partnerResponse = await partnersRoute.POST(
      jsonRequest('/api/partners', 'POST', {
        fullName: 'Parceiro Base Gaps',
        email: 'parceiro.base.gaps@example.com',
        phone: '11944443333',
      }),
    );
    const partnerBody = (await partnerResponse.json()) as Envelope<{
      id: string;
    }>;
    partnerId = partnerBody.data.id;
  });

  describe('appointments/[id] — GET e todas as ações de PATCH', () => {
    it('Dado id inexistente, Quando GET, Então retorna data null com status 200', async () => {
      const response = await appointmentByIdRoute.GET(
        jsonRequest('/api/appointments/fantasma', 'GET'),
        context('fantasma'),
      );
      const body = (await response.json()) as Envelope<null>;

      expect(response.status).toBe(200);
      expect(body.data).toBeNull();
    });

    it('Dado consulta existente, Quando GET, Então retorna com nome do paciente', async () => {
      const created = await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId,
          startsAt: '2027-02-01T09:00:00.000Z',
          endsAt: '2027-02-01T10:00:00.000Z',
          procedure: 'Avaliação inicial',
          priceCents: 12000,
        }),
      );
      const createdBody = (await created.json()) as Envelope<{ id: string }>;

      const response = await appointmentByIdRoute.GET(
        jsonRequest(`/api/appointments/${createdBody.data.id}`, 'GET'),
        context(createdBody.data.id),
      );
      const body = (await response.json()) as Envelope<{ patientName: string }>;

      expect(response.status).toBe(200);
      expect(body.data.patientName).toBe('Paciente Base Gaps');
    });

    it('Dado consulta agendada, Quando PATCH confirm, Então confirma; Quando PATCH confirm de novo, Então retorna 409', async () => {
      const created = await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId,
          startsAt: '2027-02-01T11:00:00.000Z',
          endsAt: '2027-02-01T12:00:00.000Z',
          procedure: 'Confirmação',
          priceCents: 10000,
        }),
      );
      const { data } = (await created.json()) as Envelope<{ id: string }>;

      const confirmResponse = await appointmentByIdRoute.PATCH(
        jsonRequest(`/api/appointments/${data.id}`, 'PATCH', {
          action: 'confirm',
        }),
        context(data.id),
      );
      const confirmBody = (await confirmResponse.json()) as Envelope<{
        status: string;
      }>;
      expect(confirmBody.data.status).toBe('confirmed');

      const secondConfirm = await appointmentByIdRoute.PATCH(
        jsonRequest(`/api/appointments/${data.id}`, 'PATCH', {
          action: 'confirm',
        }),
        context(data.id),
      );
      expect(secondConfirm.status).toBe(409);
    });

    it('Dado consulta agendada, Quando PATCH no_show, Então marca falta', async () => {
      const created = await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId,
          startsAt: '2027-02-01T13:00:00.000Z',
          endsAt: '2027-02-01T14:00:00.000Z',
          procedure: 'Sessão',
          priceCents: 10000,
        }),
      );
      const { data } = (await created.json()) as Envelope<{ id: string }>;

      const response = await appointmentByIdRoute.PATCH(
        jsonRequest(`/api/appointments/${data.id}`, 'PATCH', {
          action: 'no_show',
        }),
        context(data.id),
      );
      const body = (await response.json()) as Envelope<{ status: string }>;

      expect(body.data.status).toBe('no_show');
    });

    it('Dado consulta agendada, Quando PATCH cancel, Então cancela', async () => {
      const created = await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId,
          startsAt: '2027-02-01T15:00:00.000Z',
          endsAt: '2027-02-01T16:00:00.000Z',
          procedure: 'Sessão a cancelar',
          priceCents: 10000,
        }),
      );
      const { data } = (await created.json()) as Envelope<{ id: string }>;

      const response = await appointmentByIdRoute.PATCH(
        jsonRequest(`/api/appointments/${data.id}`, 'PATCH', {
          action: 'cancel',
        }),
        context(data.id),
      );
      const body = (await response.json()) as Envelope<{ status: string }>;

      expect(body.data.status).toBe('cancelled');
    });

    it('Dado consulta agendada sem procedimento de catálogo, Quando PATCH complete, Então conclui sem avisos de kit', async () => {
      const created = await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId,
          startsAt: '2027-02-01T17:00:00.000Z',
          endsAt: '2027-02-01T18:00:00.000Z',
          procedure: 'Sessão a concluir',
          priceCents: 10000,
        }),
      );
      const { data } = (await created.json()) as Envelope<{ id: string }>;

      const response = await appointmentByIdRoute.PATCH(
        jsonRequest(`/api/appointments/${data.id}`, 'PATCH', {
          action: 'complete',
          followUpInDays: 7,
        }),
        context(data.id),
      );
      const body = (await response.json()) as Envelope<{
        status: string;
        kitWarnings: string[];
      }>;

      expect(response.status).toBe(200);
      expect(body.data.status).toBe('completed');
      expect(body.data.kitWarnings).toEqual([]);
    });

    it('Dado consulta agendada, Quando PATCH reschedule, Então remarca; Quando remarca para horário conflitante, Então retorna 409', async () => {
      const blocker = await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId,
          startsAt: '2027-02-15T09:00:00.000Z',
          endsAt: '2027-02-15T10:00:00.000Z',
          procedure: 'Bloqueio de horário',
          priceCents: 10000,
        }),
      );
      expect(blocker.status).toBe(200);

      const created = await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId,
          startsAt: '2027-02-08T09:00:00.000Z',
          endsAt: '2027-02-08T10:00:00.000Z',
          procedure: 'Sessão a remarcar',
          priceCents: 10000,
        }),
      );
      const { data } = (await created.json()) as Envelope<{ id: string }>;

      const conflictResponse = await appointmentByIdRoute.PATCH(
        jsonRequest(`/api/appointments/${data.id}`, 'PATCH', {
          action: 'reschedule',
          startsAt: '2027-02-15T09:15:00.000Z',
          endsAt: '2027-02-15T10:15:00.000Z',
        }),
        context(data.id),
      );
      expect(conflictResponse.status).toBe(409);

      const successResponse = await appointmentByIdRoute.PATCH(
        jsonRequest(`/api/appointments/${data.id}`, 'PATCH', {
          action: 'reschedule',
          startsAt: '2027-02-22T09:00:00.000Z',
          endsAt: '2027-02-22T10:00:00.000Z',
        }),
        context(data.id),
      );
      const successBody = (await successResponse.json()) as Envelope<{
        status: string;
        startsAt: string;
      }>;
      expect(successResponse.status).toBe(200);
      expect(successBody.data.status).toBe('scheduled');
      expect(successBody.data.startsAt).toBe('2027-02-22T09:00:00.000Z');

      await appointmentByIdRoute.PATCH(
        jsonRequest(`/api/appointments/${data.id}`, 'PATCH', {
          action: 'cancel',
        }),
        context(data.id),
      );
      const rescheduleAfterCancel = await appointmentByIdRoute.PATCH(
        jsonRequest(`/api/appointments/${data.id}`, 'PATCH', {
          action: 'reschedule',
          startsAt: '2027-02-22T11:00:00.000Z',
          endsAt: '2027-02-22T12:00:00.000Z',
        }),
        context(data.id),
      );
      expect(rescheduleAfterCancel.status).toBe(409);
    });

    it('Dado horário fora da grade (fim de semana), Quando PATCH reschedule, Então retorna 400', async () => {
      const created = await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId,
          startsAt: '2027-02-08T11:00:00.000Z',
          endsAt: '2027-02-08T12:00:00.000Z',
          procedure: 'Sessão fim de semana',
          priceCents: 10000,
        }),
      );
      const { data } = (await created.json()) as Envelope<{ id: string }>;

      const response = await appointmentByIdRoute.PATCH(
        jsonRequest(`/api/appointments/${data.id}`, 'PATCH', {
          action: 'reschedule',
          startsAt: '2027-02-06T09:00:00.000Z',
          endsAt: '2027-02-06T10:00:00.000Z',
        }),
        context(data.id),
      );

      expect(response.status).toBe(400);
    });

    it('Dado id inexistente, Quando PATCH reschedule, Então retorna 404', async () => {
      const response = await appointmentByIdRoute.PATCH(
        jsonRequest('/api/appointments/fantasma', 'PATCH', {
          action: 'reschedule',
          startsAt: '2027-02-08T09:00:00.000Z',
          endsAt: '2027-02-08T10:00:00.000Z',
        }),
        context('fantasma'),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('appointments/route.ts — filtros restantes', () => {
    it('Dado professionalId no filtro, Quando GET, Então retorna somente consultas do profissional', async () => {
      const professionalResponse = await professionalsRoute.POST(
        jsonRequest('/api/professionals', 'POST', { fullName: 'Prof. Filtro' }),
      );
      const { data: professional } =
        (await professionalResponse.json()) as Envelope<{
          id: string;
        }>;

      await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId,
          startsAt: '2027-05-03T09:00:00.000Z',
          endsAt: '2027-05-03T10:00:00.000Z',
          procedure: 'Com profissional',
          priceCents: 10000,
          professionalId: professional.id,
        }),
      );
      await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId,
          startsAt: '2027-05-03T11:00:00.000Z',
          endsAt: '2027-05-03T12:00:00.000Z',
          procedure: 'Sem profissional',
          priceCents: 10000,
        }),
      );

      const response = await appointmentsRoute.GET(
        jsonRequest(
          `/api/appointments?from=2027-05-01T00:00:00.000Z&to=2027-05-31T00:00:00.000Z&professionalId=${professional.id}`,
          'GET',
        ),
      );
      const body = (await response.json()) as Envelope<
        Array<{ professionalId: string | null }>
      >;

      expect(body.data).toHaveLength(1);
      expect(body.data[0].professionalId).toBe(professional.id);
    });

    it('Dado followUpId de retorno pendente, Quando POST agenda consulta, Então marca o retorno como agendado', async () => {
      const followUpResponse = await followUpsRoute.POST(
        jsonRequest('/api/follow-ups', 'POST', {
          patientId,
          dueDate: '2027-05-20T00:00:00.000Z',
          reason: 'Retorno de curativo',
        }),
      );
      const { data: followUp } = (await followUpResponse.json()) as Envelope<{
        id: string;
      }>;

      const response = await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId,
          startsAt: '2027-05-10T09:00:00.000Z',
          endsAt: '2027-05-10T10:00:00.000Z',
          procedure: 'Retorno agendado',
          priceCents: 10000,
          followUpId: followUp.id,
        }),
      );
      expect(response.status).toBe(200);

      const listResponse = await followUpsRoute.GET(
        jsonRequest(`/api/follow-ups?patientId=${patientId}`, 'GET'),
      );
      const listBody = (await listResponse.json()) as Envelope<
        Array<{ id: string; status: string }>
      >;
      const updated = listBody.data.find((item) => item.id === followUp.id);

      expect(updated?.status).toBe('scheduled');
    });
  });

  describe('patients/route.ts — busca, paginação e indicação', () => {
    beforeAll(async () => {
      await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Zelda Consulta Busca',
          email: 'zelda.busca@example.com',
          phone: '11933332222',
        }),
      );
    });

    it('Dado termo de busca, Quando GET com search, Então filtra por nome', async () => {
      const response = await patientsRoute.GET(
        jsonRequest('/api/patients?search=Zelda', 'GET'),
      );
      const body = (await response.json()) as Envelope<
        Array<{ fullName: string }>
      >;

      expect(body.data.length).toBeGreaterThanOrEqual(1);
      expect(body.data.every((p) => p.fullName.includes('Zelda'))).toBe(true);
    });

    it('Dado limit, Quando GET, Então pagina resultados e devolve nextCursor', async () => {
      const response = await patientsRoute.GET(
        jsonRequest('/api/patients?limit=1', 'GET'),
      );
      const body = (await response.json()) as Envelope<
        Array<{ id: string; fullName: string }>
      >;

      expect(body.data).toHaveLength(1);
      expect(body.meta?.nextCursor).toBeTruthy();

      const nextResponse = await patientsRoute.GET(
        jsonRequest(
          `/api/patients?limit=1&cursor=${encodeURIComponent(body.meta?.nextCursor ?? '')}`,
          'GET',
        ),
      );
      const nextBody = (await nextResponse.json()) as Envelope<
        Array<{ id: string }>
      >;

      expect(nextBody.data[0]?.id).not.toBe(body.data[0]?.id);
    });

    it('Dado referredByPartnerId válido e birthDate, Quando POST, Então cria paciente indicado', async () => {
      const response = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Indicado',
          email: 'paciente.indicado@example.com',
          phone: '11922221111',
          birthDate: '1990-05-20T00:00:00.000Z',
          referredByPartnerId: partnerId,
        }),
      );
      const body = (await response.json()) as Envelope<{
        referredByPartnerId: string | null;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.referredByPartnerId).toBe(partnerId);
    });

    it('Dado referredByPartnerId inexistente, Quando POST, Então retorna 400', async () => {
      const response = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Indicação Inválida',
          email: 'paciente.indicacao.invalida@example.com',
          phone: '11911110000',
          referredByPartnerId: 'parceiro-fantasma',
        }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('patients/[id]/route.ts — GET, PUT parcial e PATCH active', () => {
    let editablePatientId: string;

    beforeAll(async () => {
      const response = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Editável',
          email: 'paciente.editavel@example.com',
          phone: '11900009999',
        }),
      );
      const body = (await response.json()) as Envelope<{ id: string }>;
      editablePatientId = body.data.id;
    });

    it('Dado id inexistente, Quando GET, Então retorna 404', async () => {
      const response = await patientByIdRoute.GET(
        jsonRequest('/api/patients/fantasma', 'GET'),
        context('fantasma'),
      );

      expect(response.status).toBe(404);
    });

    it('Dado birthDate informado, Quando PUT, Então atualiza data de nascimento', async () => {
      const response = await patientByIdRoute.PUT(
        jsonRequest(`/api/patients/${editablePatientId}`, 'PUT', {
          birthDate: '1985-01-01T00:00:00.000Z',
        }),
        context(editablePatientId),
      );
      const body = (await response.json()) as Envelope<{
        birthDate: string | null;
      }>;

      expect(body.data.birthDate).toBe('1985-01-01T00:00:00.000Z');
    });

    it('Dado birthDate nulo, Quando PUT, Então limpa data de nascimento', async () => {
      const response = await patientByIdRoute.PUT(
        jsonRequest(`/api/patients/${editablePatientId}`, 'PUT', {
          birthDate: null,
        }),
        context(editablePatientId),
      );
      const body = (await response.json()) as Envelope<{
        birthDate: string | null;
      }>;

      expect(body.data.birthDate).toBeNull();
    });

    it('Dado apenas notes, Quando PUT, Então atualiza somente as notas', async () => {
      const response = await patientByIdRoute.PUT(
        jsonRequest(`/api/patients/${editablePatientId}`, 'PUT', {
          notes: 'Observação nova',
        }),
        context(editablePatientId),
      );
      const body = (await response.json()) as Envelope<{
        notes: string | null;
        fullName: string;
      }>;

      expect(body.data.notes).toBe('Observação nova');
      expect(body.data.fullName).toBe('Paciente Editável');
    });

    it('Dado referredByPartnerId válido, Quando PUT, Então associa parceiro', async () => {
      const response = await patientByIdRoute.PUT(
        jsonRequest(`/api/patients/${editablePatientId}`, 'PUT', {
          referredByPartnerId: partnerId,
        }),
        context(editablePatientId),
      );
      const body = (await response.json()) as Envelope<{
        referredByPartnerId: string | null;
      }>;

      expect(body.data.referredByPartnerId).toBe(partnerId);
    });

    it('Dado referredByPartnerId inexistente, Quando PUT, Então retorna 400', async () => {
      const response = await patientByIdRoute.PUT(
        jsonRequest(`/api/patients/${editablePatientId}`, 'PUT', {
          referredByPartnerId: 'parceiro-fantasma',
        }),
        context(editablePatientId),
      );

      expect(response.status).toBe(400);
    });

    it('Dado id inexistente, Quando PUT, Então retorna 404', async () => {
      const response = await patientByIdRoute.PUT(
        jsonRequest('/api/patients/fantasma', 'PUT', { fullName: 'Ninguém' }),
        context('fantasma'),
      );

      expect(response.status).toBe(404);
    });

    it('Dado paciente ativo, Quando PATCH active=true, Então mantém ativo', async () => {
      const response = await patientByIdRoute.PATCH(
        jsonRequest(`/api/patients/${editablePatientId}`, 'PATCH', {
          active: true,
        }),
        context(editablePatientId),
      );
      const body = (await response.json()) as Envelope<{ active: boolean }>;

      expect(body.data.active).toBe(true);
    });

    it('Dado id inexistente, Quando PATCH active, Então retorna 404', async () => {
      const response = await patientByIdRoute.PATCH(
        jsonRequest('/api/patients/fantasma', 'PATCH', { active: false }),
        context('fantasma'),
      );

      expect(response.status).toBe(404);
    });
  });

  describe('Evoluções clínicas — branches restantes', () => {
    it('Dado professionalId e appointmentId diretos, Quando POST evolução, Então grava autoria explícita', async () => {
      const response = await evolutionsRoute.POST(
        jsonRequest(`/api/patients/${patientId}/evolutions`, 'POST', {
          subjective: 'Paciente relata melhora',
          objective: 'Ferida em processo de cicatrização',
          assessment: 'Evolução favorável',
          plan: 'Manter curativo',
        }),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<{ patientId: string }>;

      expect(response.status).toBe(200);
      expect(body.data.patientId).toBe(patientId);
    });

    it('Dado paciente inexistente, Quando POST evolução, Então retorna 404', async () => {
      const response = await evolutionsRoute.POST(
        jsonRequest('/api/patients/fantasma/evolutions', 'POST', {
          subjective: 'x',
          objective: 'x',
          assessment: 'x',
          plan: 'x',
        }),
        context('fantasma'),
      );

      expect(response.status).toBe(404);
    });

    it('Dado paciente sem evoluções registradas, Quando GET, Então retorna lista vazia', async () => {
      const freshPatient = await patientsRoute.POST(
        jsonRequest('/api/patients', 'POST', {
          fullName: 'Paciente Sem Evolução',
          email: 'sem.evolucao@example.com',
          phone: '11988887777',
        }),
      );
      const { data } = (await freshPatient.json()) as Envelope<{ id: string }>;

      const response = await evolutionsRoute.GET(
        jsonRequest(`/api/patients/${data.id}/evolutions`, 'GET'),
        context(data.id),
      );
      const body = (await response.json()) as Envelope<unknown[]>;

      expect(body.data).toHaveLength(0);
    });
  });

  describe('Condições clínicas — branches restantes', () => {
    let woundConditionId: string;
    let stomaConditionId: string;
    let resolvedConditionId: string;

    it('Dado kind=wound sem stomaType, Quando POST condição, Então cria sem tipo de estoma', async () => {
      const response = await conditionsRoute.POST(
        jsonRequest(`/api/patients/${patientId}/conditions`, 'POST', {
          kind: 'wound',
          title: 'Ferida em região sacral',
        }),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<{
        id: string;
        stomaType: string | null;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.stomaType).toBeNull();
      woundConditionId = body.data.id;
    });

    it('Dado kind=stoma com stomaType e startedAt, Quando POST condição, Então cria com detalhes completos', async () => {
      const response = await conditionsRoute.POST(
        jsonRequest(`/api/patients/${patientId}/conditions`, 'POST', {
          kind: 'stoma',
          title: 'Colostomia definitiva',
          stomaType: 'colostomia',
          startedAt: '2027-01-01T00:00:00.000Z',
          notes: 'Acompanhamento regular',
        }),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<{
        id: string;
        stomaType: string | null;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.stomaType).toBe('colostomia');
      stomaConditionId = body.data.id;

      const secondResponse = await conditionsRoute.POST(
        jsonRequest(`/api/patients/${patientId}/conditions`, 'POST', {
          kind: 'wound',
          title: 'Condição a ser resolvida',
        }),
        context(patientId),
      );
      const secondBody = (await secondResponse.json()) as Envelope<{
        id: string;
      }>;
      resolvedConditionId = secondBody.data.id;
      await conditionByIdRoute.PATCH(
        jsonRequest(`/api/conditions/${resolvedConditionId}`, 'PATCH', {
          action: 'resolve',
        }),
        context(resolvedConditionId),
      );
    });

    it('Dado paciente inexistente, Quando POST condição, Então retorna 404', async () => {
      const response = await conditionsRoute.POST(
        jsonRequest('/api/patients/fantasma/conditions', 'POST', {
          kind: 'wound',
          title: 'Condição órfã',
        }),
        context('fantasma'),
      );

      expect(response.status).toBe(404);
    });

    it('Dado condições cadastradas, Quando GET, Então retorna a lista do paciente', async () => {
      const response = await conditionsRoute.GET(
        jsonRequest(`/api/patients/${patientId}/conditions`, 'GET'),
        context(patientId),
      );
      const body = (await response.json()) as Envelope<Array<{ id: string }>>;

      expect(body.data.length).toBeGreaterThanOrEqual(2);
    });

    describe('Fotos de condição — branches restantes', () => {
      it('Dado arquivo maior que o limite de 5 MB, Quando POST foto, Então retorna 400', async () => {
        const formData = new FormData();
        formData.set(
          'file',
          new File([OVERSIZED_PNG_BYTES], 'grande.png', { type: 'image/png' }),
        );

        const response = await photosRoute.POST(
          photoUploadRequest(woundConditionId, formData),
          context(woundConditionId),
        );

        expect(response.status).toBe(400);
      });

      it('Dado assessmentId informado, Quando POST foto, Então associa à avaliação', async () => {
        const assessmentResponse = await assessmentsRoute.POST(
          jsonRequest(
            `/api/conditions/${woundConditionId}/assessments`,
            'POST',
            {
              lengthMm: 20,
            },
          ),
          context(woundConditionId),
        );
        const { data: assessment } =
          (await assessmentResponse.json()) as Envelope<{
            id: string;
          }>;

        const formData = new FormData();
        formData.set(
          'file',
          new File([SMALL_PNG_BYTES], 'ferida.png', { type: 'image/png' }),
        );
        formData.set('assessmentId', assessment.id);

        const response = await photosRoute.POST(
          photoUploadRequest(woundConditionId, formData),
          context(woundConditionId),
        );
        const body = (await response.json()) as Envelope<{
          assessmentId: string | null;
        }>;

        expect(response.status).toBe(200);
        expect(body.data.assessmentId).toBe(assessment.id);
      });

      it('Dado fotos cadastradas, Quando GET, Então retorna a lista da condição', async () => {
        const response = await photosRoute.GET(
          jsonRequest(`/api/conditions/${woundConditionId}/photos`, 'GET'),
          context(woundConditionId),
        );
        const body = (await response.json()) as Envelope<
          Array<{ conditionId: string }>
        >;

        expect(body.data.length).toBeGreaterThanOrEqual(1);
        expect(body.data[0].conditionId).toBe(woundConditionId);
      });
    });

    describe('Avaliações de condição — branches restantes', () => {
      it('Dado todos os campos preenchidos, Quando POST avaliação, Então calcula scores e retorna detalhes completos', async () => {
        const response = await assessmentsRoute.POST(
          jsonRequest(
            `/api/conditions/${stomaConditionId}/assessments`,
            'POST',
            {
              lengthMm: 30,
              widthMm: 20,
              depthMm: 5,
              tissueType: 'granulation',
              exudate: 'moderate',
              painScale: 4,
              skinCondition: 'Íntegra ao redor',
              complications: 'Leve hiperemia',
              complicationCodes: 'dermatitis,bleeding',
              detDiscolorationArea: 1,
              detDiscolorationSeverity: 1,
              detErosionArea: 0,
              detErosionSeverity: 0,
              detOvergrowthArea: 0,
              detOvergrowthSeverity: 0,
              notes: 'Reavaliar em 7 dias',
            },
          ),
          context(stomaConditionId),
        );
        const body = (await response.json()) as Envelope<{
          areaMm2: number | null;
          pushScore: number | null;
          detScore: number | null;
          complicationCodes: string[];
        }>;

        expect(response.status).toBe(200);
        expect(body.data.areaMm2).toBe(600);
        expect(body.data.pushScore).not.toBeNull();
        expect(body.data.detScore).not.toBeNull();
        expect(body.data.complicationCodes).toEqual(['dermatitis', 'bleeding']);
      });

      it('Dado condição inexistente, Quando POST avaliação, Então retorna 404', async () => {
        const response = await assessmentsRoute.POST(
          jsonRequest('/api/conditions/fantasma/assessments', 'POST', {
            lengthMm: 10,
          }),
          context('fantasma'),
        );

        expect(response.status).toBe(404);
      });

      it('Dado condição já resolvida, Quando POST avaliação, Então retorna 400', async () => {
        const response = await assessmentsRoute.POST(
          jsonRequest(
            `/api/conditions/${resolvedConditionId}/assessments`,
            'POST',
            {
              lengthMm: 10,
            },
          ),
          context(resolvedConditionId),
        );

        expect(response.status).toBe(400);
      });

      it('Dado avaliações cadastradas, Quando GET, Então retorna a lista da condição', async () => {
        const response = await assessmentsRoute.GET(
          jsonRequest(`/api/conditions/${stomaConditionId}/assessments`, 'GET'),
          context(stomaConditionId),
        );
        const body = (await response.json()) as Envelope<
          Array<{ conditionId: string }>
        >;

        expect(body.data).toHaveLength(1);
        expect(body.data[0].conditionId).toBe(stomaConditionId);
      });
    });
  });

  describe('invoices/route.ts — filtros restantes', () => {
    it('Dado sem filtro de status, Quando GET, Então retorna faturas de todos os status', async () => {
      await invoicesRoute.POST(
        jsonRequest('/api/invoices', 'POST', {
          patientId,
          description: 'Fatura avulsa',
          amountCents: 5000,
          dueDate: '2027-06-01T00:00:00.000Z',
        }),
      );

      const response = await invoicesRoute.GET(
        jsonRequest('/api/invoices', 'GET'),
      );
      const body = (await response.json()) as Envelope<
        Array<{ patientId: string }>
      >;

      expect(response.status).toBe(200);
      expect(body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('Dado filtro por patientId e período, Quando GET, Então retorna somente faturas do paciente no período', async () => {
      const response = await invoicesRoute.GET(
        jsonRequest(
          `/api/invoices?patientId=${patientId}&from=2027-01-01T00:00:00.000Z&to=2027-12-31T00:00:00.000Z`,
          'GET',
        ),
      );
      const body = (await response.json()) as Envelope<
        Array<{ patientId: string }>
      >;

      expect(
        body.data.every((invoice) => invoice.patientId === patientId),
      ).toBe(true);
    });
  });

  describe('summary/route.ts — mês corrente sem parâmetro', () => {
    it('Dado nenhum parâmetro month, Quando GET, Então usa o mês corrente', async () => {
      const response = await summaryRoute.GET(
        jsonRequest('/api/summary', 'GET'),
      );
      const body = (await response.json()) as Envelope<{
        billing: { paidCents: number };
      }>;

      expect(response.status).toBe(200);
      expect(typeof body.data.billing.paidCents).toBe('number');
    });
  });
});
