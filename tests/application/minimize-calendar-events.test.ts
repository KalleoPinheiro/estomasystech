import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MINIMIZE_ACTOR,
  MINIMIZE_ATTEMPTS,
  MINIMIZE_BACKOFF_MS,
  MINIMIZE_BATCH,
  MINIMIZE_CHUNK,
  MINIMIZE_PAUSE_MS,
  MinimizeCalendarEvents,
} from '@/application/appointments/minimize-calendar-events';
import {
  type CalendarEventInput,
  type CalendarGateway,
  CalendarRateLimitedError,
  NullCalendarGateway,
} from '@/application/ports/calendar-gateway';
import { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryAuditEventRepository } from '@/infrastructure/persistence/in-memory/in-memory-audit-event-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { loggedLines } from '../support/log-lines';

const CLINIC = 'clinica-1';
const NOW = new Date('2026-10-17T12:00:00Z');
const APP_URL = 'https://app.example.com';
const SECRETS = ['Maria da Silva', '11999990000', 'Troca de bolsa'];

class FakeGateway implements CalendarGateway {
  readonly rewritten: { eventId: string; input: CalendarEventInput }[] = [];
  /** Falhas programadas por evento: cada chamada consome uma. */
  readonly failures = new Map<string, unknown[]>();

  async createEvent(): Promise<string | null> {
    return null;
  }
  async updateEvent(): Promise<void> {}
  async deleteEvent(): Promise<void> {}
  async purgeEvent(): Promise<void> {}
  async rewriteEvent(eventId: string, input: CalendarEventInput) {
    const next = this.failures.get(eventId)?.shift();
    if (next) throw next;
    this.rewritten.push({ eventId, input });
  }
}

let patients: InMemoryPatientRepository;
let appointments: InMemoryAppointmentRepository;
let audit: InMemoryAuditEventRepository;
let gateway: FakeGateway;
let sleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;
let maria: Patient;
let errorSpy: ReturnType<typeof vi.spyOn>;

async function legacyEvent(
  id: string,
  startsAt: string,
  patientId = maria.id,
  eventId: string | null = `evt-${id}`,
) {
  const start = new Date(startsAt);
  await appointments.save(
    Appointment.restore({
      id,
      patientId,
      slot: TimeSlot.create(start, new Date(start.getTime() + 3600_000)),
      procedure: 'Troca de bolsa',
      price: Money.fromCents(25000),
      notes: null,
      status: 'scheduled',
      googleEventId: eventId,
      createdAt: NOW,
    }),
  );
}

function job(calendar: CalendarGateway = gateway) {
  return new MinimizeCalendarEvents(
    CLINIC,
    appointments,
    patients,
    calendar,
    audit,
    APP_URL,
    () => NOW,
    sleep,
  );
}

describe('Feature: Minimização em lote dos eventos antigos do Google Agenda (#339, AGE-RN-19)', () => {
  beforeEach(async () => {
    patients = new InMemoryPatientRepository();
    appointments = new InMemoryAppointmentRepository();
    audit = new InMemoryAuditEventRepository(CLINIC);
    gateway = new FakeGateway();
    sleep = vi.fn(async () => undefined);
    maria = Patient.create({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    await patients.save(maria);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Dado eventos antigos, Quando aplica, Então reescreve só com iniciais, horário e link, e nunca com nome, telefone ou procedimento', async () => {
    await legacyEvent('a1', '2026-10-20T12:00:00Z');

    const summary = await job().execute({ apply: true });

    expect(summary).toMatchObject({ pending: 1, rewritten: 1, failed: 0 });
    const [{ eventId, input }] = gateway.rewritten;
    expect(eventId).toBe('evt-a1');
    expect(input.title).toBe('Consulta · M.S.');
    expect(input.description).toBe(
      `Abrir no EstomaSysTech: ${APP_URL}/agenda?consulta=a1&em=2026-10-20T12%3A00%3A00.000Z`,
    );
    expect(input.startsAt).toEqual(new Date('2026-10-20T12:00:00Z'));
    const serialized = JSON.stringify(input);
    for (const secret of SECRETS) expect(serialized).not.toContain(secret);
  });

  it('Dado a execução já feita, Quando reexecuta, Então não altera eventos já reescritos', async () => {
    await legacyEvent('a1', '2026-10-20T12:00:00Z');
    await job().execute({ apply: true });

    const again = await job().execute({ apply: true });

    expect(again).toMatchObject({ pending: 0, rewritten: 0, failed: 0 });
    expect(gateway.rewritten).toHaveLength(1);
  });

  it('Dado lote com falha parcial, Quando aplica e depois reexecuta, Então a falha não interrompe o lote e é retomada sem repetir os feitos', async () => {
    await legacyEvent('a1', '2026-10-22T12:00:00Z');
    await legacyEvent('a2', '2026-10-21T12:00:00Z');
    await legacyEvent('a3', '2026-10-20T12:00:00Z');
    gateway.failures.set('evt-a2', [new Error('Google 500')]);

    const first = await job().execute({ apply: true });

    expect(first).toMatchObject({
      rewritten: 2,
      failed: 1,
      rateLimited: false,
    });
    expect(gateway.rewritten.map((r) => r.eventId)).toEqual([
      'evt-a1',
      'evt-a3',
    ]);
    const logs = JSON.stringify(loggedLines(errorSpy));
    expect(logs).toContain('a2');
    for (const secret of SECRETS) expect(logs).not.toContain(secret);

    const second = await job().execute({ apply: true });

    expect(second).toMatchObject({ pending: 1, rewritten: 1, failed: 0 });
    expect(gateway.rewritten.map((r) => r.eventId)).toEqual([
      'evt-a1',
      'evt-a3',
      'evt-a2',
    ]);
  });

  it('Dado limite de taxa passageiro, Quando aplica, Então espera com backoff exponencial e conclui', async () => {
    await legacyEvent('a1', '2026-10-20T12:00:00Z');
    gateway.failures.set('evt-a1', [
      new CalendarRateLimitedError(),
      new CalendarRateLimitedError(),
    ]);

    const summary = await job().execute({ apply: true });

    expect(summary).toMatchObject({
      rewritten: 1,
      failed: 0,
      rateLimited: false,
    });
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([
      MINIMIZE_BACKOFF_MS,
      MINIMIZE_BACKOFF_MS * 2,
    ]);
  });

  it('Dado cota esgotada, Quando aplica, Então para o lote, deixa o resto pendente e registra o que foi feito', async () => {
    await legacyEvent('a1', '2026-10-22T12:00:00Z');
    await legacyEvent('a2', '2026-10-21T12:00:00Z');
    await legacyEvent('a3', '2026-10-20T12:00:00Z');
    gateway.failures.set(
      'evt-a2',
      Array.from(
        { length: MINIMIZE_ATTEMPTS },
        () => new CalendarRateLimitedError(),
      ),
    );

    const summary = await job().execute({ apply: true });

    expect(summary).toMatchObject({
      rewritten: 1,
      failed: 0,
      rateLimited: true,
    });
    expect(gateway.rewritten.map((r) => r.eventId)).toEqual(['evt-a1']);
    const resumed = await job().execute({ apply: true });
    expect(resumed).toMatchObject({ pending: 2, rewritten: 2 });
  });

  it('Dado mais de uma rajada, Quando aplica, Então pausa entre as rajadas para respeitar a cota', async () => {
    for (let i = 0; i < MINIMIZE_CHUNK + 1; i += 1) {
      await legacyEvent(
        `b${i}`,
        `2026-11-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
      );
    }

    await job().execute({ apply: true });

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(MINIMIZE_PAUSE_MS);
  });

  it('Dado muitos pendentes, Quando aplica, Então trata no máximo um lote, do mais futuro para o mais antigo', async () => {
    expect(MINIMIZE_BATCH).toBeGreaterThan(0);
    await legacyEvent('antigo', '2020-01-10T12:00:00Z');
    await legacyEvent('futuro', '2027-01-10T12:00:00Z');

    await job().execute({ apply: true });

    expect(gateway.rewritten.map((r) => r.eventId)).toEqual([
      'evt-futuro',
      'evt-antigo',
    ]);
  });

  it('Dado janela --desde, Quando aplica, Então ignora consultas anteriores a ela', async () => {
    await legacyEvent('antigo', '2020-01-10T12:00:00Z');
    await legacyEvent('recente', '2026-10-01T12:00:00Z');

    const summary = await job().execute({
      apply: true,
      since: new Date('2026-01-01T00:00:00Z'),
    });

    expect(summary.rewritten).toBe(1);
    expect(gateway.rewritten[0].eventId).toBe('evt-recente');
    const [event] = await audit.findAll();
    expect(JSON.parse(event.detail ?? '{}').since).toBe('2026-01-01');
  });

  it('Dado simulação, Quando executa sem confirmar, Então só conta os pendentes e não toca no Google nem audita', async () => {
    await legacyEvent('a1', '2026-10-20T12:00:00Z');

    const summary = await job().execute({ apply: false });

    expect(summary).toMatchObject({ pending: 1, rewritten: 0 });
    expect(gateway.rewritten).toHaveLength(0);
    expect(await audit.findAll()).toHaveLength(0);
    expect((await job().execute({ apply: true })).rewritten).toBe(1);
  });

  it('Dado integração ausente, Quando executa, Então não lê nem reescreve nada', async () => {
    await legacyEvent('a1', '2026-10-20T12:00:00Z');

    const summary = await job(new NullCalendarGateway()).execute({
      apply: true,
    });

    expect(summary).toMatchObject({ skipped: true, rewritten: 0 });
    expect(await audit.findAll()).toHaveLength(0);
    expect((await job().execute({ apply: false })).pending).toBe(1);
  });

  it('Dado paciente anonimizado, ausente ou sem APP_URL, Quando aplica, Então o título é só "Consulta" e o link some sem APP_URL', async () => {
    const anonymized = Patient.restore({
      id: 'p-anon',
      fullName: 'Paciente anonimizado',
      email: 'x@example.com',
      phone: '11999990000',
      active: false,
      createdAt: NOW,
      anonymizedAt: NOW,
    });
    await patients.save(anonymized);
    await legacyEvent('c1', '2026-10-20T12:00:00Z', 'p-anon');
    await legacyEvent('c2', '2026-10-19T12:00:00Z', 'ghost');

    await job().execute({ apply: true });

    expect(gateway.rewritten.map((r) => r.input.title)).toEqual([
      'Consulta',
      'Consulta',
    ]);
    const noLink = new MinimizeCalendarEvents(
      CLINIC,
      appointments,
      patients,
      gateway,
      audit,
      null,
      () => NOW,
      sleep,
    );
    await legacyEvent('c3', '2026-10-18T12:00:00Z');
    await noLink.execute({ apply: true });
    expect(gateway.rewritten.at(-1)?.input.description).toBe('');
  });

  it('Dado consulta sem evento no Google, Quando aplica, Então nada é buscado para ela', async () => {
    await legacyEvent('d1', '2026-10-20T12:00:00Z', maria.id, null);

    expect(await job().execute({ apply: true })).toMatchObject({ pending: 0 });
  });

  it('Dado reescrita feita, Quando audita, Então o evento traz só contagens, sem PII', async () => {
    await legacyEvent('a1', '2026-10-22T12:00:00Z');
    await legacyEvent('a2', '2026-10-21T12:00:00Z');
    gateway.failures.set('evt-a2', [new Error('Google 500')]);

    await job().execute({ apply: true });

    const [event] = await audit.findAll();
    expect(event).toMatchObject({
      clinicId: CLINIC,
      actorRole: 'system',
      actorId: MINIMIZE_ACTOR,
      action: 'update',
      resourceType: 'calendar-minimization',
      resourceId: '2026-10-17',
    });
    expect(JSON.parse(event.detail ?? '{}')).toEqual({
      rewritten: 1,
      failed: 1,
      rateLimited: false,
      since: null,
    });
  });
});
