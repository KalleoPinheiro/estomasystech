import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type PartnerReportServices,
  SendPartnerMonthlyReports,
} from '@/application/partners/send-monthly-reports';
import type {
  EmailGateway,
  EmailMessage,
} from '@/application/ports/email-gateway';
import { Partner } from '@/domain/partner/partner';
import { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryPartnerRepository } from '@/infrastructure/persistence/in-memory/in-memory-partner-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

const NOW = new Date('2026-11-15T15:00:00Z');
const NEXT_MONTH = new Date('2026-12-15T15:00:00Z');
const RECENT = new Date('2026-06-01T15:00:00Z');
const OLD = new Date('2024-01-15T15:00:00Z');

class FakeEmail implements EmailGateway {
  readonly sent: EmailMessage[] = [];
  enabled = true;
  fail = false;

  async isEnabled(): Promise<boolean> {
    return this.enabled;
  }

  async send(message: EmailMessage): Promise<void> {
    if (this.fail) throw new Error('smtp recusou');
    this.sent.push(message);
  }
}

function slot(start: Date): TimeSlot {
  return TimeSlot.create(start, new Date(start.getTime() + 3_600_000));
}

describe('Feature: Relatório mensal ao parceiro que indica (RM-15)', () => {
  let partners: InMemoryPartnerRepository;
  let patients: InMemoryPatientRepository;
  let appointments: InMemoryAppointmentRepository;
  let email: FakeEmail;
  let partner: Partner;

  const services = (): PartnerReportServices => ({
    email,
    partners,
    patients,
    appointments,
  });

  const job = (name = 'Clínica Norte') =>
    new SendPartnerMonthlyReports([{ id: 'clinica-norte', name }], async () =>
      services(),
    );

  beforeEach(async () => {
    partners = new InMemoryPartnerRepository();
    patients = new InMemoryPatientRepository();
    appointments = new InMemoryAppointmentRepository();
    email = new FakeEmail();
    partner = Partner.create({
      fullName: 'Beatriz Nunes',
      email: 'beatriz@example.com',
      phone: '11999990000',
      crm: 'CRM-SP-99999',
      specialty: 'coloproctologia',
    });
    await partners.save(partner);
  });

  async function refer(
    fullName: string,
    extra: { phone?: string; notes?: string; cpf?: string } = {},
  ): Promise<Patient> {
    const patient = Patient.create({
      fullName,
      phone: extra.phone ?? '11911112222',
      email: `${fullName.split(' ')[0].toLowerCase()}@example.com`,
      cpf: extra.cpf,
      birthDate: new Date('1990-04-02T12:00:00Z'),
      notes: extra.notes,
      referredByPartnerId: partner.id,
    });
    await patients.save(patient);
    return patient;
  }

  async function book(
    patientId: string,
    start: Date,
    procedure: string,
    complete: boolean,
  ): Promise<void> {
    const created = Appointment.create({
      patientId,
      slot: slot(start),
      procedure,
      price: Money.fromCents(18000),
      notes: 'lesão com esfacelo',
    });
    await appointments.save(complete ? created.complete() : created);
  }

  it('Dado procedimento, telefone e notas do paciente, Quando o relatório mensal sai, Então o e-mail não contém esse dado clínico', async () => {
    const attended = await refer('Zeca Andrade', {
      phone: '11987654321',
      notes: 'exsudato purulento',
      cpf: '52998224725',
    });
    const waiting = await refer('Ana Lima');
    const onlyOld = await refer('Ivo Braga');
    await book(attended.id, RECENT, 'Desbridamento sacral', true);
    await book(attended.id, OLD, 'Estomia antiga', true);
    await book(attended.id, RECENT, 'Avaliacao PUSH-3', false);
    await book(waiting.id, RECENT, 'Curativo de estomia', false);
    await book(onlyOld.id, OLD, 'Ferida cronica antiga', true);

    const summary = await job().execute(NOW);
    const message = email.sent[0];

    expect(summary).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(email.sent).toHaveLength(1);
    expect(message?.to).toBe('beatriz@example.com');
    expect(message?.subject).toBe(
      'Relatório mensal de indicações — Clínica Norte',
    );
    const text = message?.text ?? '';
    expect(text).toContain('Olá, Beatriz!');
    expect(text).toContain('novembro de 2026');
    expect(text.indexOf('- Ana Lima: sem consulta realizada')).toBeLessThan(
      text.indexOf('- Ivo Braga: sem consulta realizada'),
    );
    expect(text).toContain(
      '- Zeca Andrade: consulta realizada nos últimos 24 meses',
    );
    for (const leaked of [
      'Desbridamento sacral',
      'Estomia antiga',
      'Avaliacao PUSH-3',
      'Curativo de estomia',
      'Ferida cronica antiga',
      'esfacelo',
      'exsudato purulento',
      '987654321',
      '52998224725',
      '1990',
      'CRM-SP-99999',
      'coloproctologia',
      'Nunes',
    ]) {
      expect(text).not.toContain(leaked);
    }
  });

  it('Dado o relatório do mês já enviado, Quando o job roda de novo, Então o e-mail não sai outra vez', async () => {
    const patient = await refer('Ana Lima');
    await book(patient.id, RECENT, 'Desbridamento sacral', true);

    await job().execute(NOW);
    const second = await job().execute(NOW);

    expect(email.sent).toHaveLength(1);
    expect(second).toEqual({ sent: 0, skipped: 1, failed: 0 });
  });

  it('Dado paciente indicado na clínica A, Quando a clínica B envia o relatório, Então o e-mail da B não cita o paciente da A', async () => {
    const ana = await refer('Ana Lima');
    await book(ana.id, RECENT, 'Desbridamento sacral', true);
    const partnersB = new InMemoryPartnerRepository();
    const patientsB = new InMemoryPatientRepository();
    const partnerB = Partner.create({
      fullName: 'Carlos Dias',
      email: 'beatriz@example.com',
      phone: '11999990000',
    });
    await partnersB.save(partnerB);
    const bruno = Patient.create({
      fullName: 'Bruno Costa',
      phone: '11922223333',
      referredByPartnerId: partnerB.id,
    });
    await patientsB.save(bruno);

    const summary = await new SendPartnerMonthlyReports(
      [
        { id: 'clinica-a', name: 'Clínica A' },
        { id: 'clinica-b', name: 'Clínica B' },
      ],
      async (clinicId) =>
        clinicId === 'clinica-a'
          ? services()
          : {
              email,
              partners: partnersB,
              patients: patientsB,
              appointments: new InMemoryAppointmentRepository(),
            },
    ).execute(NOW);

    expect(summary.sent).toBe(2);
    const textA = email.sent.find((m) => m.subject.includes('Clínica A'))?.text;
    const textB = email.sent.find((m) => m.subject.includes('Clínica B'))?.text;
    expect(textA).toContain('Ana Lima');
    expect(textA).not.toContain('Bruno Costa');
    expect(textB).toContain('Bruno Costa');
    expect(textB).not.toContain('Ana Lima');
    expect(textB).not.toContain('Desbridamento sacral');
  });

  it('Dado o provedor recusando o e-mail, Quando o relatório é enviado, Então não grava o mês e a próxima execução tenta de novo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const patient = await refer('Ana Lima');
    await book(patient.id, RECENT, 'Desbridamento sacral', true);
    email.fail = true;

    const failed = await job().execute(NOW);
    email.fail = false;
    const retried = await job().execute(NOW);

    expect(failed).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect(email.sent).toHaveLength(1);
    expect(retried.sent).toBe(1);
  });

  it('Dado parceiro desativado, Quando o mês vira, Então o relatório não sai para ele', async () => {
    await partners.save(partner.deactivate());
    await refer('Ana Lima');

    const summary = await job().execute(NOW);

    expect(email.sent).toHaveLength(0);
    expect(summary).toEqual({ sent: 0, skipped: 0, failed: 0 });
  });

  it('Dado parceiro sem indicação, Quando o mês roda, Então nada sai e a indicação nova no mesmo mês ainda é enviada', async () => {
    const first = await job().execute(NOW);
    await refer('Ana Lima');
    const second = await job().execute(NOW);

    expect(first).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(second.sent).toBe(1);
    expect(email.sent).toHaveLength(1);
  });

  it('Dado o relatório de novembro enviado, Quando chega dezembro, Então o e-mail sai de novo', async () => {
    await refer('Ana Lima');
    await job().execute(NOW);
    const december = await job().execute(NEXT_MONTH);

    expect(email.sent).toHaveLength(2);
    expect(december.sent).toBe(1);
    expect(email.sent[1]?.text).toMatch(/dezembro de 2026/i);
  });

  it('Dado canal de e-mail desligado, Quando o mês roda, Então não grava e o mês sai quando o canal liga', async () => {
    await refer('Ana Lima');
    email.enabled = false;
    const dry = await job().execute(NOW);
    email.enabled = true;
    const live = await job().execute(NOW);

    expect(dry).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(live.sent).toBe(1);
    expect(email.sent).toHaveLength(2);
  });

  it('Dada clínica suspensa ou ilegível, Quando o mês roda, Então a suspensa não abre e a falha não derruba a outra', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await refer('Ana Lima');
    const opened: string[] = [];
    const summary = await new SendPartnerMonthlyReports(
      [
        { id: 'clinica-norte', name: 'Clínica Norte' },
        { id: 'suspensa', name: 'Clínica Suspensa', status: 'suspended' },
        { id: 'quebrada', name: 'Clínica Quebrada' },
      ],
      async (clinicId) => {
        opened.push(clinicId);
        if (clinicId === 'quebrada') throw new Error('banco fora');
        return services();
      },
    ).execute(NOW);

    expect(opened).toEqual(['clinica-norte', 'quebrada']);
    expect(summary).toEqual({ sent: 1, skipped: 0, failed: 1 });
    expect(email.sent).toHaveLength(1);
  });
});
