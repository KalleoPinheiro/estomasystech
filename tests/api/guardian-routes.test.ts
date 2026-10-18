import { beforeAll, describe, expect, it } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

interface GuardianBody {
  id: string;
  fullName: string;
  relationshipLabel: string;
  phone: string;
  email: string | null;
  patients?: Array<{ id: string; fullName: string }>;
}

const ANA = {
  fullName: 'Ana Souza',
  relationship: 'filho',
  phone: '(11) 99999-0000',
  email: 'ana@exemplo.com',
};

describe('Feature: Responsável ou cuidador do paciente — rotas (#329)', () => {
  let guardiansRoute: typeof import('@/app/api/guardians/route');
  let guardianByIdRoute: typeof import('@/app/api/guardians/[id]/route');
  let patientsRoute: typeof import('@/app/api/patients/route');
  let patientByIdRoute: typeof import('@/app/api/patients/[id]/route');

  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  const admin = (clinicId = CLINIC_A_ID) => adminCookieHeader(clinicId);

  const call = async <T>(response: Response) => ({
    status: response.status,
    body: (await response.json()) as Envelope<T>,
  });

  const createGuardian = async (
    body: object = ANA,
    headers = admin(),
  ): Promise<GuardianBody> => {
    const { body: envelope } = await call<GuardianBody>(
      await guardiansRoute.POST(
        jsonRequest('/api/guardians', 'POST', body, headers),
      ),
    );
    return envelope.data;
  };

  const createPatient = async (
    fullName: string,
    extra: object = {},
    headers = admin(),
  ) => {
    const { body } = await call<{ id: string }>(
      await patientsRoute.POST(
        jsonRequest(
          '/api/patients',
          'POST',
          { fullName, phone: '11988880000', ...extra },
          headers,
        ),
      ),
    );
    return body.data.id;
  };

  const getPatient = async (id: string, headers = admin()) =>
    call<{
      guardianId: string | null;
      guardian?: GuardianBody | null;
    }>(
      await patientByIdRoute.GET(
        jsonRequest(`/api/patients/${id}`, 'GET', undefined, headers),
        context(id),
      ),
    );

  const auditOf = async (resourceType: string, clinicId = CLINIC_A_ID) => {
    const { auditEvents } = await getRepositories(clinicScope(clinicId));
    return auditEvents.findAll({ resourceType });
  };

  beforeAll(async () => {
    await ensureTestClinics();
    guardiansRoute = await import('@/app/api/guardians/route');
    guardianByIdRoute = await import('@/app/api/guardians/[id]/route');
    patientsRoute = await import('@/app/api/patients/route');
    patientByIdRoute = await import('@/app/api/patients/[id]/route');
  });

  it('Dado o Admin, Quando cadastrar, Então normaliza o telefone, devolve o parentesco por extenso e audita sem contato', async () => {
    const guardian = await createGuardian();

    expect(guardian).toMatchObject({
      fullName: 'Ana Souza',
      relationshipLabel: 'Filho(a)',
      phone: '+5511999990000',
      email: 'ana@exemplo.com',
    });
    const events = (await auditOf('guardian')).filter(
      (e) => e.resourceId === guardian.id,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'create',
      actorRole: 'company_admin',
    });
    expect(JSON.stringify(events)).not.toContain('99999');
  });

  it.each([
    [{ ...ANA, fullName: 'Al' }, 400],
    [{ ...ANA, phone: '99999-0000' }, 400],
    [{ ...ANA, relationship: 'vizinho' }, 400],
    [{ ...ANA, email: 'sem-arroba' }, 400],
  ])(
    'Dado corpo inválido %j, Quando cadastrar, Então %i',
    async (body, status) => {
      const response = await guardiansRoute.POST(
        jsonRequest('/api/guardians', 'POST', body, admin()),
      );
      expect(response.status).toBe(status);
    },
  );

  it('Dado o Atendente, Quando cadastrar e listar, Então pode; o Profissional recebe 403', async () => {
    const atendente = cookieHeaderFor(
      'atendente',
      'recepcao@c.com',
      CLINIC_A_ID,
    );
    const profissional = cookieHeaderFor(
      'profissional',
      'prof@c.com',
      CLINIC_A_ID,
      'prof-1',
    );

    const created = await createGuardian(
      { ...ANA, fullName: 'Bia Atendida' },
      atendente,
    );
    expect(created.fullName).toBe('Bia Atendida');
    const listed = await call<GuardianBody[]>(
      await guardiansRoute.GET(
        jsonRequest(
          '/api/guardians?search=atendida',
          'GET',
          undefined,
          atendente,
        ),
      ),
    );
    expect(listed.body.data.map((g) => g.id)).toEqual([created.id]);

    for (const response of [
      await guardiansRoute.GET(
        jsonRequest('/api/guardians', 'GET', undefined, profissional),
      ),
      await guardiansRoute.POST(
        jsonRequest('/api/guardians', 'POST', ANA, profissional),
      ),
      await guardianByIdRoute.PUT(
        jsonRequest(`/api/guardians/${created.id}`, 'PUT', {}, profissional),
        context(created.id),
      ),
      await guardianByIdRoute.DELETE(
        jsonRequest(
          `/api/guardians/${created.id}`,
          'DELETE',
          undefined,
          profissional,
        ),
        context(created.id),
      ),
    ]) {
      expect(response.status).toBe(403);
    }
  });

  it('Dado um responsável, Quando editar, Então grava, audita só os campos e aceita remover o e-mail', async () => {
    const guardian = await createGuardian({ ...ANA, fullName: 'Edu Editável' });

    const { status, body } = await call<GuardianBody>(
      await guardianByIdRoute.PUT(
        jsonRequest(
          `/api/guardians/${guardian.id}`,
          'PUT',
          { phone: '11 98888-7777', email: null },
          admin(),
        ),
        context(guardian.id),
      ),
    );

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ phone: '+5511988887777', email: null });
    const update = (await auditOf('guardian')).find(
      (e) => e.resourceId === guardian.id && e.action === 'update',
    );
    expect(update?.detail).toBe('campos: phone, email');
  });

  it('Dado um responsável, Quando vincular a dois pacientes, Então a ficha traz o responsável embutido e o GET lista os dois', async () => {
    const guardian = await createGuardian({
      ...ANA,
      fullName: 'Fátima Família',
    });
    const mae = await createPatient('Mãe Silva', { guardianId: guardian.id });
    const tio = await createPatient('Tio Silva');
    await patientByIdRoute.PUT(
      jsonRequest(
        `/api/patients/${tio}`,
        'PUT',
        { guardianId: guardian.id },
        admin(),
      ),
      context(tio),
    );

    const ficha = await getPatient(mae);
    expect(ficha.body.data.guardianId).toBe(guardian.id);
    expect(ficha.body.data.guardian).toMatchObject({
      fullName: 'Fátima Família',
      relationshipLabel: 'Filho(a)',
    });
    const detail = await call<GuardianBody>(
      await guardianByIdRoute.GET(
        jsonRequest(`/api/guardians/${guardian.id}`, 'GET', undefined, admin()),
        context(guardian.id),
      ),
    );
    expect(detail.body.data.patients?.map((p) => p.fullName).sort()).toEqual([
      'Mãe Silva',
      'Tio Silva',
    ]);
    const link = (await auditOf('patient')).find(
      (e) =>
        e.patientId === tio && e.detail?.startsWith('responsável vinculado'),
    );
    expect(link?.action).toBe('update');
  });

  it('Dado responsável com pacientes, Quando excluir, Então 409; depois de desvincular todos, exclui e audita', async () => {
    const guardian = await createGuardian({ ...ANA, fullName: 'Gil Guardião' });
    const paciente = await createPatient('Paciente do Gil', {
      guardianId: guardian.id,
    });
    const remove = async () =>
      call<{ id: string }>(
        await guardianByIdRoute.DELETE(
          jsonRequest(
            `/api/guardians/${guardian.id}`,
            'DELETE',
            undefined,
            admin(),
          ),
          context(guardian.id),
        ),
      );

    const blocked = await remove();
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/ainda está ligado a pacientes/);

    const unlinked = await call<{ guardianId: string | null }>(
      await patientByIdRoute.PUT(
        jsonRequest(
          `/api/patients/${paciente}`,
          'PUT',
          { guardianId: null },
          admin(),
        ),
        context(paciente),
      ),
    );
    expect(unlinked.body.data.guardianId).toBeNull();
    expect((await getPatient(paciente)).body.data.guardian).toBeNull();
    expect((await remove()).status).toBe(200);
    expect((await remove()).status).toBe(404);
    expect(
      (await auditOf('guardian')).some(
        (e) => e.resourceId === guardian.id && e.action === 'delete',
      ),
    ).toBe(true);
  });

  it('Dado o Profissional, Quando vincular responsável pelo paciente, Então 403 e o vínculo não muda', async () => {
    const guardian = await createGuardian({ ...ANA, fullName: 'Hugo Honesto' });
    const profissional = cookieHeaderFor(
      'profissional',
      'prof@c.com',
      CLINIC_A_ID,
      'prof-2',
    );
    const denied = await patientsRoute.POST(
      jsonRequest(
        '/api/patients',
        'POST',
        {
          fullName: 'Paciente Prof',
          phone: '11988880000',
          guardianId: guardian.id,
        },
        profissional,
      ),
    );
    expect(denied.status).toBe(403);

    const id = await createPatient('Paciente Prof');
    const deniedPut = await patientByIdRoute.PUT(
      jsonRequest(
        `/api/patients/${id}`,
        'PUT',
        { guardianId: guardian.id },
        profissional,
      ),
      context(id),
    );
    expect(deniedPut.status).toBe(403);
    expect((await getPatient(id)).body.data.guardianId).toBeNull();
  });

  it('Dado paciente com responsável, Quando exportar os dados do titular, Então o JSON traz o responsável', async () => {
    const guardian = await createGuardian({ ...ANA, fullName: 'Lia Legal' });
    const id = await createPatient('Paciente Exportado', {
      guardianId: guardian.id,
    });
    const exportRoute = await import('@/app/api/patients/[id]/export/route');

    const { status, body } = await call<{
      patient: { guardian: GuardianBody | null };
    }>(
      await exportRoute.GET(
        jsonRequest(`/api/patients/${id}/export`, 'GET', undefined, admin()),
        context(id),
      ),
    );

    expect(status).toBe(200);
    expect(body.data.patient.guardian).toMatchObject({
      fullName: 'Lia Legal',
      email: 'ana@exemplo.com',
    });
  });

  it('Dado responsável de outra empresa, Quando ler, editar, excluir ou vincular, Então 404/400 e a lista não vaza', async () => {
    const daB = await createGuardian(
      { ...ANA, fullName: 'Isolda da B' },
      admin(CLINIC_B_ID),
    );
    const pacienteA = await createPatient('Paciente da A');

    const read = await guardianByIdRoute.GET(
      jsonRequest(`/api/guardians/${daB.id}`, 'GET', undefined, admin()),
      context(daB.id),
    );
    const edit = await guardianByIdRoute.PUT(
      jsonRequest(
        `/api/guardians/${daB.id}`,
        'PUT',
        { fullName: 'Invasor' },
        admin(),
      ),
      context(daB.id),
    );
    const remove = await guardianByIdRoute.DELETE(
      jsonRequest(`/api/guardians/${daB.id}`, 'DELETE', undefined, admin()),
      context(daB.id),
    );
    const link = await patientByIdRoute.PUT(
      jsonRequest(
        `/api/patients/${pacienteA}`,
        'PUT',
        { guardianId: daB.id },
        admin(),
      ),
      context(pacienteA),
    );
    const listA = await call<GuardianBody[]>(
      await guardiansRoute.GET(
        jsonRequest('/api/guardians', 'GET', undefined, admin()),
      ),
    );

    expect([read.status, edit.status, remove.status]).toEqual([404, 404, 404]);
    expect(link.status).toBe(400);
    expect(listA.body.data.some((g) => g.id === daB.id)).toBe(false);
    const listB = await call<GuardianBody[]>(
      await guardiansRoute.GET(
        jsonRequest('/api/guardians', 'GET', undefined, admin(CLINIC_B_ID)),
      ),
    );
    expect(listB.body.data.map((g) => g.fullName)).toContain('Isolda da B');
  });
});
