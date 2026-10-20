import { describe, expect, it } from 'vitest';
import { CarePlan } from '@/domain/clinical/care-plan';
import { CarePlanDiagnosis } from '@/domain/clinical/care-plan-diagnosis';
import { CarePlanIntervention } from '@/domain/clinical/care-plan-intervention';
import { CarePlanOutcome } from '@/domain/clinical/care-plan-outcome';
import { InterventionRecord } from '@/domain/clinical/intervention-record';
import { OutcomeEvaluation } from '@/domain/clinical/outcome-evaluation';
import { FollowUp } from '@/domain/followup/follow-up';
import { StockMovement } from '@/domain/inventory/stock-movement';
import { Supply } from '@/domain/inventory/supply';
import { SupplyBatch } from '@/domain/inventory/supply-batch';
import type { AppDb } from '@/infrastructure/persistence/drizzle/db';
import {
  DrizzleCarePlanDiagnosisRepository,
  DrizzleCarePlanInterventionRepository,
  DrizzleCarePlanOutcomeRepository,
  DrizzleCarePlanRepository,
  DrizzleInterventionRecordRepository,
  DrizzleOutcomeEvaluationRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-care-plan-repositories';
import {
  DrizzleFollowUpRepository,
  DrizzleStockMovementRepository,
  DrizzleSupplyBatchRepository,
  DrizzleSupplyRepository,
} from '@/infrastructure/persistence/drizzle/drizzle-inventory-repositories';
import { TEST_CIPHER } from '../support/cipher';

// Papel de sistema (clinicId nulo) lê entre empresas, mas nunca grava.
// A recusa acontece antes de qualquer acesso ao banco.
const semBanco = {} as AppDb;

describe('Feature: Papel de sistema não grava plano de cuidados nem estoque (ADR-001)', () => {
  it('Dado papel de sistema, Quando salvar qualquer parte do plano de cuidados (SAE), Então recusa', async () => {
    const cases: [() => Promise<void>, RegExp][] = [
      [
        () =>
          new DrizzleCarePlanRepository(semBanco, null).save(
            CarePlan.create({ patientId: 'p1' }),
          ),
        /plano de cuidado/,
      ],
      [
        () =>
          new DrizzleCarePlanDiagnosisRepository(
            semBanco,
            null,
            TEST_CIPHER,
          ).save(
            CarePlanDiagnosis.create({
              carePlanId: 'cp1',
              diagnosisCode: '00046',
              type: 'real',
              relatedFactors: 'pressão',
              definingCharacteristics: 'ferida',
            }),
          ),
        /diagnóstico de plano/,
      ],
      [
        () =>
          new DrizzleCarePlanOutcomeRepository(semBanco, null).save(
            CarePlanOutcome.create({
              carePlanId: 'cp1',
              outcomeCode: '1101',
              baselineScore: 2,
              targetScore: 4,
            }),
          ),
        /resultado de plano/,
      ],
      [
        () =>
          new DrizzleCarePlanInterventionRepository(semBanco, null).save(
            CarePlanIntervention.create({
              carePlanId: 'cp1',
              interventionCode: '3660',
              frequency: 'a cada troca',
              priority: 'alta',
            }),
          ),
        /intervenção de plano/,
      ],
      [
        () =>
          new DrizzleOutcomeEvaluationRepository(
            semBanco,
            null,
            TEST_CIPHER,
          ).save(OutcomeEvaluation.create({ outcomeId: 'o1', score: 3 })),
        /avaliação de desfecho/,
      ],
      [
        () =>
          new DrizzleInterventionRecordRepository(
            semBanco,
            null,
            TEST_CIPHER,
          ).save(InterventionRecord.create({ interventionId: 'i1' })),
        /registro de intervenção/,
      ],
    ];

    for (const [attempt, message] of cases) {
      await expect(attempt()).rejects.toThrow(message);
    }
  });

  it('Dado papel de sistema, Quando salvar insumo, movimentação, lote, retorno ou ajustar estoque, Então recusa', async () => {
    const supply = Supply.create({
      name: 'Bolsa',
      unit: 'un',
      minQty: 1,
      priceCents: 3500,
    });

    await expect(
      new DrizzleSupplyRepository(semBanco, null).save(supply),
    ).rejects.toThrow('Papel de sistema');
    await expect(
      new DrizzleSupplyRepository(semBanco, null).adjustStock(supply.id, 1),
    ).rejects.toThrow('Papel de sistema');
    await expect(
      new DrizzleStockMovementRepository(semBanco, null).save(
        StockMovement.create({
          supplyId: supply.id,
          type: 'in',
          quantity: 1,
          reason: 'Compra',
        }),
      ),
    ).rejects.toThrow('Papel de sistema');
    await expect(
      new DrizzleSupplyBatchRepository(semBanco, null).save(
        SupplyBatch.create({ supplyId: supply.id, quantity: 1 }),
      ),
    ).rejects.toThrow('Papel de sistema');
    await expect(
      new DrizzleFollowUpRepository(semBanco, null).save(
        FollowUp.create({
          patientId: 'p1',
          dueDate: new Date('2026-11-01T12:00:00Z'),
          reason: 'Reavaliar lesão',
        }),
      ),
    ).rejects.toThrow('Papel de sistema');
  });
});
