import { beforeEach, describe, expect, it } from 'vitest';
import type {
  EmailGateway,
  EmailMessage,
} from '@/application/ports/email-gateway';
import {
  AdvanceWaitlistOffers,
  type OfferServices,
  offerCancelledSlot,
  WaitlistSlotOffers,
} from '@/application/scheduling/offer-waitlist-slot';
import { Guardian } from '@/domain/guardian/guardian';
import { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import { WaitlistEntry } from '@/domain/scheduling/waitlist';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import { InMemoryWaitlistRepository } from '@/infrastructure/persistence/in-memory/in-memory-foundation-repositories';
import { InMemoryGuardianRepository } from '@/infrastructure/persistence/in-memory/in-memory-guardian-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

class FakeEmail implements EmailGateway {
  readonly sent: EmailMessage[] = [];
  enabled = true;
  fail = false;

  async isEnabled(): Promise<boolean> {
    return this.enabled;
  }

  async send(message: EmailMessage): Promise<void> {
    if (this.fail) throw new Error('smtp');
    this.sent.push(message);
  }
}

class HiddenPatients extends InMemoryPatientRepository {
  hidden: string | null = null;

  override async findById(id: string): Promise<Patient | null> {
    if (id === this.hidden) return null;
    return super.findById(id);
  }
}

const at = (iso: string) => new Date(iso);
const NOW = at('2026-07-20T06:00:00Z');
const START = at('2026-07-20T12:00:00Z');
const END = at('2026-07-20T13:00:00Z');

function harness() {
  const patients = new HiddenPatients();
  const appointments = new InMemoryAppointmentRepository();
  const waitlist = new InMemoryWaitlistRepository();
  const guardians = new InMemoryGuardianRepository();
  const email = new FakeEmail();
  const services: OfferServices = {
    appointments,
    waitlist,
    patients,
    guardians,
    email,
  };
  const offers = new WaitlistSlotOffers(services, 'Clínica Sol');
  return {
    patients,
    appointments,
    waitlist,
    guardians,
    email,
    services,
    offers,
  };
}

async function patient(
  patients: InMemoryPatientRepository,
  fullName: string,
  email: string | null = `${fullName.split(' ')[0].toLowerCase()}@example.com`,
  guardianId?: string,
): Promise<Patient> {
  const created = Patient.create({
    fullName,
    email,
    phone: '11999990000',
    guardianId,
  });
  await patients.save(created);
  return created;
}

function cancelled(
  patientId: string,
  start = START,
  professionalId: string | null = null,
): Appointment {
  return Appointment.create({
    patientId,
    slot: TimeSlot.create(start, new Date(start.getTime() + 60 * 60 * 1000)),
    procedure: 'Curativo',
    price: Money.fromCents(15000),
    professionalId,
  }).cancel({ at: NOW });
}

function queued(
  patientId: string,
  createdAt: string,
  professionalId?: string | null,
): WaitlistEntry {
  return WaitlistEntry.create(
    {
      patientId,
      professionalId,
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
      source: 'staff',
    },
    at(createdAt),
  );
}

describe('Feature: Oferta de vaga da lista de espera (RM-16)', () => {
  let box: ReturnType<typeof harness>;

  beforeEach(() => {
    box = harness();
  });

  it('Dado consulta cancelada e dois na fila, Quando oferece a vaga, Então o e-mail vai para o seguinte e vale 2 horas', async () => {
    const ana = await patient(box.patients, 'Ana Paula');
    const bia = await patient(box.patients, 'Bia Costa');
    const appointment = cancelled(ana.id);
    await box.appointments.save(appointment);
    await box.waitlist.save(queued(ana.id, '2026-07-01T00:00:00Z'));
    await box.waitlist.save(queued(bia.id, '2026-07-02T00:00:00Z'));

    const counts = await box.offers.offerCancelled(appointment.id, NOW);

    expect(counts.sent).toBe(1);
    expect(box.email.sent.map((message) => message.to)).toEqual([
      'bia@example.com',
    ]);
    expect(box.email.sent[0].text).toContain('20/07/2026 às 12:00');
    expect(box.email.sent[0].text).toContain('20/07/2026 às 08:00');
    expect(box.email.sent[0].text).toContain('Olá, Bia!');
    expect(box.email.sent[0].text).not.toContain('Curativo');
    const held = (await box.waitlist.listWaiting()).find(
      (entry) => entry.patientId === bia.id,
    );
    expect(held?.openOffer?.expiresAt.toISOString()).toBe(
      '2026-07-20T08:00:00.000Z',
    );
    expect(held?.offerEmailWasSent()).toBe(true);
  });

  it('Dado o paciente que cancelou está na fila, Quando a vaga é oferecida, Então ele não recebe e o próximo recebe', async () => {
    const ana = await patient(box.patients, 'Ana Paula');
    const bia = await patient(box.patients, 'Bia Costa');
    const appointment = cancelled(ana.id, START, 'prof-1');
    await box.appointments.save(appointment);
    await box.waitlist.save(queued(ana.id, '2026-07-01T00:00:00Z', 'prof-1'));
    await box.waitlist.save(queued(bia.id, '2026-07-02T00:00:00Z', 'prof-1'));

    await box.offers.offerCancelled(appointment.id, NOW);

    expect(box.email.sent.map((message) => message.to)).toEqual([
      'bia@example.com',
    ]);
    const fila = await box.waitlist.listWaiting();
    const anaEntry = fila.find((entry) => entry.patientId === ana.id);
    const biaEntry = fila.find((entry) => entry.patientId === bia.id);
    expect(anaEntry?.openOffer).toBeNull();
    expect(anaEntry?.wasOffered(appointment.id)).toBe(false);
    expect(biaEntry?.openOffer?.appointmentId).toBe(appointment.id);
    expect(biaEntry?.offerEmailWasSent()).toBe(true);
  });

  it('Dado a oferta já enviada, Quando oferece de novo, Então o e-mail não sai outra vez', async () => {
    const ana = await patient(box.patients, 'Ana Paula');
    const bia = await patient(box.patients, 'Bia Costa');
    const appointment = cancelled(ana.id);
    await box.appointments.save(appointment);
    await box.waitlist.save(queued(ana.id, '2026-07-01T00:00:00Z'));
    await box.waitlist.save(queued(bia.id, '2026-07-02T00:00:00Z'));

    await box.offers.offerCancelled(appointment.id, NOW);
    const again = await box.offers.offerCancelled(
      appointment.id,
      at('2026-07-20T06:30:00Z'),
    );

    expect(again.sent).toBe(0);
    expect(box.email.sent.map((message) => message.to)).toEqual([
      'bia@example.com',
    ]);
  });

  it('Dado a oferta vencida, Quando o prazo passa, Então expira e o e-mail vai para o próximo', async () => {
    const ana = await patient(box.patients, 'Ana Paula');
    const bia = await patient(box.patients, 'Bia Costa');
    const caio = await patient(box.patients, 'Caio Dias');
    const appointment = cancelled(ana.id);
    await box.appointments.save(appointment);
    await box.waitlist.save(queued(ana.id, '2026-07-01T00:00:00Z'));
    await box.waitlist.save(queued(bia.id, '2026-07-02T00:00:00Z'));
    await box.waitlist.save(queued(caio.id, '2026-07-03T00:00:00Z'));
    await box.offers.offerCancelled(appointment.id, NOW);

    const early = await box.offers.advance(at('2026-07-20T07:59:00Z'));
    expect(early.sent).toBe(0);
    expect(box.email.sent).toHaveLength(1);

    const passed = await box.offers.advance(at('2026-07-20T08:00:00Z'));
    expect(passed.expired).toBe(1);
    expect(passed.sent).toBe(1);
    expect(box.email.sent.map((message) => message.to)).toEqual([
      'bia@example.com',
      'caio@example.com',
    ]);
    const caioEntry = (await box.waitlist.listWaiting()).find(
      (entry) => entry.patientId === caio.id,
    );
    expect(caioEntry?.openOffer?.expiresAt.toISOString()).toBe(
      '2026-07-20T10:00:00.000Z',
    );
    const biaEntry = (await box.waitlist.listWaiting()).find(
      (entry) => entry.patientId === bia.id,
    );
    expect(biaEntry?.openOffer).toBeNull();
    expect(biaEntry?.wasOffered(appointment.id)).toBe(true);

    await box.offers.advance(at('2026-07-20T08:00:00Z'));
    expect(box.email.sent).toHaveLength(2);
  });

  it('Dado consulta em menos de 2 horas, Quando oferece, Então expira no horário da consulta e não há prazo para o próximo', async () => {
    const ana = await patient(box.patients, 'Ana Paula');
    const bia = await patient(box.patients, 'Bia Costa');
    const start = at('2026-07-20T11:00:00Z');
    const appointment = cancelled(ana.id, start);
    await box.appointments.save(appointment);
    await box.waitlist.save(queued(ana.id, '2026-07-01T00:00:00Z'));
    await box.waitlist.save(queued(bia.id, '2026-07-02T00:00:00Z'));

    await box.offers.offerCancelled(appointment.id, at('2026-07-20T10:00:00Z'));
    const held = (await box.waitlist.listWaiting()).find(
      (entry) => entry.patientId === bia.id,
    );
    expect(held?.openOffer?.expiresAt.toISOString()).toBe(start.toISOString());

    await box.offers.advance(at('2026-07-20T10:59:00Z'));
    expect(box.email.sent).toHaveLength(1);

    const ended = await box.offers.advance(start);
    expect(ended.expired).toBe(1);
    expect(ended.sent).toBe(0);
    expect(box.email.sent).toHaveLength(1);
    expect(
      (await box.waitlist.listWaiting()).every(
        (entry) => entry.openOffer === null,
      ),
    ).toBe(true);
  });

  it('Dada a fila de outra clínica, Quando a vaga é oferecida, Então o e-mail não sai para ela', async () => {
    const other = harness();
    const ana = await patient(box.patients, 'Ana Paula');
    const bruno = await patient(other.patients, 'Bruno Lima');
    const appointment = cancelled('quem-cancelou');
    await box.appointments.save(appointment);
    const anaEntry = queued(ana.id, '2026-07-01T00:00:00Z');
    await box.waitlist.save(anaEntry);
    await other.waitlist.save(queued(bruno.id, '2026-06-01T00:00:00Z'));

    await box.offers.offerCancelled(appointment.id, NOW);
    await other.offers.advance(NOW);

    expect(box.email.sent.map((message) => message.to)).toEqual([
      'ana@example.com',
    ]);
    expect(other.email.sent).toEqual([]);
    expect(await other.waitlist.findById(anaEntry.id)).toBeNull();
    expect((await other.waitlist.listWaiting())[0].patientId).toBe(bruno.id);
    expect((await other.waitlist.listWaiting())[0].openOffer).toBeNull();
  });

  it('Dado consulta que já começou, falta ou id inexistente, Quando oferece, Então não há e-mail', async () => {
    const ana = await patient(box.patients, 'Ana Paula');
    await box.waitlist.save(queued(ana.id, '2026-07-01T00:00:00Z'));
    const started = cancelled(ana.id, NOW);
    await box.appointments.save(started);
    const missed = Appointment.create({
      patientId: ana.id,
      slot: TimeSlot.create(START, END),
      procedure: 'Curativo',
      price: Money.fromCents(15000),
    }).markNoShow();
    await box.appointments.save(missed);

    expect((await box.offers.offerCancelled(started.id, NOW)).sent).toBe(0);
    expect((await box.offers.offerCancelled(missed.id, NOW)).sent).toBe(0);
    expect((await box.offers.offerCancelled('nao-existe', NOW)).sent).toBe(0);
    expect(box.email.sent).toEqual([]);
  });

  it('Dado o horário ocupado de novo, Quando oferece, Então ninguém recebe; a oferta aberta é retirada', async () => {
    const ana = await patient(box.patients, 'Ana Paula');
    const bia = await patient(box.patients, 'Bia Costa');
    const appointment = cancelled(ana.id);
    await box.appointments.save(appointment);
    await box.waitlist.save(queued(ana.id, '2026-07-01T00:00:00Z'));
    await box.waitlist.save(queued(bia.id, '2026-07-02T00:00:00Z'));
    await box.offers.offerCancelled(appointment.id, NOW);
    await box.appointments.save(
      Appointment.create({
        patientId: bia.id,
        slot: TimeSlot.create(START, END),
        procedure: 'Curativo',
        price: Money.fromCents(15000),
      }),
    );

    const counts = await box.offers.offerCancelled(
      appointment.id,
      at('2026-07-20T06:30:00Z'),
    );

    expect(counts.expired).toBe(1);
    expect(counts.sent).toBe(0);
    expect(box.email.sent).toHaveLength(1);
    expect(
      (await box.waitlist.listWaiting()).every(
        (entry) => entry.openOffer === null,
      ),
    ).toBe(true);
  });

  it('Dado horário ocupado antes de oferecer, Quando oferece, Então não há e-mail', async () => {
    const ana = await patient(box.patients, 'Ana Paula');
    const appointment = cancelled(ana.id);
    await box.appointments.save(appointment);
    await box.appointments.save(
      Appointment.create({
        patientId: ana.id,
        slot: TimeSlot.create(START, END),
        procedure: 'Curativo',
        price: Money.fromCents(15000),
      }),
    );
    await box.waitlist.save(queued(ana.id, '2026-07-01T00:00:00Z'));

    expect((await box.offers.offerCancelled(appointment.id, NOW)).sent).toBe(0);
    expect(box.email.sent).toEqual([]);
  });

  it('Dado quem não aceita o dia, o profissional ou já está em outra oferta, Quando oferece, Então o e-mail vai para o próximo que aceita', async () => {
    const ana = await patient(box.patients, 'Ana Paula');
    const bia = await patient(box.patients, 'Bia Costa');
    const caio = await patient(box.patients, 'Caio Dias');
    const appointment = cancelled(ana.id, START, 'prof-2');
    await box.appointments.save(appointment);
    const other = cancelled(bia.id, at('2026-07-21T12:00:00Z'));
    await box.appointments.save(other);
    await box.waitlist.save(queued(ana.id, '2026-07-01T00:00:00Z', 'prof-1'));
    const biaEntry = queued(bia.id, '2026-07-02T00:00:00Z').holdOffer(
      other.id,
      at('2026-07-21T14:00:00Z'),
    );
    await box.waitlist.save(biaEntry);
    await box.waitlist.save(queued(caio.id, '2026-07-03T00:00:00Z'));
    await box.offers.offerCancelled(other.id, NOW);

    await box.offers.offerCancelled(appointment.id, NOW);

    expect(box.email.sent.map((message) => message.to)).toEqual([
      'bia@example.com',
      'caio@example.com',
    ]);
  });

  it('Dado outro paciente na fila de outro profissional, Quando oferece, Então ele não recebe e o próximo que aceita recebe', async () => {
    const ana = await patient(box.patients, 'Ana Paula');
    const bia = await patient(box.patients, 'Bia Costa');
    const caio = await patient(box.patients, 'Caio Dias');
    const appointment = cancelled(ana.id, START, 'prof-2');
    await box.appointments.save(appointment);
    await box.waitlist.save(queued(bia.id, '2026-07-01T00:00:00Z', 'prof-1'));
    await box.waitlist.save(queued(caio.id, '2026-07-02T00:00:00Z', 'prof-2'));

    await box.offers.offerCancelled(appointment.id, NOW);

    expect(box.email.sent.map((message) => message.to)).toEqual([
      'caio@example.com',
    ]);
    const biaEntry = (await box.waitlist.listWaiting()).find(
      (entry) => entry.patientId === bia.id,
    );
    expect(biaEntry?.openOffer).toBeNull();
  });

  it('Dado paciente sem e-mail, inativo, inexistente ou responsável sem e-mail, Quando oferece, Então pula até quem pode receber', async () => {
    const semEmail = await patient(box.patients, 'Sem Email', null);
    const inativo = (
      await patient(box.patients, 'Inativo Pessoa')
    ).deactivate();
    await box.patients.save(inativo);
    const guardian = Guardian.create({
      fullName: 'Vera Sem',
      relationship: 'mae',
      phone: '11988887777',
    });
    await box.guardians.save(guardian);
    const comResponsavelMudo = await patient(
      box.patients,
      'Davi Mudo',
      null,
      guardian.id,
    );
    await box.waitlist.save(queued('paciente-sumido', '2026-06-01T00:00:00Z'));
    await box.waitlist.save(queued(semEmail.id, '2026-06-02T00:00:00Z'));
    await box.waitlist.save(queued(inativo.id, '2026-06-03T00:00:00Z'));
    await box.waitlist.save(
      queued(comResponsavelMudo.id, '2026-06-04T00:00:00Z'),
    );
    const clara = Guardian.create({
      fullName: 'Clara Souza',
      relationship: 'mae',
      phone: '11977776666',
      email: 'clara@example.com',
    });
    await box.guardians.save(clara);
    const davi = await patient(box.patients, 'Davi Souza', null, clara.id);
    await box.waitlist.save(queued(davi.id, '2026-06-05T00:00:00Z'));
    const appointment = cancelled('quem-cancelou');
    await box.appointments.save(appointment);

    await box.offers.offerCancelled(appointment.id, NOW);

    expect(box.email.sent).toHaveLength(1);
    expect(box.email.sent[0].to).toBe('clara@example.com');
    expect(box.email.sent[0].text).toContain('Olá, Clara!');
    expect(box.email.sent[0].text).toContain('para Davi');
  });

  it('Dado responsável que não existe, Quando oferece, Então pula', async () => {
    const davi = await patient(
      box.patients,
      'Davi Souza',
      null,
      'guardiao-sumido',
    );
    const bia = await patient(box.patients, 'Bia Costa');
    await box.waitlist.save(queued(davi.id, '2026-07-01T00:00:00Z'));
    await box.waitlist.save(queued(bia.id, '2026-07-02T00:00:00Z'));
    const appointment = cancelled('quem-cancelou');
    await box.appointments.save(appointment);

    await box.offers.offerCancelled(appointment.id, NOW);

    expect(box.email.sent.map((message) => message.to)).toEqual([
      'bia@example.com',
    ]);
  });

  it('Dado canal desligado, Quando oferece, Então não marca o envio; ao ligar, o e-mail sai uma vez', async () => {
    const ana = await patient(box.patients, 'Ana Paula');
    const appointment = cancelled('quem-cancelou');
    await box.appointments.save(appointment);
    await box.waitlist.save(queued(ana.id, '2026-07-01T00:00:00Z'));
    box.email.enabled = false;

    const skipped = await box.offers.offerCancelled(appointment.id, NOW);
    expect(skipped.skipped).toBe(1);
    expect(box.email.sent).toHaveLength(1);
    expect((await box.waitlist.listWaiting())[0].offerEmailWasSent()).toBe(
      false,
    );

    box.email.enabled = true;
    const sent = await box.offers.offerCancelled(appointment.id, NOW);
    expect(sent.sent).toBe(1);
    expect(box.email.sent).toHaveLength(2);
    expect((await box.waitlist.listWaiting())[0].offerEmailWasSent()).toBe(
      true,
    );
    await box.offers.offerCancelled(appointment.id, NOW);
    expect(box.email.sent).toHaveLength(2);
  });

  it('Dado falha no envio, Quando oferece de novo, Então o e-mail sai uma vez', async () => {
    const ana = await patient(box.patients, 'Ana Paula');
    const appointment = cancelled('quem-cancelou');
    await box.appointments.save(appointment);
    await box.waitlist.save(queued(ana.id, '2026-07-01T00:00:00Z'));
    box.email.fail = true;

    const failed = await box.offers.offerCancelled(appointment.id, NOW);
    expect(failed.failed).toBe(1);
    expect(box.email.sent).toEqual([]);
    expect((await box.waitlist.listWaiting())[0].offerEmailWasSent()).toBe(
      false,
    );

    box.email.fail = false;
    await box.offers.offerCancelled(appointment.id, NOW);
    await box.offers.offerCancelled(appointment.id, NOW);
    expect(box.email.sent).toHaveLength(1);
  });

  it('Dado o paciente sumiu antes do reenvio, Quando oferece de novo, Então não envia', async () => {
    const ana = await patient(box.patients, 'Ana Paula');
    const appointment = cancelled('quem-cancelou');
    await box.appointments.save(appointment);
    await box.waitlist.save(queued(ana.id, '2026-07-01T00:00:00Z'));
    box.email.fail = true;
    await box.offers.offerCancelled(appointment.id, NOW);
    box.email.fail = false;
    box.patients.hidden = ana.id;

    const counts = await box.offers.offerCancelled(appointment.id, NOW);

    expect(counts.sent).toBe(0);
    expect(box.email.sent).toEqual([]);
  });

  it('Dado fila sem ninguém que aceite, Quando oferece ou só avança, Então não envia', async () => {
    const ana = await patient(box.patients, 'Ana Paula');
    const appointment = cancelled(ana.id);
    await box.appointments.save(appointment);
    await box.waitlist.save(
      WaitlistEntry.create(
        {
          patientId: ana.id,
          fromDate: '2026-08-01',
          toDate: '2026-08-10',
          source: 'staff',
        },
        NOW,
      ),
    );

    expect((await box.offers.offerCancelled(appointment.id, NOW)).sent).toBe(0);
    expect((await box.offers.advance(NOW)).sent).toBe(0);
    expect(box.email.sent).toEqual([]);
  });

  it('Dado clínica suspensa, ausente ou ativa, Quando o cancelamento dispara a oferta, Então só a ativa envia', async () => {
    const ana = await patient(box.patients, 'Ana Paula');
    const appointment = cancelled('quem-cancelou');
    await box.appointments.save(appointment);
    await box.waitlist.save(queued(ana.id, '2026-07-01T00:00:00Z'));
    const withClinic = (
      clinic: { name: string; status: 'active' | 'suspended' } | null,
    ) =>
      offerCancelledSlot(
        {
          ...box.services,
          clinics: { findById: async () => clinic },
        },
        'clinic-a',
        appointment.id,
        NOW,
      );

    await withClinic(null);
    await withClinic({ name: 'Parada', status: 'suspended' });
    expect(box.email.sent).toEqual([]);

    await withClinic({ name: 'Clínica Sol', status: 'active' });
    expect(box.email.sent).toHaveLength(1);
    expect(box.email.sent[0].subject).toContain('Clínica Sol');
  });
});

describe('Feature: Passagem da oferta no cron', () => {
  it('Dado clínica suspensa e outra com falha, Quando avança, Então a suspensa nem abre e a falha conta sem derrubar o lote', async () => {
    const seen: string[] = [];
    const empty = harness();
    const result = await new AdvanceWaitlistOffers(
      [
        { id: 'suspensa', name: 'Suspensa', status: 'suspended' },
        { id: 'quebra', name: 'Quebra', status: 'active' },
        { id: 'vazia', name: 'Vazia' },
      ],
      async (id) => {
        seen.push(id);
        if (id === 'quebra') throw new Error('banco');
        return empty.services;
      },
    ).execute(NOW);

    expect(seen).toEqual(['quebra', 'vazia']);
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
  });
});
