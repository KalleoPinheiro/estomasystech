import { describe, expect, it } from 'vitest';
import { CreateCondition } from '@/application/clinical/create-condition';
import { CreatePatient } from '@/application/patients/create-patient';
import { GetPatientPortalData } from '@/application/portal/get-patient-portal-data';
import { ConditionAssessment } from '@/domain/clinical/condition-assessment';
import { InMemoryAppointmentRepository } from '@/infrastructure/persistence/in-memory/in-memory-appointment-repository';
import {
  InMemoryClinicalConditionRepository,
  InMemoryConditionAssessmentRepository,
} from '@/infrastructure/persistence/in-memory/in-memory-clinical-repositories';
import { InMemoryFollowUpRepository } from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryInvoiceRepository } from '@/infrastructure/persistence/in-memory/in-memory-invoice-repository';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

describe('Feature: Portal do paciente agrupa a evolução por condição (PORT)', () => {
  it('Dado condição com duas avaliações seriadas, Quando carregar o portal, Então ambas aparecem sob a mesma condição', async () => {
    const patients = new InMemoryPatientRepository();
    const conditions = new InMemoryClinicalConditionRepository();
    const assessments = new InMemoryConditionAssessmentRepository();
    const maria = await new CreatePatient(patients).execute({
      fullName: 'Maria da Silva',
      email: 'maria@example.com',
      phone: '11999990000',
    });
    const condition = await new CreateCondition(conditions, patients).execute({
      patientId: maria.id,
      kind: 'wound',
      title: 'Úlcera venosa MID',
      stomaType: null,
      startedAt: null,
      notes: null,
    });
    for (const exudate of ['high', 'low'] as const) {
      await assessments.save(
        ConditionAssessment.create({ conditionId: condition.id, exudate }),
      );
    }

    const data = await new GetPatientPortalData(
      patients,
      new InMemoryAppointmentRepository(),
      conditions,
      assessments,
      new InMemoryInvoiceRepository(),
      new InMemoryFollowUpRepository(),
    ).execute({ patientId: maria.id });

    expect(data.conditions).toHaveLength(1);
    expect(data.conditions[0].assessments).toHaveLength(2);
  });
});
