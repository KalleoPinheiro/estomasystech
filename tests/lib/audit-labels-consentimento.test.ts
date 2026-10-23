import { describe, expect, it } from 'vitest';
import { formatAuditDetail, RESOURCE_LABELS } from '@/lib/audit-labels';

describe('Feature: auditoria de aceites e acesso do responsável em português (QA staging)', () => {
  it('Dado o aceite do termo de tratamento, Quando formatar o detalhe, Então não mostra «treatment» nem «hash»', () => {
    expect(formatAuditDetail('consent', 'treatment · hash ab12cd34ef56…')).toBe(
      'Termo de tratamento · código do texto ab12cd34ef56…',
    );
  });

  it('Dado o aceite do termo de imagem pelo representante, Quando formatar, Então mantém o complemento', () => {
    expect(
      formatAuditDetail(
        'consent',
        'image · hash ab12cd34ef56… · pelo representante legal',
      ),
    ).toBe(
      'Termo de imagem · código do texto ab12cd34ef56… · pelo representante legal',
    );
  });

  it('Dado detalhe de aceite fora do padrão ou finalidade nova, Quando formatar, Então não quebra', () => {
    expect(formatAuditDetail('consent', 'texto livre')).toBe('texto livre');
    expect(formatAuditDetail('consent', 'outra · hash 1')).toBe(
      'outra · código do texto 1',
    );
  });

  it('Dado o recurso de acesso do responsável, Quando rotular, Então está em português', () => {
    expect(RESOURCE_LABELS['guardian-access']).toBe('Acesso do responsável');
    expect(RESOURCE_LABELS['guardian-access-revocation']).toBe(
      'Encerramento do acesso do responsável',
    );
  });
});
