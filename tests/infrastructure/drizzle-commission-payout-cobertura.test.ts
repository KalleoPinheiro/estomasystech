import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CommissionRule } from '@/domain/billing/commission';
import {
  CommissionPayout,
  type PayoutItem,
} from '@/domain/billing/commission-payout';
import { Patient } from '@/domain/patient/patient';
import { Professional } from '@/domain/professional/professional';
import { Appointment } from '@/domain/scheduling/appointment';
import { ConflictError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAppointmentRepository } from '@/infrastructure/persistence/drizzle/drizzle-appointment-repository';
import { DrizzleCommissionPayoutRepository } from '@/infrastructure/persistence/drizzle/drizzle-commission-payout-repository';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import { DrizzleProfessionalRepository } from '@/infrastructure/persistence/drizzle/drizzle-professional-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';

describe('Feature: Repasse de comissão persiste a regra vigente e barra duplicidade (#296)', () => {
  let appDb: AppDb;
  let repo: DrizzleCommissionPayoutRepository;
  let professionalId: string;
  let patientId: string;
  let day = 1;

  beforeAll(async () => {
    appDb = drizzle(await createPgliteFromTemplate(), {
      schema,
    }) as unknown as AppDb;
    repo = new DrizzleCommissionPayoutRepository(appDb, CLINIC);
    const professional = Professional.create({ fullName: 'Ana Enfermeira' });
    await new DrizzleProfessionalRepository(appDb, CLINIC).save(professional);
    professionalId = professional.id;
    const patient = Patient.create({
      fullName: 'Maria da Silva',
      phone: '11999990000',
    });
    await new DrizzlePatientRepository(appDb, CLINIC, TEST_CIPHER).save(
      patient,
    );
    patientId = patient.id;
  });

  /** Uma sessão concluída nova, devolvida como item de repasse. */
  const item = async (): Promise<PayoutItem> => {
    day += 1;
    const start = new Date(Date.UTC(2026, 8, day, 9));
    const appointment = Appointment.create({
      patientId,
      slot: TimeSlot.create(start, new Date(start.getTime() + 3600_000)),
      procedure: 'Troca de bolsa',
      price: Money.fromCents(25000),
      professionalId,
    })
      .confirm()
      .complete();
    await new DrizzleAppointmentRepository(appDb, CLINIC, TEST_CIPHER).save(
      appointment,
    );
    return {
      appointmentId: appointment.id,
      kind: 'session',
      procedure: 'Troca de bolsa',
      sessionDate: start,
      baseCents: 25000,
      commissionCents: 5000,
    };
  };

  const payout = async (period: string, rule: CommissionRule | null) =>
    CommissionPayout.create({
      professionalId,
      period,
      paidAt: new Date('2026-10-05T12:00:00Z'),
      paymentMethod: 'pix',
      createdBy: 'admin@clinica.com',
      rule,
      items: [await item()],
    });

  it.each([
    ['percentual', '2026-01', { kind: 'percentage', pct: 20 } as const],
    ['fixa', '2026-02', { kind: 'fixed', centsPerSession: 5000 } as const],
    ['ausente', '2026-03', null],
  ])(
    'Dado repasse com regra %s, Quando gravar e ler de volta, Então a regra do comprovante é preservada',
    async (_nome, period, rule) => {
      const saved = await payout(period, rule);

      await repo.save(saved);

      const read = await repo.findById(saved.id);
      expect(read?.rule).toEqual(rule);
      expect(read?.totalCents).toBe(5000);
    },
  );

  it('Dado mês já fechado para o profissional, Quando fechar o mesmo mês outra vez, Então recusa com conflito', async () => {
    await repo.save(await payout('2026-04', null));

    await expect(repo.save(await payout('2026-04', null))).rejects.toThrow(
      ConflictError,
    );
  });

  it('Dado profissional inexistente, Quando gravar o repasse, Então o erro do banco não é mascarado como conflito', async () => {
    const orphan = CommissionPayout.create({
      professionalId: 'profissional-inexistente',
      period: '2026-05',
      paidAt: new Date('2026-10-05T12:00:00Z'),
      paymentMethod: 'pix',
      createdBy: 'admin@clinica.com',
      rule: null,
      items: [await item()],
    });

    const result = repo.save(orphan);

    await expect(result).rejects.toThrow();
    await expect(result).rejects.not.toBeInstanceOf(ConflictError);
  });

  it('Dado papel de sistema, Quando gravar repasse, Então recusa', async () => {
    const system = new DrizzleCommissionPayoutRepository(appDb, null);

    await expect(system.save(await payout('2026-06', null))).rejects.toThrow(
      'Papel de sistema não pode registrar repasse',
    );
  });
});
