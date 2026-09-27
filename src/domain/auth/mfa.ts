/**
 * Segundo fator do super_admin (ADR-007, bloco B2). A linha do fator só existe
 * depois de confirmada; o cadastro em andamento vive no token pendente.
 */
export interface MfaFactor {
  accountId: string;
  /** Chave base32 em claro — o repositório cifra e decifra (ADR-006). */
  secret: string;
  enrolledAt: Date;
  lastUsedStep: number;
}

export interface RecoveryCodeRecord {
  id: string;
  codeHash: string;
}

export interface CompleteEnrollmentInput {
  accountId: string;
  secret: string;
  step: number;
  recoveryCodeHashes: readonly string[];
  /** `session_version` que o token pendente carregava (compare-and-set). */
  expectedSessionVersion: number;
  now: Date;
}

export interface MfaRepository {
  findFactor(accountId: string): Promise<MfaFactor | null>;
  /**
   * Grava `step` como último passo usado só se ele for maior que o atual, numa
   * única instrução — de dois usos simultâneos do mesmo código, um perde.
   */
  claimStep(accountId: string, step: number): Promise<boolean>;
  /**
   * Numa transação: incrementa `session_version` se ainda for
   * `expectedSessionVersion`, grava (ou troca) o fator e substitui todos os
   * códigos de recuperação. `false` = token já consumido; nada muda.
   */
  completeEnrollment(input: CompleteEnrollmentInput): Promise<boolean>;
  listUnusedRecoveryCodes(accountId: string): Promise<RecoveryCodeRecord[]>;
  /** Marca o código como usado se ainda não estava (atômico). */
  claimRecoveryCode(id: string, usedAt: Date): Promise<boolean>;
}
