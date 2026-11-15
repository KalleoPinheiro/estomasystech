import { localDateKey } from '@/domain/scheduling/schedule-availability';

/** Janela da lista de feriados e ausências: de hoje a pouco mais de um ano. */
export const CLOSURES_WINDOW_DAYS = 400;

export interface ClosuresWindow {
  from: string;
  to: string;
}

/** Janela no fuso da clínica (ADR-073); servidor e navegador chegam à mesma URL. */
export function closuresWindow(now: Date): ClosuresWindow {
  return {
    from: localDateKey(now),
    to: localDateKey(
      new Date(now.getTime() + CLOSURES_WINDOW_DAYS * 86_400_000),
    ),
  };
}

export const closuresUrl = ({ from, to }: ClosuresWindow): string =>
  `/api/settings/schedule/closures?from=${from}&to=${to}`;
