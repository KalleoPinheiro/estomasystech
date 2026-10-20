import { drizzle } from 'drizzle-orm/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { CarePlan } from '@/domain/clinical/care-plan';
import { FollowUp } from '@/domain/followup/follow-up';
import { StockMovement } from '@/domain/inventory/stock-movement';
import { Supply } from '@/domain/inventory/supply';
import { Patient } from '@/domain/patient/patient';
import { Appointment } from '@/domain/scheduling/appointment';
import { Money } from '@/domain/shared/money';
import { TimeSlot } from '@/domain/shared/time-slot';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import { DrizzleAppointmentRepository } from '@/infrastructure/persistence/drizzle/drizzle-appointment-repository';
import {
  DrizzleCarePlanInterventionRepository,
  DrizzleCarePlanOutcomeRepository,
  DrizzleCarePlanRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-care-plan-repositories';
import {
  DrizzleFollowUpRepository,
  DrizzleStockMovementRepository,
  DrizzleSupplyRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-inventory-repositories';
import { DrizzlePatientRepository } from '@/infrastructure/persistence/drizzle/drizzle-patient-repository';
import * as schema from '@/infrastructure/persistence/drizzle/schema';
import { TEST_CIPHER } from '../support/cipher';
import { createPgliteFromTemplate } from '../support/pglite-template';

const CLINIC = 'legacy-clinic';

describe('Feature: Estoque, retornos e plano de cuidados em Postgres nas consultas por filtro', () => {
  let appDb: AppDb;
  let patient: Patient;

  beforeAll(async () => {
    appDb = drizzle(await createPgliteFromTemplate(), {
      schema,
    }) as unknown as AppDb;
    patient = Patient.create({
      fullName: 'Maria da Silva',
      phone: '11999990000',
    });
    await new DrizzlePatientRepository(appDb, CLINIC, TEST_CIPHER).save(
      patient,
    );
  });

  it('Dado saída de insumo vinculada a uma consulta, Quando buscar movimentações da consulta, Então traz só as dela', async () => {
    const supplies = new DrizzleSupplyRepository(appDb, CLINIC);
    const movements = new DrizzleStockMovementRepository(appDb, CLINIC);
    const supply = Supply.create({
      name: 'Bolsa colostomia',
      unit: 'un',
      minQty: 1,
      priceCents: 3500,
    });
    await supplies.save(supply);
    const appointment = Appointment.create({
      patientId: patient.id,
      slot: TimeSlot.create(
        new Date('2026-10-20T09:00:00Z'),
        new Date('2026-10-20T10:00:00Z'),
      ),
      procedure: 'Troca de bolsa',
      price: Money.fromCents(25000),
    });
    await new DrizzleAppointmentRepository(appDb, CLINIC, TEST_CIPHER).save(
      appointment,
    );
    const saida = StockMovement.create({
      supplyId: supply.id,
      type: 'out',
      quantity: 1,
      reason: 'Uso no atendimento',
      appointmentId: appointment.id,
      unitPriceCents: 3500,
    });
    await movements.save(saida);

    const found = await movements.findByAppointmentId(appointment.id);

    expect(found.map((m) => m.id)).toEqual([saida.id]);
    expect(await movements.findByAppointmentId('outra-consulta')).toEqual([]);
  });

  it('Dado retornos em estados e datas distintos, Quando filtrar por status, paciente e vencimento, Então cada filtro restringe o resultado', async () => {
    const followUps = new DrizzleFollowUpRepository(appDb, CLINIC);
    const cedo = FollowUp.create({
      patientId: patient.id,
      dueDate: new Date('2026-11-01T12:00:00Z'),
      reason: 'Reavaliar lesão',
    });
    const tarde = FollowUp.create({
      patientId: patient.id,
      dueDate: new Date('2026-12-01T12:00:00Z'),
      reason: 'Trocar bolsa',
    });
    const cancelado = FollowUp.create({
      patientId: patient.id,
      dueDate: new Date('2026-11-15T12:00:00Z'),
      reason: 'Sem necessidade',
    }).cancel();
    for (const f of [cedo, tarde, cancelado]) await followUps.save(f);

    const todos = await followUps.findAll();
    const pendentes = await followUps.findAll({ status: 'pending' });
    const doPaciente = await followUps.findAll({ patientId: patient.id });
    const outroPaciente = await followUps.findAll({ patientId: 'ninguem' });
    const vencidos = await followUps.findAll({
      dueBefore: new Date('2026-11-10T00:00:00Z'),
    });
    const lembrar = await followUps.findPendingDueBefore(
      new Date('2026-12-31T00:00:00Z'),
    );

    expect(todos.map((f) => f.id)).toEqual([cedo.id, cancelado.id, tarde.id]);
    expect(pendentes.map((f) => f.id)).toEqual([cedo.id, tarde.id]);
    expect(doPaciente).toHaveLength(3);
    expect(outroPaciente).toEqual([]);
    expect(vencidos.map((f) => f.id)).toEqual([cedo.id]);
    expect(lembrar.map((f) => f.id)).toEqual([cedo.id, tarde.id]);
    expect((await followUps.findById(cedo.id))?.reason).toBe('Reavaliar lesão');
    expect(await followUps.findById('inexistente')).toBeNull();
  });

  it('Dado plano de cuidados salvo, Quando buscar por id, Então volta o plano; ids inexistentes devolvem nulo', async () => {
    const plans = new DrizzleCarePlanRepository(appDb, CLINIC);
    const plan = CarePlan.create({ patientId: patient.id });
    await plans.save(plan);
    expect((await plans.findById(plan.id))?.patientId).toBe(patient.id);

    expect(
      await new DrizzleCarePlanRepository(appDb, CLINIC).findById('x'),
    ).toBeNull();
    expect(
      await new DrizzleCarePlanOutcomeRepository(appDb, CLINIC).findById('x'),
    ).toBeNull();
    expect(
      await new DrizzleCarePlanInterventionRepository(appDb, CLINIC).findById(
        'x',
      ),
    ).toBeNull();
  });
});
