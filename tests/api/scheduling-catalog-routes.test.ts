import { beforeAll, describe, expect, it } from 'vitest';
import { jsonRequest } from '../support/request';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

describe('Feature: Recorrência de consultas, grade de horários, profissionais, parceiros e contas de acesso', () => {
  let recurringRoute: typeof import('@/app/api/appointments/recurring/route');
  let appointmentsRoute: typeof import('@/app/api/appointments/route');
  let patientsRoute: typeof import('@/app/api/patients/route');
  let scheduleSettingsRoute: typeof import('@/app/api/settings/schedule/route');
  let professionalsRoute: typeof import('@/app/api/professionals/route');
  let professionalByIdRoute: typeof import('@/app/api/professionals/[id]/route');
  let partnersRoute: typeof import('@/app/api/partners/route');
  let partnerByIdRoute: typeof import('@/app/api/partners/[id]/route');
  let accountsRoute: typeof import('@/app/api/accounts/route');
  let accountByIdRoute: typeof import('@/app/api/accounts/[id]/route');

  let patientId: string;

  const context = (id: string) => ({ params: Promise.resolve({ id }) });

  beforeAll(async () => {
    recurringRoute = await import('@/app/api/appointments/recurring/route');
    appointmentsRoute = await import('@/app/api/appointments/route');
    patientsRoute = await import('@/app/api/patients/route');
    scheduleSettingsRoute = await import('@/app/api/settings/schedule/route');
    professionalsRoute = await import('@/app/api/professionals/route');
    professionalByIdRoute = await import('@/app/api/professionals/[id]/route');
    partnersRoute = await import('@/app/api/partners/route');
    partnerByIdRoute = await import('@/app/api/partners/[id]/route');
    accountsRoute = await import('@/app/api/accounts/route');
    accountByIdRoute = await import('@/app/api/accounts/[id]/route');

    const patientResponse = await patientsRoute.POST(
      jsonRequest('/api/patients', 'POST', {
        fullName: 'Ana Recorrência',
        email: 'ana.recorrencia@example.com',
        phone: '11977778888',
      }),
    );
    const patientBody = (await patientResponse.json()) as Envelope<{
      id: string;
    }>;
    patientId = patientBody.data.id;
  });

  describe('Consultas recorrentes (POST /api/appointments/recurring)', () => {
    it('Dado dados válidos, Quando POST recorrente semanal, Então cria todas as ocorrências', async () => {
      const response = await recurringRoute.POST(
        jsonRequest('/api/appointments/recurring', 'POST', {
          patientId,
          startsAt: '2027-03-01T09:00:00.000Z',
          endsAt: '2027-03-01T10:00:00.000Z',
          procedure: 'Curativo semanal',
          priceCents: 15000,
          occurrences: 5,
          weeksInterval: 1,
        }),
      );
      const body = (await response.json()) as Envelope<{
        created: Array<{ id: string; startsAt: string }>;
        skipped: Array<{ startsAt: string; reason: string }>;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.created).toHaveLength(5);
      expect(body.data.skipped).toHaveLength(0);
    });

    it('Dado ocorrência com conflito de horário, Quando POST recorrente, Então pula apenas essa ocorrência', async () => {
      await appointmentsRoute.POST(
        jsonRequest('/api/appointments', 'POST', {
          patientId,
          startsAt: '2027-01-18T09:00:00.000Z',
          endsAt: '2027-01-18T10:00:00.000Z',
          procedure: 'Consulta pré-existente',
          priceCents: 10000,
        }),
      );

      const response = await recurringRoute.POST(
        jsonRequest('/api/appointments/recurring', 'POST', {
          patientId,
          startsAt: '2027-01-11T09:00:00.000Z',
          endsAt: '2027-01-11T10:00:00.000Z',
          procedure: 'Curativo semanal',
          priceCents: 15000,
          occurrences: 3,
          weeksInterval: 1,
        }),
      );
      const body = (await response.json()) as Envelope<{
        created: Array<{ id: string }>;
        skipped: Array<{ startsAt: string; reason: string }>;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.created).toHaveLength(2);
      expect(body.data.skipped).toHaveLength(1);
      expect(body.data.skipped[0].reason).toContain('indisponível');
    });

    it('Dado paciente inexistente, Quando POST recorrente, Então todas as ocorrências são puladas', async () => {
      const response = await recurringRoute.POST(
        jsonRequest('/api/appointments/recurring', 'POST', {
          patientId: 'paciente-fantasma',
          startsAt: '2027-04-05T09:00:00.000Z',
          endsAt: '2027-04-05T10:00:00.000Z',
          procedure: 'Curativo',
          priceCents: 10000,
          occurrences: 2,
        }),
      );
      const body = (await response.json()) as Envelope<{
        created: Array<{ id: string }>;
        skipped: Array<{ startsAt: string; reason: string }>;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.created).toHaveLength(0);
      expect(body.data.skipped).toHaveLength(2);
      expect(body.data.skipped[0].reason).toContain('não encontrado');
    });

    it('Dado occurrences fora do intervalo permitido, Quando POST recorrente, Então retorna 400', async () => {
      const response = await recurringRoute.POST(
        jsonRequest('/api/appointments/recurring', 'POST', {
          patientId,
          startsAt: '2027-04-05T09:00:00.000Z',
          endsAt: '2027-04-05T10:00:00.000Z',
          procedure: 'Curativo',
          priceCents: 10000,
          occurrences: 1,
        }),
      );

      expect(response.status).toBe(400);
    });

    it('Dado weeksInterval fora do intervalo permitido, Quando POST recorrente, Então retorna 400', async () => {
      const response = await recurringRoute.POST(
        jsonRequest('/api/appointments/recurring', 'POST', {
          patientId,
          startsAt: '2027-04-05T09:00:00.000Z',
          endsAt: '2027-04-05T10:00:00.000Z',
          procedure: 'Curativo',
          priceCents: 10000,
          occurrences: 3,
          weeksInterval: 9,
        }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('Grade de horários (GET/PUT /api/settings/schedule)', () => {
    it('Dado nenhuma configuração salva, Quando GET, Então retorna grade padrão', async () => {
      const response = await scheduleSettingsRoute.GET(
        jsonRequest('/api/settings/schedule', 'GET'),
      );
      const body = (await response.json()) as Envelope<{
        config: { weekdays: number[] };
        isDefault: boolean;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.isDefault).toBe(true);
      expect(body.data.config.weekdays).toEqual([1, 2, 3, 4, 5]);
    });

    it('Dado configuração válida, Quando PUT, Então salva e deixa de ser padrão', async () => {
      const response = await scheduleSettingsRoute.PUT(
        jsonRequest('/api/settings/schedule', 'PUT', {
          weekdays: [1, 2, 3, 4, 5, 6],
          startHour: 7,
          endHour: 19,
          minGapMinutes: 20,
        }),
      );
      const body = (await response.json()) as Envelope<{
        config: { weekdays: number[]; startHour: number; endHour: number };
        isDefault: boolean;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.isDefault).toBe(false);
      expect(body.data.config.weekdays).toEqual([1, 2, 3, 4, 5, 6]);
      expect(body.data.config.startHour).toBe(7);
    });

    it('Dado configuração salva anteriormente, Quando GET, Então retorna configuração persistida', async () => {
      const response = await scheduleSettingsRoute.GET(
        jsonRequest('/api/settings/schedule', 'GET'),
      );
      const body = (await response.json()) as Envelope<{
        config: { minGapMinutes: number };
        isDefault: boolean;
      }>;

      expect(body.data.isDefault).toBe(false);
      expect(body.data.config.minGapMinutes).toBe(20);
    });

    it('Dado weekdays vazio, Quando PUT, Então retorna 400', async () => {
      const response = await scheduleSettingsRoute.PUT(
        jsonRequest('/api/settings/schedule', 'PUT', {
          weekdays: [],
          startHour: 8,
          endHour: 18,
          minGapMinutes: 15,
        }),
      );

      expect(response.status).toBe(400);
    });

    it('Dado startHour maior ou igual a endHour, Quando PUT, Então retorna 400', async () => {
      const response = await scheduleSettingsRoute.PUT(
        jsonRequest('/api/settings/schedule', 'PUT', {
          weekdays: [1, 2, 3],
          startHour: 18,
          endHour: 18,
          minGapMinutes: 15,
        }),
      );

      expect(response.status).toBe(400);
    });

    it('Dado minGapMinutes fora do intervalo permitido pelo schema, Quando PUT, Então retorna 400', async () => {
      const response = await scheduleSettingsRoute.PUT(
        jsonRequest('/api/settings/schedule', 'PUT', {
          weekdays: [1, 2, 3],
          startHour: 8,
          endHour: 18,
          minGapMinutes: 500,
        }),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('Profissionais (PATCH /api/professionals/:id)', () => {
    let professionalId: string;

    beforeAll(async () => {
      const response = await professionalsRoute.POST(
        jsonRequest('/api/professionals', 'POST', {
          fullName: 'Dra. Beatriz Enfermeira',
          registry: 'COREN-SP 123456',
        }),
      );
      const body = (await response.json()) as Envelope<{ id: string }>;
      professionalId = body.data.id;
    });

    it('Dado commissionPct válido, Quando POST /api/professionals, Então cria já com o repasse (PROF-01)', async () => {
      const response = await professionalsRoute.POST(
        jsonRequest('/api/professionals', 'POST', {
          fullName: 'Dr. Rafael Repasse',
          commissionPct: 25,
        }),
      );
      const body = (await response.json()) as Envelope<{
        commissionPct: number;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.commissionPct).toBe(25);
    });

    it('Dado commissionPct inválido, Quando POST /api/professionals, Então retorna 400 (PROF-01)', async () => {
      const response = await professionalsRoute.POST(
        jsonRequest('/api/professionals', 'POST', {
          fullName: 'Dr. Repasse Inválido',
          commissionPct: 200,
        }),
      );

      expect(response.status).toBe(400);
    });

    it('Dado dados válidos, Quando PATCH, Então atualiza nome e registro', async () => {
      const response = await professionalByIdRoute.PATCH(
        jsonRequest(`/api/professionals/${professionalId}`, 'PATCH', {
          fullName: 'Dra. Beatriz Silva',
          registry: 'COREN-SP 654321',
        }),
        context(professionalId),
      );
      const body = (await response.json()) as Envelope<{
        fullName: string;
        registry: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.fullName).toBe('Dra. Beatriz Silva');
      expect(body.data.registry).toBe('COREN-SP 654321');
    });

    it('Dado percentual de repasse válido, Quando PATCH commissionPct, Então atualiza', async () => {
      const response = await professionalByIdRoute.PATCH(
        jsonRequest(`/api/professionals/${professionalId}`, 'PATCH', {
          commissionPct: 30,
        }),
        context(professionalId),
      );
      const body = (await response.json()) as Envelope<{
        commissionPct: number;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.commissionPct).toBe(30);
    });

    it('Dado percentual de repasse inválido, Quando PATCH commissionPct, Então retorna 400', async () => {
      const response = await professionalByIdRoute.PATCH(
        jsonRequest(`/api/professionals/${professionalId}`, 'PATCH', {
          commissionPct: 150,
        }),
        context(professionalId),
      );

      expect(response.status).toBe(400);
    });

    it('Dado profissional ativo, Quando PATCH active=false, Então desativa', async () => {
      const response = await professionalByIdRoute.PATCH(
        jsonRequest(`/api/professionals/${professionalId}`, 'PATCH', {
          active: false,
        }),
        context(professionalId),
      );
      const body = (await response.json()) as Envelope<{ active: boolean }>;

      expect(body.data.active).toBe(false);
    });

    it('Dado profissional inativo, Quando PATCH active=true, Então reativa', async () => {
      const response = await professionalByIdRoute.PATCH(
        jsonRequest(`/api/professionals/${professionalId}`, 'PATCH', {
          active: true,
        }),
        context(professionalId),
      );
      const body = (await response.json()) as Envelope<{ active: boolean }>;

      expect(body.data.active).toBe(true);
    });

    it('Dado id inexistente, Quando PATCH, Então retorna 404', async () => {
      const response = await professionalByIdRoute.PATCH(
        jsonRequest('/api/professionals/fantasma', 'PATCH', {
          fullName: 'Ninguém',
        }),
        context('fantasma'),
      );

      expect(response.status).toBe(404);
    });

    it('Dado profissional cadastrado, Quando GET /api/professionals, Então lista', async () => {
      const response = await professionalsRoute.GET(
        jsonRequest('/api/professionals', 'GET'),
      );
      const body = (await response.json()) as Envelope<Array<{ id: string }>>;

      expect(response.status).toBe(200);
      expect(body.data.some((p) => p.id === professionalId)).toBe(true);
    });
  });

  describe('Parceiros (PUT /api/partners/:id)', () => {
    let partnerId: string;

    beforeAll(async () => {
      const response = await partnersRoute.POST(
        jsonRequest('/api/partners', 'POST', {
          fullName: 'Dr. Carlos Indicador',
          email: 'carlos.indicador@example.com',
          phone: '11966665555',
        }),
      );
      const body = (await response.json()) as Envelope<{ id: string }>;
      partnerId = body.data.id;
    });

    it('Dado email inválido, Quando POST /api/partners, Então retorna 400 (PART-01)', async () => {
      const response = await partnersRoute.POST(
        jsonRequest('/api/partners', 'POST', {
          fullName: 'Dr. Email Inválido',
          email: 'sem-arroba-nem-dominio',
          phone: '11955554444',
        }),
      );

      expect(response.status).toBe(400);
    });

    it('Dado email inválido, Quando PUT /api/partners/:id, Então retorna 400 (PART-01)', async () => {
      const response = await partnerByIdRoute.PUT(
        jsonRequest(`/api/partners/${partnerId}`, 'PUT', {
          email: 'invalido-tambem',
        }),
        context(partnerId),
      );

      expect(response.status).toBe(400);
    });

    it('Dado dados válidos, Quando PUT, Então atualiza cadastro do parceiro', async () => {
      const response = await partnerByIdRoute.PUT(
        jsonRequest(`/api/partners/${partnerId}`, 'PUT', {
          fullName: 'Dr. Carlos Souza',
          crm: 'CRM-SP 11111',
          specialty: 'Dermatologia',
        }),
        context(partnerId),
      );
      const body = (await response.json()) as Envelope<{
        fullName: string;
        crm: string;
        specialty: string;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.fullName).toBe('Dr. Carlos Souza');
      expect(body.data.crm).toBe('CRM-SP 11111');
      expect(body.data.specialty).toBe('Dermatologia');
    });

    it('Dado parceiro ativo, Quando PUT active=false, Então desativa', async () => {
      const response = await partnerByIdRoute.PUT(
        jsonRequest(`/api/partners/${partnerId}`, 'PUT', { active: false }),
        context(partnerId),
      );
      const body = (await response.json()) as Envelope<{ active: boolean }>;

      expect(body.data.active).toBe(false);
    });

    it('Dado parceiro inativo, Quando PUT active=true, Então reativa', async () => {
      const response = await partnerByIdRoute.PUT(
        jsonRequest(`/api/partners/${partnerId}`, 'PUT', { active: true }),
        context(partnerId),
      );
      const body = (await response.json()) as Envelope<{ active: boolean }>;

      expect(body.data.active).toBe(true);
    });

    it('Dado id inexistente, Quando PUT, Então retorna 404', async () => {
      const response = await partnerByIdRoute.PUT(
        jsonRequest('/api/partners/fantasma', 'PUT', { fullName: 'Ninguém' }),
        context('fantasma'),
      );

      expect(response.status).toBe(404);
    });

    it('Dado parceiro cadastrado, Quando GET /api/partners, Então lista', async () => {
      const response = await partnersRoute.GET(
        jsonRequest('/api/partners', 'GET'),
      );
      const body = (await response.json()) as Envelope<Array<{ id: string }>>;

      expect(response.status).toBe(200);
      expect(body.data.some((p) => p.id === partnerId)).toBe(true);
    });
  });

  describe('Contas de acesso (POST/GET /api/accounts, PATCH /api/accounts/:id)', () => {
    let professionalIdForAccount: string;
    let accountId: string;

    beforeAll(async () => {
      const response = await professionalsRoute.POST(
        jsonRequest('/api/professionals', 'POST', {
          fullName: 'Profissional Vinculado à Conta',
        }),
      );
      const body = (await response.json()) as Envelope<{ id: string }>;
      professionalIdForAccount = body.data.id;
    });

    it('Dado dados válidos, Quando POST /api/accounts, Então cria conta com hash de senha', async () => {
      const response = await accountsRoute.POST(
        jsonRequest('/api/accounts', 'POST', {
          email: 'equipe@example.com',
          password: 'senhaSegura123', // gitleaks:allow — fixture de teste, não é credencial
          role: 'company_admin',
          professionalId: professionalIdForAccount,
        }),
      );
      const body = (await response.json()) as Envelope<{
        id: string;
        email: string;
        professionalId: string;
        active: boolean;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.email).toBe('equipe@example.com');
      expect(body.data.professionalId).toBe(professionalIdForAccount);
      expect(body.data.active).toBe(true);
      expect(body.data).not.toHaveProperty('passwordHash');
      accountId = body.data.id;
    });

    it('Dado sem professionalId, Quando POST /api/accounts, Então cria conta sem vínculo', async () => {
      const response = await accountsRoute.POST(
        jsonRequest('/api/accounts', 'POST', {
          email: 'sem.vinculo@example.com',
          password: 'senhaSegura123', // gitleaks:allow — fixture de teste, não é credencial
          role: 'company_admin',
        }),
      );
      const body = (await response.json()) as Envelope<{
        professionalId: string | null;
      }>;

      expect(response.status).toBe(200);
      expect(body.data.professionalId).toBeNull();
    });

    it('Dado email já cadastrado, Quando POST /api/accounts, Então retorna 400', async () => {
      const response = await accountsRoute.POST(
        jsonRequest('/api/accounts', 'POST', {
          email: 'equipe@example.com',
          password: 'outraSenha123', // gitleaks:allow — fixture de teste, não é credencial
          role: 'company_admin',
        }),
      );

      expect(response.status).toBe(400);
    });

    it('Dado profissional vinculado inexistente, Quando POST /api/accounts, Então retorna 400', async () => {
      const response = await accountsRoute.POST(
        jsonRequest('/api/accounts', 'POST', {
          email: 'outra.conta@example.com',
          password: 'senhaSegura123', // gitleaks:allow — fixture de teste, não é credencial
          role: 'company_admin',
          professionalId: 'profissional-fantasma',
        }),
      );

      expect(response.status).toBe(400);
    });

    it('Dado contas cadastradas, Quando GET /api/accounts, Então lista todas', async () => {
      const response = await accountsRoute.GET(
        jsonRequest('/api/accounts', 'GET'),
      );
      const body = (await response.json()) as Envelope<Array<{ id: string }>>;

      expect(response.status).toBe(200);
      expect(body.data.some((account) => account.id === accountId)).toBe(true);
    });

    it('Dado nova senha, Quando PATCH /api/accounts/:id, Então recusa: o admin não define a senha de outra conta (#295)', async () => {
      const response = await accountByIdRoute.PATCH(
        jsonRequest(`/api/accounts/${accountId}`, 'PATCH', {
          password: 'novaSenhaForte123',
        }), // gitleaks:allow — fixture de teste, não é credencial
        context(accountId),
      );

      expect(response.status).toBe(400);
    });

    it('Dado conta ativa, Quando PATCH active=false, Então desativa', async () => {
      const response = await accountByIdRoute.PATCH(
        jsonRequest(`/api/accounts/${accountId}`, 'PATCH', { active: false }),
        context(accountId),
      );
      const body = (await response.json()) as Envelope<{ active: boolean }>;

      expect(body.data.active).toBe(false);
    });

    it('Dado conta inativa, Quando PATCH active=true, Então reativa', async () => {
      const response = await accountByIdRoute.PATCH(
        jsonRequest(`/api/accounts/${accountId}`, 'PATCH', { active: true }),
        context(accountId),
      );
      const body = (await response.json()) as Envelope<{ active: boolean }>;

      expect(body.data.active).toBe(true);
    });

    it('Dado id inexistente, Quando PATCH /api/accounts/:id, Então retorna 404', async () => {
      const response = await accountByIdRoute.PATCH(
        jsonRequest('/api/accounts/fantasma', 'PATCH', { active: false }),
        context('fantasma'),
      );

      expect(response.status).toBe(404);
    });
  });
});
