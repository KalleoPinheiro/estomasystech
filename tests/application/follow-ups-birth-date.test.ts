import { describe, expect, it } from 'vitest';
import { CreateFollowUp } from '@/application/followups/create-follow-up';
import { ListFollowUps } from '@/application/followups/list-follow-ups';
import { CreatePatient } from '@/application/patients/create-patient';
import { InMemoryFollowUpRepository } from '@/infrastructure/persistence/in-memory/in-memory-inventory-repositories';
import { InMemoryPatientRepository } from '@/infrastructure/persistence/in-memory/in-memory-patient-repository';

describe('Feature: listas trazem o nascimento para desambiguar homônimos (#429)', () => {
  it('Dado paciente com e sem data de nascimento, Quando listar retornos, Então cada linha traz a data ou nulo', async () => {
    const patients = new InMemoryPatientRepository();
    const followUps = new InMemoryFollowUpRepository();
    const comData = await new CreatePatient(patients).execute({
      fullName: 'Maria Souza Lima',
      email: 'maria@example.com',
      phone: '11999990000',
      birthDate: new Date('1980-03-12T12:00:00Z'),
    });
    const semData = await new CreatePatient(patients).execute({
      fullName: 'Maria Santos Lima',
      email: 'maria2@example.com',
      phone: '11988880000',
    });
    for (const patient of [comData, semData]) {
      await new CreateFollowUp(followUps, patients).execute({
        patientId: patient.id,
        dueDate: new Date('2026-08-01T12:00:00Z'),
        reason: 'Reavaliação',
      });
    }

    const list = await new ListFollowUps(followUps, patients).execute({});

    const byName = Object.fromEntries(
      list.map((row) => [row.patientName, row.patientBirthDate]),
    );
    expect(byName['Maria Souza Lima']).toEqual(
      new Date('1980-03-12T12:00:00Z'),
    );
    expect(byName['Maria Santos Lima']).toBeNull();
  });
});
