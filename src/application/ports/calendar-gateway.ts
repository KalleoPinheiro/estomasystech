export interface CalendarEventInput {
  title: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
}

export interface CalendarGateway {
  /** Cria evento e retorna o id externo, ou null se indisponível/falhou. */
  createEvent(input: CalendarEventInput): Promise<string | null>;
  updateEvent(eventId: string, input: CalendarEventInput): Promise<void>;
  deleteEvent(eventId: string): Promise<void>;
  /**
   * Apaga o evento e **propaga a falha** (diferente de `deleteEvent`, que a
   * engole): quem precisa de certeza de que o evento sumiu — a retenção (#311)
   * — só limpa o id depois. Evento já inexistente não é falha.
   */
  purgeEvent(eventId: string): Promise<void>;
}

export class NullCalendarGateway implements CalendarGateway {
  async createEvent(): Promise<string | null> {
    return null;
  }

  async updateEvent(): Promise<void> {}

  async deleteEvent(): Promise<void> {}

  async purgeEvent(): Promise<void> {}
}

/**
 * Gateway montado só no primeiro uso: resolver o real exige ler a credencial
 * OAuth no banco, e a maioria dos requests nunca toca a agenda. A resolução é
 * memorizada; se falhar, a próxima chamada tenta de novo.
 */
export class LazyCalendarGateway implements CalendarGateway {
  private pending: Promise<CalendarGateway> | null = null;

  constructor(private readonly load: () => Promise<CalendarGateway>) {}

  resolve(): Promise<CalendarGateway> {
    this.pending ??= this.load().catch((error: unknown) => {
      this.pending = null;
      throw error;
    });
    return this.pending;
  }

  async createEvent(input: CalendarEventInput): Promise<string | null> {
    return (await this.resolve()).createEvent(input);
  }

  async updateEvent(eventId: string, input: CalendarEventInput): Promise<void> {
    return (await this.resolve()).updateEvent(eventId, input);
  }

  async deleteEvent(eventId: string): Promise<void> {
    return (await this.resolve()).deleteEvent(eventId);
  }

  async purgeEvent(eventId: string): Promise<void> {
    return (await this.resolve()).purgeEvent(eventId);
  }
}

/** O gateway concreto por trás de um preguiçoso (ou o próprio, se não for). */
export function resolveCalendarGateway(
  gateway: CalendarGateway,
): Promise<CalendarGateway> {
  return gateway instanceof LazyCalendarGateway
    ? gateway.resolve()
    : Promise.resolve(gateway);
}
