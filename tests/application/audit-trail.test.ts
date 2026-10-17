import { beforeEach, describe, expect, it } from 'vitest';
import { AuditEvent } from '@/domain/audit/audit-event';
import { ValidationError } from '@/domain/shared/errors';
import { InMemoryAuditEventRepository } from '@/infrastructure/persistence/in-memory/in-memory-audit-event-repository';

describe('Feature: Trilha de auditoria de prontuário (LGPD art. 11)', () => {
  let repo: InMemoryAuditEventRepository;

  beforeEach(() => {
    repo = new InMemoryAuditEventRepository();
  });

  const record = (
    overrides: Partial<Parameters<typeof AuditEvent.create>[0]> = {},
  ) =>
    AuditEvent.create({
      clinicId: 'clinic-1',
      actorRole: 'admin',
      actorId: 'staff',
      action: 'read',
      resourceType: 'anamnesis',
      resourceId: 'patient-1',
      patientId: 'patient-1',
      ...overrides,
    });

  it('Dado evento válido, Quando salvar, Então aparece na listagem com metadados', async () => {
    await repo.save(record());

    const events = await repo.findAll();
    expect(events).toHaveLength(1);
    expect(events[0].actorRole).toBe('admin');
    expect(events[0].action).toBe('read');
    expect(events[0].patientId).toBe('patient-1');
  });

  it('Dado eventos de vários pacientes, Quando filtrar por paciente, Então retorna só os dele', async () => {
    await repo.save(record({ patientId: 'patient-1' }));
    await repo.save(
      record({ patientId: 'patient-2', resourceId: 'patient-2' }),
    );

    const events = await repo.findAll({ patientId: 'patient-2' });
    expect(events).toHaveLength(1);
    expect(events[0].patientId).toBe('patient-2');
  });

  it('Dado muitos eventos, Quando paginar, Então respeita limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      await repo.save(record());
    }

    const page = await repo.findAll({}, { limit: 2 });
    expect(page).toHaveLength(2);
  });

  it('Dado ator vazio, Quando criar evento, Então ValidationError', () => {
    expect(() => record({ actorRole: ' ' })).toThrow(ValidationError);
  });

  it('Dado recurso vazio, Quando criar evento, Então ValidationError', () => {
    expect(() => record({ resourceType: '' })).toThrow(ValidationError);
  });
});
