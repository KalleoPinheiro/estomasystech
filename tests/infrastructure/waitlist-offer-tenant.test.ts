import { eq } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import { WaitlistEntry } from '@/domain/scheduling/waitlist';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAppointmentRepository } from '@/infrastructure/persistence/drizzle/drizzle-appointment-repository';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import { DrizzleWaitlistRepository } from '@/infrastructure/persistence/drizzle/drizzle-waitlist-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC_A = 'legacy-clinic';
const CLINIC_B = 'clinic-offer-b';
const START = new Date('2026-07-20T12:00:00Z');
const DEADLINE = new Date('2026-07-20T08:00:00Z');

describe('Feature: Oferta de vaga isolada por clínica', () => {
  let db: PgliteDatabase<typeof schema>;
  let appDb: AppDb;
  let entryId = '';

  beforeAll(async () => {
    const client = await createPgliteFromTemplate();
    db = drizzle(client, { schema });
    appDb = db as unknown as AppDb;

    await db.insert(schema.clinics).values({
      id: CLINIC_B,
      name: 'Clínica B',
      createdBy: 'test',
      createdAt: new Date(),
    });

    const patients = new DrizzlePatientRepository(appDb, CLINIC_A, TEST_CIPHER);
    const patient = Patient.create({
      fullName: 'Ana Paula',
      email: 'ana-oferta@example.com',
      phone: '11999990000',
    });
    await patients.save(patient);

    const appointments = new DrizzleAppointmentRepository(
      appDb,
      CLINIC_A,
      TEST_CIPHER,
    );
    const appointment = Appointment.create({
      patientId: patient.id,
      slot: TimeSlot.create(START, new Date('2026-07-20T13:00:00Z')),
      procedure: 'Curativo',
      price: Money.fromCents(15000),
    }).cancel();
    await appointments.save(appointment);

    const waitlist = new DrizzleWaitlistRepository(
      appDb,
      CLINIC_A,
      TEST_CIPHER,
    );
    const entry = WaitlistEntry.create(
      {
        patientId: patient.id,
        fromDate: '2026-07-01',
        toDate: '2026-07-31',
        source: 'staff',
      },
      new Date('2026-07-01T00:00:00Z'),
    ).holdOffer(appointment.id, DEADLINE);
    await waitlist.save(entry);
    entryId = entry.id;
  });

  it('Dado oferta gravada na clínica A, Quando a clínica B lê, Então não encontra a entrada', async () => {
    const clinicB = new DrizzleWaitlistRepository(appDb, CLINIC_B, TEST_CIPHER);
    expect(await clinicB.findById(entryId)).toBeNull();
    expect(await clinicB.listWaiting()).toEqual([]);
  });

  it('Dado oferta gravada na clínica A, Quando a própria clínica lê, Então devolve prazo, envio e histórico', async () => {
    const clinicA = new DrizzleWaitlistRepository(appDb, CLINIC_A, TEST_CIPHER);
    const stored = await clinicA.findById(entryId);
    expect(stored?.openOffer?.appointmentId).toBeTruthy();
    expect(stored?.openOffer?.expiresAt.toISOString()).toBe(
      DEADLINE.toISOString(),
    );
    expect(stored?.openOffer?.emailSentAt).toBeNull();
    expect(stored?.offeredAppointmentIds).toHaveLength(1);

    const sentAt = new Date('2026-07-20T06:05:00Z');
    await clinicA.save(stored!.markOfferEmailSent(sentAt));
    const sent = await clinicA.findById(entryId);
    expect(sent?.openOffer?.emailSentAt?.toISOString()).toBe(
      sentAt.toISOString(),
    );
  });

  it('Dado prazo ausente no banco, Quando a clínica lê, Então não há oferta em aberto', async () => {
    await db
      .update(schema.waitlistEntries)
      .set({ offerExpiresAt: null })
      .where(eq(schema.waitlistEntries.id, entryId));

    const clinicA = new DrizzleWaitlistRepository(appDb, CLINIC_A, TEST_CIPHER);
    const stored = await clinicA.findById(entryId);
    expect(stored?.openOffer).toBeNull();
    expect(stored?.wasOffered(stored.offeredAppointmentIds[0] ?? '')).toBe(
      true,
    );
  });
});
