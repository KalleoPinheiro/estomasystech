import { vi } from 'vitest';

const RealDate = Date;

/**
 * Desloca o `Date` para que "agora" seja `iso` e deixa o relógio andar em tempo
 * real a partir dali. Cenários com datas absolutas não apodrecem — o portal só
 * agenda até 60 dias à frente (#213) — e a ordem dos registros (aceite ×
 * revogação) segue distinguível por timestamp, o que um relógio congelado
 * (`vi.useFakeTimers`) não garante. Só `Date` muda: timers e I/O seguem reais.
 */
export const pinClock = (iso: string): void => {
  const offset = new RealDate(iso).getTime() - RealDate.now();

  class ShiftedDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(RealDate.now() + offset);
      } else {
        super(...(args as [number]));
      }
    }

    static override now(): number {
      return RealDate.now() + offset;
    }
  }

  vi.stubGlobal('Date', ShiftedDate);
};

export const unpinClock = (): void => {
  vi.unstubAllGlobals();
};
