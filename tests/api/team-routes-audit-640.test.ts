import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRepositories } from '@/infrastructure/container';
import { DrizzleAuditEventRepository } from '@/infrastructure/persistence/drizzle/drizzle-audit-event-repository';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest } from '../support/request';
import { adminCookieHeader, cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

/**
 * #640: as rotas de Profissionais e Parceiros gravam a auditoria na MESMA
 * transação da gravação (ADR-075, EQP-RN-09), com os mesmos `action`,
 * `resourceType` e `detail` das Server Actions. Falhou a trilha, nada é gravado.
 */

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const admin = (clinicId = CLINIC_A_ID) => adminCookieHeader(clinicId);

const trailOf = async (resourceId: string, clinicId = CLINIC_A_ID) => {
  const { auditEvents } = await getRepositories(clinicScope(clinicId));
  return (await auditEvents.findAll()).filter(
    (event) => event.resourceId === resourceId,
  );
};

const postProfessional = async (
  body: unknown,
  headers: Record<string, string> = admin(),
) => {
  const route = await import('@/app/api/professionals/route');
  return route.POST(jsonRequest('/api/professionals', 'POST', body, headers));
};

const patchProfessional = async (
  id: string,
  body: unknown,
  headers: Record<string, string> = admin(),
) => {
  const route = await import('@/app/api/professionals/[id]/route');
  return route.PATCH(
    jsonRequest(`/api/professionals/${id}`, 'PATCH', body, headers),
    { params: Promise.resolve({ id }) },
  );
};

let seq = 0;
const partnerBody = (label: string) => {
  seq += 1;
  return {
    fullName: `Parceiro ${label} ${seq}`,
    email: `parceiro-${label}-${seq}@trilha.test`,
    phone: '11 99999-0000',
  };
};

const postPartner = async (
  body: unknown,
  headers: Record<string, string> = admin(),
) => {
  const route = await import('@/app/api/partners/route');
  return route.POST(jsonRequest('/api/partners', 'POST', body, headers));
};

const putPartner = async (
  id: string,
  body: unknown,
  headers: Record<string, string> = admin(),
) => {
  const route = await import('@/app/api/partners/[id]/route');
  return route.PUT(jsonRequest(`/api/partners/${id}`, 'PUT', body, headers), {
    params: Promise.resolve({ id }),
  });
};

const createdProfessional = async (
  fullName: string,
  clinicId = CLINIC_A_ID,
) => {
  const response = await postProfessional({ fullName }, admin(clinicId));
  return ((await response.json()) as Envelope<{ id: string }>).data.id;
};

const createdPartner = async (label: string, clinicId = CLINIC_A_ID) => {
  const response = await postPartner(partnerBody(label), admin(clinicId));
  return ((await response.json()) as Envelope<{ id: string }>).data.id;
};

const failAudit = () => {
  vi.spyOn(DrizzleAuditEventRepository.prototype, 'save').mockRejectedValue(
    new Error('auditoria indisponível'),
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Feature: Auditoria das rotas de Profissionais (#640, EQP-RN-09)', () => {
  it('Dado Admin, Quando POST /api/professionals, Então grava o profissional e o evento «cadastrado»', async () => {
    await ensureTestClinics();

    const response = await postProfessional({ fullName: 'Dra. Trilha' });
    const id = ((await response.json()) as Envelope<{ id: string }>).data.id;

    expect(response.status).toBeLessThan(300);
    const [event] = await trailOf(id);
    expect(event).toMatchObject({
      action: 'create',
      resourceType: 'professional',
      detail: 'cadastrado',
      clinicId: CLINIC_A_ID,
      actorRole: 'company_admin',
    });
    expect(await trailOf(id)).toHaveLength(1);
  });

  it.each([
    [{ fullName: 'Nome novo' }, 'editado'],
    [{ active: false }, 'desativado'],
    [{ active: true }, 'reativado'],
  ])(
    'Dado profissional, Quando PATCH %j, Então o evento tem detalhe «%s»',
    async (change, detail) => {
      await ensureTestClinics();
      const id = await createdProfessional('Dr. Para Editar');

      const response = await patchProfessional(id, change);

      expect(response.status).toBe(200);
      const events = (await trailOf(id)).filter((e) => e.action === 'update');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        resourceType: 'professional',
        detail,
        clinicId: CLINIC_A_ID,
        actorRole: 'company_admin',
      });
    },
  );

  it('Dada falha na auditoria, Quando POST /api/professionals, Então nada é gravado', async () => {
    await ensureTestClinics();
    const fullName = 'Dr. Sem Trilha';
    failAudit();

    const response = await postProfessional({ fullName });

    expect(response.status).toBe(500);
    vi.restoreAllMocks();
    const { professionals } = await getRepositories(clinicScope(CLINIC_A_ID));
    expect(
      (await professionals.findAll()).some((p) => p.fullName === fullName),
    ).toBe(false);
  });

  it('Dada falha na auditoria, Quando PATCH desativa, Então o profissional segue ativo', async () => {
    await ensureTestClinics();
    const id = await createdProfessional('Dr. Segue Ativo');
    failAudit();

    const response = await patchProfessional(id, { active: false });

    expect(response.status).toBe(500);
    vi.restoreAllMocks();
    const { professionals } = await getRepositories(clinicScope(CLINIC_A_ID));
    expect((await professionals.findById(id))?.isActive).toBe(true);
  });

  it.each([['atendente'], ['profissional']] as const)(
    'Dado %s, Quando PATCH /api/professionals/:id, Então 403 sem gravar nem auditar',
    async (role) => {
      await ensureTestClinics();
      const id = await createdProfessional(`Dr. Intocável ${role}`);

      const response = await patchProfessional(
        id,
        { fullName: 'Invasão' },
        cookieHeaderFor(role, `${role}@trilha.test`, CLINIC_A_ID),
      );

      expect(response.status).toBe(403);
      expect((await trailOf(id)).filter((e) => e.action === 'update')).toEqual(
        [],
      );
      const { professionals } = await getRepositories(clinicScope(CLINIC_A_ID));
      expect((await professionals.findById(id))?.fullName).toBe(
        `Dr. Intocável ${role}`,
      );
    },
  );

  it('Dado Admin da clínica A, Quando PATCH em profissional da clínica B, Então 404 sem evento em nenhuma clínica', async () => {
    await ensureTestClinics();
    const idB = await createdProfessional('Dr. da Clínica B', CLINIC_B_ID);

    const response = await patchProfessional(idB, { active: false }, admin());

    expect(response.status).toBe(404);
    expect(
      (await trailOf(idB, CLINIC_B_ID)).filter((e) => e.action === 'update'),
    ).toEqual([]);
    expect(await trailOf(idB, CLINIC_A_ID)).toEqual([]);
  });

  it('Dado Admin da clínica B, Quando POST, Então o evento fica só na trilha da clínica B', async () => {
    await ensureTestClinics();
    const id = await createdProfessional('Dr. Trilha B', CLINIC_B_ID);

    expect(await trailOf(id, CLINIC_B_ID)).toHaveLength(1);
    expect(await trailOf(id, CLINIC_A_ID)).toEqual([]);
  });
});

describe('Feature: Auditoria das rotas de Parceiros (#640, EQP-RN-09)', () => {
  it('Dado Admin, Quando POST /api/partners, Então grava o parceiro e o evento «cadastrado»', async () => {
    await ensureTestClinics();

    const response = await postPartner(partnerBody('novo'));
    const id = ((await response.json()) as Envelope<{ id: string }>).data.id;

    expect(response.status).toBeLessThan(300);
    const events = await trailOf(id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'create',
      resourceType: 'partner',
      detail: 'cadastrado',
      clinicId: CLINIC_A_ID,
      actorRole: 'company_admin',
    });
  });

  it.each([
    [{ fullName: 'Parceiro Renomeado' }, 'editado'],
    [{ active: false }, 'desativado'],
    [{ active: true }, 'reativado'],
  ])(
    'Dado parceiro, Quando PUT %j, Então o evento tem detalhe «%s»',
    async (change, detail) => {
      await ensureTestClinics();
      const id = await createdPartner('editar');

      const response = await putPartner(id, change);

      expect(response.status).toBe(200);
      const events = (await trailOf(id)).filter((e) => e.action === 'update');
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        resourceType: 'partner',
        detail,
        clinicId: CLINIC_A_ID,
      });
    },
  );

  it('Dada falha na auditoria, Quando POST /api/partners, Então o parceiro não é gravado', async () => {
    await ensureTestClinics();
    const body = partnerBody('sem-trilha');
    failAudit();

    const response = await postPartner(body);

    expect(response.status).toBe(500);
    vi.restoreAllMocks();
    const { partners } = await getRepositories(clinicScope(CLINIC_A_ID));
    expect((await partners.findAll()).some((p) => p.email === body.email)).toBe(
      false,
    );
  });

  it('Dada falha na auditoria, Quando PUT desativa, Então o parceiro segue ativo', async () => {
    await ensureTestClinics();
    const id = await createdPartner('segue-ativo');
    failAudit();

    const response = await putPartner(id, { active: false });

    expect(response.status).toBe(500);
    vi.restoreAllMocks();
    const { partners } = await getRepositories(clinicScope(CLINIC_A_ID));
    expect((await partners.findById(id))?.isActive).toBe(true);
  });

  it('Dado Atendente, Quando POST e PUT, Então grava e audita com o papel do ator', async () => {
    await ensureTestClinics();
    const atendente = cookieHeaderFor(
      'atendente',
      'atendente@trilha.test',
      CLINIC_A_ID,
    );

    const created = await postPartner(partnerBody('atendente'), atendente);
    const id = ((await created.json()) as Envelope<{ id: string }>).data.id;
    const updated = await putPartner(id, { active: false }, atendente);

    expect(updated.status).toBe(200);
    const events = await trailOf(id);
    expect(events.map((e) => e.detail).sort()).toEqual([
      'cadastrado',
      'desativado',
    ]);
    expect(events.every((e) => e.actorRole === 'atendente')).toBe(true);
  });

  it('Dado Admin da clínica A, Quando PUT em parceiro da clínica B, Então 404 sem evento em nenhuma clínica', async () => {
    await ensureTestClinics();
    const idB = await createdPartner('clinica-b', CLINIC_B_ID);

    const response = await putPartner(idB, { active: false }, admin());

    expect(response.status).toBe(404);
    expect(
      (await trailOf(idB, CLINIC_B_ID)).filter((e) => e.action === 'update'),
    ).toEqual([]);
    expect(await trailOf(idB, CLINIC_A_ID)).toEqual([]);
  });

  it('Dado Admin da clínica B, Quando POST, Então o evento fica só na trilha da clínica B', async () => {
    await ensureTestClinics();
    const id = await createdPartner('trilha-b', CLINIC_B_ID);

    expect(await trailOf(id, CLINIC_B_ID)).toHaveLength(1);
    expect(await trailOf(id, CLINIC_A_ID)).toEqual([]);
  });
});
