import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  ConsentRequiredError,
  DomainError,
  ForbiddenError,
  InsufficientStockError,
  InvalidMoneyError,
  InvalidStatusTransitionError,
  InvalidTimeSlotError,
  isValidationError,
  NotFoundError,
  ProvisioningDeniedError,
  SchedulingConflictError,
  ValidationError,
} from '@/domain/shared/errors';

const CODIGOS = [
  [ValidationError, 'VALIDATION_ERROR'],
  [InvalidMoneyError, 'INVALID_MONEY'],
  [InvalidTimeSlotError, 'INVALID_TIME_SLOT'],
  [InvalidStatusTransitionError, 'INVALID_STATUS_TRANSITION'],
  [SchedulingConflictError, 'SCHEDULING_CONFLICT'],
  [ConflictError, 'CONFLICT'],
  [ConsentRequiredError, 'CONSENT_REQUIRED'],
  [InsufficientStockError, 'INSUFFICIENT_STOCK'],
  [ForbiddenError, 'FORBIDDEN'],
  [ProvisioningDeniedError, 'PROVISIONING_DENIED'],
] as const;

describe('códigos estáveis dos erros de domínio', () => {
  it.each(CODIGOS)(
    '%o carrega o código %s e o nome da classe',
    (Classe, codigo) => {
      const erro = new Classe('msg');
      expect(erro.code).toBe(codigo);
      expect(erro.name).toBe(Classe.name);
      expect(erro.message).toBe('msg');
      expect(erro).toBeInstanceOf(DomainError);
    },
  );

  it('NotFoundError usa o texto feminino só para Fatura e guarda o id fora da mensagem', () => {
    const fatura = new NotFoundError('Fatura', 'id-1');
    expect(fatura.message).toBe('Fatura não encontrada');
    expect(fatura.code).toBe('NOT_FOUND');
    expect(fatura.entityId).toBe('id-1');
    expect(new NotFoundError('Paciente', 'id-2').message).toBe(
      'Paciente não encontrado(a)',
    );
  });
});

describe('isValidationError', () => {
  it('reconhece a classe e um Error de outra cópia do módulo pelo código', () => {
    expect(isValidationError(new ValidationError('x'))).toBe(true);
    const outraCopia = Object.assign(new Error('x'), {
      code: 'VALIDATION_ERROR',
    });
    expect(isValidationError(outraCopia)).toBe(true);
  });

  it('rejeita outros códigos, não-Error e valores nulos', () => {
    expect(
      isValidationError(Object.assign(new Error('x'), { code: 'OUTRO' })),
    ).toBe(false);
    expect(isValidationError(new Error('x'))).toBe(false);
    expect(isValidationError({ code: 'VALIDATION_ERROR' })).toBe(false);
    expect(isValidationError(null)).toBe(false);
    expect(isValidationError(new ForbiddenError('x'))).toBe(false);
  });
});
