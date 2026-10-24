import { describe, expect, it } from 'vitest';
import {
  ACTOR_ROLE_LABELS,
  formatAuditDetail,
  RESOURCE_LABELS,
} from '@/lib/audit-labels';
import { tissueTypeLabel } from '@/lib/format';

describe('Feature: trilha de auditoria e tecido em português (#470)', () => {
  it('Dado papéis técnicos, Quando rotular, Então aparecem os nomes da interface', () => {
    expect(ACTOR_ROLE_LABELS.company_admin).toBe('Admin de Empresa');
    expect(ACTOR_ROLE_LABELS.super_admin).toBe('Super Admin');
    expect(ACTOR_ROLE_LABELS.system).toBe('Sistema');
  });

  it('Dado recursos de fatura e tema, Quando rotular, Então estão em português', () => {
    expect(RESOURCE_LABELS.invoice).toBe('Fatura');
    expect(RESOURCE_LABELS['clinic-theme']).toBe('Tema da clínica');
  });

  it('Dado código de login ou segundo fator, Quando formatar o detalhe, Então traduz', () => {
    expect(formatAuditDetail('session', 'mfa_required')).toBe(
      'Segundo fator exigido',
    );
    expect(formatAuditDetail('session', 'invalid_credentials')).toBe(
      'Credenciais inválidas',
    );
  });

  it('Dado detalhe livre ou ausente, Quando formatar, Então mantém o texto ou traço', () => {
    expect(formatAuditDetail('patient', 'CPF no recibo')).toBe('CPF no recibo');
    expect(formatAuditDetail('patient', null)).toBe('—');
  });

  it('Dado o JSON da retenção, Quando formatar, Então vira resumo legível sem JSON', () => {
    const detail = JSON.stringify({
      clinicalRecords: 2,
      photos: 1,
      auditEvents: 0,
      accounts: 0,
    });
    expect(formatAuditDetail('retention', detail)).toBe(
      '2 prontuários anonimizados · 1 fotos apagadas',
    );
  });

  it('Dado retenção sem nada alterado ou JSON inválido, Quando formatar, Então avisa ou mantém', () => {
    expect(formatAuditDetail('retention', '{}')).toBe('Nada a anonimizar');
    expect(formatAuditDetail('retention', 'não é json')).toBe('não é json');
  });

  it('Dado tecido, Quando rotular, Então granulação e esfacelo saem em português e texto livre permanece', () => {
    expect(tissueTypeLabel('granulation')).toBe('Granulação');
    expect(tissueTypeLabel('slough')).toBe('Esfacelo');
    expect(tissueTypeLabel('tecido livre')).toBe('tecido livre');
  });
});
