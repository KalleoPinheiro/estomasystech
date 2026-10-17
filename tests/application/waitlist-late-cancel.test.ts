import { beforeEach, describe, expect, it } from 'vitest';
import {
  CancelAppointmentByStaff,
  MarkNoShow,
} from '@/application/appointments/cancel-appointment-by-staff';
import { ScheduleAppointment } from '@/application/appointments/schedule-appointment';
import { CreatePatient } from '@/application/patients/create-patient';
import { CancelOwnAppointment } from '@/application/portal/cancel-own-appointment';
import {
  AddToWaitlist,
  findWaitlistMatches,
  ResolveWaitlistEntry,
} from '@/application/scheduling/waitlist';
import { Procedure } from '@/domain/catalog/procedure';
import type { Patient } from '@/domain/patient/patient';
import { Professional } from '@/domain/professional/professional';
import type { Appointment } from '@/domain/scheduling/appointment';
import { NotFoundError, ValidationError } from '@/domain/shared/errors';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import {
  InMemoryProcedureRepository,
  InMemoryScheduleConfigRepository,
  InMemoryWaitlistRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';
import { InMemoryProfessionalRepository } from '@/infrastructure/persistence/in-memory/in-memory-professional-repository';
import { portalPatientId } from '../support/portal-identity';

// Consulta: segunda 2026-07-20 09:00 UTC (testes com TZ=UTC).
const policy = { noticeHours: 24, lateFeeCents: 5000 };
const early = new Date('2026-07-18T09:00:00Z');
const late = new Date('2026-07-20T07:00:00Z');

describe('Feature: Cancelamento tardio e falta com taxa', () => {
  let patients: InMemoryPatientRepository;
  let appointments: InMemoryAppointmentRepository;
  let invoices: InMemoryInvoiceRepository;
  let maria: Patient;
  let appointment: Appointment;

  beforeEach(async () => {
    patients = new InMemoryPatientRepository();
    appointments = new InMemoryAppointmentRepository();
    invoices = new InMemoryInvoiceRepository();
    maria = await new CreatePatient(patients).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    appointment = await new ScheduleAppointment(appointments, patients).execute(
      {
        patientId: maria.id,
        startsAt: new Date('2026-07-20T09:00:00Z'),
        endsAt: new Date('2026-07-20T10:00:00Z'),
        procedure: 'Curativo',
        priceCents: 15000,
      },
    );
  });

  const cancel = (
    input: Omit<Parameters<CancelAppointmentByStaff['execute']>[0], 'id'>,
    withPolicy = policy,
  ) =>
    new CancelAppointmentByStaff(appointments, invoices, withPolicy).execute({
      id: appointment.id,
      ...input,
    });

  it('Dado pedido da clínica em cima da hora, Quando cancelar, Então nunca é tardio e não gera taxa', async () => {
    const { appointment: result, feeInvoice } = await cancel({ now: late });
    expect(result.cancellation).toMatchObject({ by: 'clinic', late: false });
    expect(feeInvoice).toBeNull();
  });

  it('Dado pedido do paciente com antecedência, Quando cancelar, Então não é tardio', async () => {
    const { appointment: result } = await cancel({
      requestedBy: 'patient',
      now: early,
    });
    expect(result.cancellation).toMatchObject({ by: 'patient', late: false });
  });

  it('Dado pedido do paciente em cima da hora com taxa, Quando cancelar cobrando, Então fica tardio e gera fatura pendente ligada à consulta', async () => {
    const { appointment: result, feeInvoice } = await cancel({
      requestedBy: 'patient',
      reason: 'Imprevisto',
      chargeLateFee: true,
      now: late,
    });

    expect(result.cancellation).toMatchObject({
      by: 'patient',
      late: true,
      reason: 'Imprevisto',
    });
    expect(feeInvoice?.amount.cents).toBe(5000);
    expect(feeInvoice?.status).toBe('pending');
    expect(feeInvoice?.appointmentId).toBe(appointment.id);
    expect(feeInvoice?.description).toBe(
      'Taxa de cancelamento tardio — Curativo em 20/07',
    );
    expect(await invoices.findById(feeInvoice?.id as string)).not.toBeNull();
  });

  it('Dado pedido tardio sem cobrar, Quando cancelar, Então fica tardio sem fatura', async () => {
    const { appointment: result, feeInvoice } = await cancel({
      requestedBy: 'patient',
      now: late,
    });
    expect(result.cancellation?.late).toBe(true);
    expect(feeInvoice).toBeNull();
  });

  it('Dado pedido com antecedência, Quando tentar cobrar a taxa, Então ValidationError e nada muda', async () => {
    await expect(
      cancel({ requestedBy: 'patient', chargeLateFee: true, now: early }),
    ).rejects.toThrow(ValidationError);
    expect((await appointments.findById(appointment.id))?.status).toBe(
      'scheduled',
    );
  });

  it('Dado clínica sem taxa, Quando cobrar cancelamento tardio, Então ValidationError', async () => {
    await expect(
      cancel(
        { requestedBy: 'patient', chargeLateFee: true, now: late },
        { noticeHours: 24, lateFeeCents: 0 },
      ),
    ).rejects.toThrow('A clínica não tem taxa de cancelamento configurada');
  });

  it('Dado consulta inexistente, Quando cancelar, Então NotFound', async () => {
    await expect(
      new CancelAppointmentByStaff(appointments, invoices, policy).execute({
        id: 'nao-existe',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('Dado falta, Quando registrar cobrando, Então gera taxa de não comparecimento; sem cobrar, só a falta', async () => {
    const charged = await new MarkNoShow(
      appointments,
      invoices,
      policy,
    ).execute({ id: appointment.id, chargeLateFee: true });
    expect(charged.appointment.status).toBe('no_show');
    expect(charged.feeInvoice?.description).toBe(
      'Taxa de não comparecimento — Curativo em 20/07',
    );

    const other = await new ScheduleAppointment(appointments, patients).execute(
      {
        patientId: maria.id,
        startsAt: new Date('2026-07-21T09:00:00Z'),
        endsAt: new Date('2026-07-21T10:00:00Z'),
        procedure: 'Curativo',
        priceCents: 15000,
      },
    );
    const free = await new MarkNoShow(appointments, invoices).execute({
      id: other.id,
    });
    expect(free.feeInvoice).toBeNull();
  });

  it('Dado política de 48h, Quando o paciente cancela pelo portal 30h antes, Então recusa com as 48h na mensagem', async () => {
    const scheduleConfig = new InMemoryScheduleConfigRepository();
    await scheduleConfig.save({
      weekdays: [1, 2, 3, 4, 5],
      startHour: 8,
      endHour: 18,
      minGapMinutes: 15,
      cancellationPolicy: { noticeHours: 48, lateFeeCents: 0 },
    });
    await expect(
      new CancelOwnAppointment(patients, appointments, scheduleConfig).execute({
        patientId: await portalPatientId(patients, 'maria@example.com'),
        appointmentId: appointment.id,
        now: new Date('2026-07-19T03:00:00Z'),
      }),
    ).rejects.toThrow('Faltam menos de 48 horas');
  });
});

describe('Feature: Lista de espera', () => {
  let patients: InMemoryPatientRepository;
  let procedures: InMemoryProcedureRepository;
  let professionals: InMemoryProfessionalRepository;
  let waitlist: InMemoryWaitlistRepository;
  let maria: Patient;
  let joao: Patient;
  let curativo: Procedure;
  let ana: Professional;
  const now = new Date('2026-07-01T12:00:00Z');

  beforeEach(async () => {
    patients = new InMemoryPatientRepository();
    procedures = new InMemoryProcedureRepository();
    professionals = new InMemoryProfessionalRepository();
    waitlist = new InMemoryWaitlistRepository();
    maria = await new CreatePatient(patients).execute({
      fullName: 'Maria',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    joao = await new CreatePatient(patients).execute({
      fullName: 'João',
      email: 'joao@example.com',
      phone: '11988880000',
    });
    curativo = Procedure.create({
      name: 'Curativo',
      priceCents: 15000,
      durationMinutes: 60,
    });
    await procedures.save(curativo);
    ana = Professional.create({ fullName: 'Dra. Ana' });
    await professionals.save(ana);
  });

  const add = (input: Partial<Parameters<AddToWaitlist['execute']>[0]> = {}) =>
    new AddToWaitlist(waitlist, patients, procedures, professionals).execute({
      patientId: maria.id,
      fromDate: '2026-07-10',
      toDate: '2026-07-20',
      source: 'staff',
      now,
      ...input,
    });

  it('Dado pedido válido, Quando adicionar, Então entra na fila; repetir o mesmo pedido não duplica', async () => {
    const first = await add({ procedureId: curativo.id });
    const again = await add({ procedureId: curativo.id });
    expect(again.id).toBe(first.id);
    expect(await waitlist.listWaiting()).toHaveLength(1);
  });

  it('Dado paciente inativo, procedimento inativo ou profissional inexistente, Quando adicionar, Então NotFound', async () => {
    await patients.save(joao.deactivate());
    await expect(add({ patientId: joao.id })).rejects.toThrow(NotFoundError);
    await procedures.save(curativo.deactivate());
    await expect(add({ procedureId: curativo.id })).rejects.toThrow(
      NotFoundError,
    );
    await expect(add({ professionalId: 'nao-existe' })).rejects.toThrow(
      NotFoundError,
    );
  });

  it('Dado período já passado, Quando adicionar, Então ValidationError', async () => {
    await expect(
      add({ fromDate: '2026-06-01', toDate: '2026-06-30' }),
    ).rejects.toThrow('O período desejado já passou');
  });

  it('Dado pedido do paciente começando antes de hoje, Então recusa; pela recepção, aceita', async () => {
    await expect(
      add({ source: 'patient', fromDate: '2026-06-28' }),
    ).rejects.toThrow('Escolha um período a partir de hoje');
    await expect(add({ fromDate: '2026-06-28' })).resolves.toBeTruthy();
  });

  it('Dado fila com pedidos, Quando um horário vaga, Então as correspondências vêm por ordem de chegada e respeitam profissional e janela', async () => {
    const first = await add({ now: new Date('2026-07-01T10:00:00Z') });
    const withAna = await add({
      patientId: joao.id,
      professionalId: ana.id,
      now: new Date('2026-07-01T11:00:00Z'),
    });
    await add({
      patientId: joao.id,
      fromDate: '2026-07-25',
      toDate: '2026-07-30',
    });

    const anaSlot = await findWaitlistMatches(waitlist, '2026-07-15', ana.id);
    expect(anaSlot.map((e) => e.id)).toEqual([first.id, withAna.id]);

    const otherSlot = await findWaitlistMatches(waitlist, '2026-07-15', 'bia');
    expect(otherSlot.map((e) => e.id)).toEqual([first.id]);
  });

  it('Dado entrada na fila, Quando resolver, Então sai da fila; de outro paciente pelo portal, NotFound', async () => {
    const entry = await add();
    const resolve = new ResolveWaitlistEntry(waitlist);

    await expect(
      resolve.execute(entry.id, 'removed', { patientId: joao.id }),
    ).rejects.toThrow(NotFoundError);
    const done = await resolve.execute(entry.id, 'scheduled', {
      patientId: maria.id,
    });
    expect(done.status).toBe('scheduled');
    expect(await waitlist.listWaiting()).toEqual([]);
    await expect(resolve.execute('nao-existe', 'removed')).rejects.toThrow(
      NotFoundError,
    );
  });
});
