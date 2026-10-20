import { describe, expect, it } from 'vitest';
import {
  formatReceipt,
  mutationTargets,
  REQUIRED_STEPS,
  verifyReceipt,
} from '../../scripts/gate/receipt';

const SHA = 'a'.repeat(40);
const receipt = (steps: string[]) =>
  formatReceipt({
    sha: SHA,
    passed: true,
    e2eTests: 10,
    steps,
    skipped: [],
    minutes: 1,
  });

describe('Mutação por arquivo alterado no gate local (ADR-051)', () => {
  it('Dado um diff, quando filtra, então só regra de domain e application entra', () => {
    expect(
      mutationTargets([
        'src/domain/billing/payout.ts',
        'src/application/portal/book.ts',
        'src/domain/billing/index.ts',
        'src/domain/types.d.ts',
        'src/app/page.tsx',
        'src/infrastructure/db.ts',
        'tests/domain/billing.test.ts',
      ]),
    ).toEqual([
      'src/domain/billing/payout.ts',
      'src/application/portal/book.ts',
    ]);
  });

  it('Dado diff que muda regra, quando o recibo não tem a etapa mutacao, então reprova', () => {
    const r = verifyReceipt(receipt([...REQUIRED_STEPS]), SHA, [
      'src/domain/billing/payout.ts',
    ]);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('mutacao');
  });

  it('Dado diff que muda regra, quando o recibo tem a etapa mutacao, então aceita', () => {
    expect(
      verifyReceipt(receipt([...REQUIRED_STEPS, 'mutacao']), SHA, [
        'src/domain/billing/payout.ts',
      ]).ok,
    ).toBe(true);
  });

  it('Dado diff sem regra, quando o recibo não tem mutacao, então aceita', () => {
    expect(
      verifyReceipt(receipt([...REQUIRED_STEPS]), SHA, ['src/app/page.tsx']).ok,
    ).toBe(true);
    expect(verifyReceipt(receipt([...REQUIRED_STEPS]), SHA).ok).toBe(true);
  });
});
