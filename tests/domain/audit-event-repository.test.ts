import { describe, expect, it } from 'vitest';
import { AuditEvent } from '@/domain/audit/audit-event';
import {
  clinicIdForSave,
  FOREIGN_CLINIC_EVENT,
  PLATFORM_TRAIL_NEEDS_SYSTEM_SCOPE,
} from '@/domain/audit/audit-event-repository';

const eventOf = (clinicId: string | null) =>
  AuditEvent.create({
    clinicId,
    actorRole: 'company_admin',
    actorId: 'staff',
    action: 'create',
    resourceType: 'atestado',
    resourceId: 'apt-1',
  });

describe('Feature: empresa com que o evento de auditoria é gravado (B6)', () => {
  it('Dado escopo de sistema, Quando gravar, Então vale a empresa do evento (inclusive nenhuma)', () => {
    expect(clinicIdForSave(null, eventOf('clinica-a'))).toBe('clinica-a');
    expect(clinicIdForSave(null, eventOf(null))).toBeNull();
  });

  it('Dado escopo de empresa e evento sem empresa, Quando gravar, Então grava na empresa do escopo', () => {
    expect(clinicIdForSave('clinica-a', eventOf(null))).toBe('clinica-a');
  });

  it('Dado escopo de empresa e evento da mesma empresa, Quando gravar, Então grava nela', () => {
    expect(clinicIdForSave('clinica-a', eventOf('clinica-a'))).toBe(
      'clinica-a',
    );
  });

  it('Dado escopo de empresa e evento de outra, Quando gravar, Então recusa com a mensagem de empresa alheia', () => {
    expect(() => clinicIdForSave('clinica-a', eventOf('clinica-b'))).toThrow(
      'Evento de auditoria de outra empresa',
    );
  });

  it('Dadas as mensagens da trilha, Então o texto é o que a tela mostra', () => {
    expect(FOREIGN_CLINIC_EVENT).toBe('Evento de auditoria de outra empresa');
    expect(PLATFORM_TRAIL_NEEDS_SYSTEM_SCOPE).toBe(
      'Trilha de plataforma exige escopo de sistema',
    );
  });
});
