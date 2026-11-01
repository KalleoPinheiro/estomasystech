import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowUp } from '@/domain/followup/follow-up';
import { getRepositories } from '@/infrastructure/container';
import { getDb } from '@/infrastructure/persistence/drizzle/db';
import { SESSION_COOKIE } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { buildPatient } from '../support/builders';
import { CLINIC_A_ID, ensureTestClinics } from '../support/clinics';
import { sessionToken } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const cookieStore = { value: undefined as string | undefined };
const refreshed = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE && cookieStore.value !== undefined
        ? { name, value: cookieStore.value }
        : undefined,
  }),
}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), forbidden: vi.fn() }));
vi.mock('next/cache', () => ({ refresh: () => refreshed() }));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: () => undefined,
}));

/** Segunda-feira distante, 10:00 em São Paulo (13:00Z), dentro da grade padrão. */
let dayCounter = 0;
const slot = (hourUtc = 13, durationMinutes = 30) => {
  const start = new Date(Date.UTC(2031, 0, 6 + 28 * dayCounter, hourUtc, 0));
  return {
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + durationMinutes * 60_000).toISOString(),
  };
};

const seed = async () => {
  const repos = await getRepositories(clinicScope(CLINIC_A_ID));
  const patient = buildPatient();
  await repos.patients.save(patient);
  return { repos, patient };
};

const booking = (patientId: string, hourUtc = 13) => ({
  patientId,
  ...slot(hourUtc),
  procedure: 'Curativo',
  priceCents: 9000,
});

const auditOf = async (
  repos: Awaited<ReturnType<typeof seed>>['repos'],
  resourceId: string,
) =>
  (await repos.auditEvents.findAll()).filter(
    (e) => e.resourceId === resourceId,
  );

const FORCE_FAILURE = sql`ALTER TABLE audit_events ADD CONSTRAINT audit_events_falha_forcada CHECK (false) NOT VALID`;
const RELEASE_FAILURE = sql`ALTER TABLE audit_events DROP CONSTRAINT audit_events_falha_forcada`;

/** Roda `fn` com a gravação da auditoria falhando, como o banco real faria. */
async function withAuditFailure<T>(fn: () => Promise<T>): Promise<T> {
  await (await getDb()).execute(FORCE_FAILURE);
  try {
    return await fn();
  } finally {
    await (await getDb()).execute(RELEASE_FAILURE);
  }
}

beforeEach(async () => {
  dayCounter += 1;
  await ensureTestClinics();
  refreshed.mockClear();
  cookieStore.value = sessionToken(
    'atendente',
    'atendente@clinica.com',
    undefined,
    CLINIC_A_ID,
  );
});

describe('Feature: gravações da agenda auditam na mesma transação (ADR-075, Postgres real)', () => {
  it('Dada uma consulta nova, Quando a atendente agenda, Então a consulta e o evento de auditoria ficam gravados, o retorno de origem vira agendado e a tela é atualizada', async () => {
    const { repos, patient } = await seed();
    const followUp = FollowUp.create({
      patientId: patient.id,
      appointmentId: null,
      dueDate: new Date('2031-01-02T12:00:00Z'),
      reason: 'Retorno: avaliação',
    });
    await repos.followUps.save(followUp);
    const { scheduleAppointment } = await import(
      '@/app/(staff)/agenda/agenda-actions'
    );

    const result = await scheduleAppointment({
      ...booking(patient.id),
      followUpId: followUp.id,
    });

    expect(result.success).toBe(true);
    const id = result.data?.id as string;
    expect(await repos.appointments.findById(id)).not.toBeNull();
    expect((await repos.followUps.findById(followUp.id))?.status).toBe(
      'scheduled',
    );
    const events = await auditOf(repos, id);
    expect(events).toHaveLength(1);
    expect(events[0]?.detail).toBe('consulta agendada');
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('Dado que a gravação da auditoria falha, Quando a atendente agenda, Então a transação desfaz tudo: nem a consulta nem o retorno mudam e a tela não é atualizada', async () => {
    const { repos, patient } = await seed();
    const followUp = FollowUp.create({
      patientId: patient.id,
      appointmentId: null,
      dueDate: new Date('2031-01-02T12:00:00Z'),
      reason: 'Retorno: avaliação',
    });
    await repos.followUps.save(followUp);
    const { scheduleAppointment } = await import(
      '@/app/(staff)/agenda/agenda-actions'
    );
    const input = { ...booking(patient.id), followUpId: followUp.id };

    const result = await withAuditFailure(() => scheduleAppointment(input));

    expect(result.success).toBe(false);
    expect(
      await repos.appointments.findInRange(
        new Date(input.startsAt),
        new Date(input.endsAt),
      ),
    ).toHaveLength(0);
    expect((await repos.followUps.findById(followUp.id))?.status).toBe(
      'pending',
    );
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('Dado um horário já ocupado, Quando a atendente agenda por cima, Então recebe a mesma mensagem de conflito de sempre e nada é auditado', async () => {
    const { repos, patient } = await seed();
    const { scheduleAppointment } = await import(
      '@/app/(staff)/agenda/agenda-actions'
    );
    const first = await scheduleAppointment(booking(patient.id));
    expect(first.success).toBe(true);
    refreshed.mockClear();
    const before = (await repos.auditEvents.findAll()).length;

    const second = await scheduleAppointment(booking(patient.id));

    expect(second.success).toBe(false);
    expect(second.error).toBe(
      'Horário indisponível: é necessário intervalo mínimo de 15 minutos entre consultas',
    );
    expect((await repos.auditEvents.findAll()).length).toBe(before);
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('Dada uma consulta agendada, Quando confirmar, remarcar e concluir, Então cada passo grava a consulta com o seu evento e a conclusão gera a fatura', async () => {
    const { repos, patient } = await seed();
    const actions = await import('@/app/(staff)/agenda/agenda-actions');
    const created = await actions.scheduleAppointment(booking(patient.id));
    const id = created.data?.id as string;

    expect((await actions.confirmAppointment({ id })).success).toBe(true);
    const moved = slot(14);
    expect(
      (await actions.rescheduleAppointment({ id, ...moved })).success,
    ).toBe(true);
    const done = await actions.completeAppointment({ id });

    expect(done.success).toBe(true);
    expect((await repos.appointments.findById(id))?.status).toBe('completed');
    expect(
      (await repos.invoices.findAll()).some((i) => i.appointmentId === id),
    ).toBe(true);
    expect((await auditOf(repos, id)).map((e) => e.detail).sort()).toEqual([
      'consulta agendada',
      'consulta concluída',
      'consulta confirmada',
      'consulta remarcada',
    ]);
  });

  it('Dado que a auditoria falha, Quando a atendente conclui a consulta, Então a consulta segue agendada e nenhuma fatura é criada', async () => {
    const { repos, patient } = await seed();
    const actions = await import('@/app/(staff)/agenda/agenda-actions');
    const created = await actions.scheduleAppointment(booking(patient.id));
    const id = created.data?.id as string;
    refreshed.mockClear();

    const result = await withAuditFailure(() =>
      actions.completeAppointment({ id }),
    );

    expect(result.success).toBe(false);
    expect((await repos.appointments.findById(id))?.status).toBe('scheduled');
    expect(
      (await repos.invoices.findAll()).some((i) => i.appointmentId === id),
    ).toBe(false);
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('Dadas duas consultas, Quando cancelar uma e registrar falta na outra, Então ambas mudam de status e são auditadas', async () => {
    const { repos, patient } = await seed();
    const actions = await import('@/app/(staff)/agenda/agenda-actions');
    const a = await actions.scheduleAppointment(booking(patient.id, 13));
    const b = await actions.scheduleAppointment(booking(patient.id, 15));

    const cancelled = await actions.cancelAppointment({
      id: a.data?.id as string,
      requestedBy: 'clinic',
    });
    const noShow = await actions.markAppointmentNoShow({
      id: b.data?.id as string,
    });

    expect(cancelled.success && noShow.success).toBe(true);
    expect(
      (await repos.appointments.findById(a.data?.id as string))?.status,
    ).toBe('cancelled');
    expect(
      (await repos.appointments.findById(b.data?.id as string))?.status,
    ).toBe('no_show');
    expect(
      (await auditOf(repos, a.data?.id as string)).map((e) => e.detail),
    ).toContain('consulta cancelada');
    expect(
      (await auditOf(repos, b.data?.id as string)).map((e) => e.detail),
    ).toContain('falta registrada');
  });

  it('Dada uma série semanal, Quando a atendente agenda 3 sessões, Então as 3 e um só evento de auditoria ficam gravados; com a auditoria falhando, nenhuma', async () => {
    const { repos, patient } = await seed();
    const { scheduleRecurring } = await import(
      '@/app/(staff)/agenda/agenda-actions'
    );
    const series = { ...booking(patient.id), occurrences: 3 };

    const failed = await withAuditFailure(() => scheduleRecurring(series));
    expect(failed.success).toBe(false);
    expect(await repos.appointments.findByPatientId(patient.id)).toHaveLength(
      0,
    );

    const ok = await scheduleRecurring(series);

    expect(ok.success).toBe(true);
    expect(ok.data?.created).toHaveLength(3);
    expect(await repos.appointments.findByPatientId(patient.id)).toHaveLength(
      3,
    );
    expect(
      (await repos.auditEvents.findAll()).filter((e) =>
        e.detail?.startsWith('série semanal: 3 criada(s)'),
      ),
    ).toHaveLength(1);
  });
});
