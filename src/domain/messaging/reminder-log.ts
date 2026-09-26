import { newId } from '../shared/id';
import { zonedDateKey } from '../shared/time-zone';

export const REMINDER_KINDS = ['confirmation', 'recall'] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

/**
 * Por onde o lembrete saiu: e-mail automático do job ou clique da recepção no
 * link `wa.me`. `'whatsapp'` fica reservado ao canal automático da Meta (RM-14).
 */
export const REMINDER_CHANNELS = ['email', 'whatsapp_link'] as const;
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number];

export interface ReminderLogState {
  id: string;
  kind: ReminderKind;
  /** Id da consulta (confirmation) ou do follow-up (recall). */
  referenceId: string;
  channel: ReminderChannel;
  /** Tentativa do recall por e-mail (1–3); sempre 1 nos demais casos. */
  attempt: number;
  /** Dia do envio (YYYY-MM-DD) no fuso `TZ` — chave de idempotência diária. */
  sentOn: string;
  createdAt: Date;
}

/** Dia no fuso da aplicação (#205), não UTC nem o fuso do processo. */
export const dateKey = (date: Date): string => zonedDateKey(date);

export interface ReminderLogOptions {
  channel?: ReminderChannel;
  attempt?: number;
}

/** Registro de lembrete enviado — impede reenvio pelo mesmo canal. */
export class ReminderLog {
  private constructor(private readonly state: ReminderLogState) {}

  static create(
    kind: ReminderKind,
    referenceId: string,
    sentAt: Date = new Date(),
    options: ReminderLogOptions = {},
  ): ReminderLog {
    return new ReminderLog({
      id: newId(),
      kind,
      referenceId,
      channel: options.channel ?? 'email',
      attempt: options.attempt ?? 1,
      sentOn: dateKey(sentAt),
      createdAt: sentAt,
    });
  }

  static restore(state: ReminderLogState): ReminderLog {
    return new ReminderLog({ ...state });
  }

  get id(): string {
    return this.state.id;
  }

  get kind(): ReminderKind {
    return this.state.kind;
  }

  get referenceId(): string {
    return this.state.referenceId;
  }

  get channel(): ReminderChannel {
    return this.state.channel;
  }

  get attempt(): number {
    return this.state.attempt;
  }

  get sentOn(): string {
    return this.state.sentOn;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }
}

export interface ReminderLogRepository {
  save(log: ReminderLog): Promise<void>;
  wasSent(
    kind: ReminderKind,
    referenceId: string,
    channel: ReminderChannel,
    onDay: string,
  ): Promise<boolean>;
  /** Maior tentativa de recall por e-mail já gravada; 0 sem nenhuma. */
  lastRecallAttempt(referenceId: string): Promise<number>;
  /** Horário do primeiro registro do dia por referência (só as que têm registro). */
  firstSentAt(
    kind: ReminderKind,
    channel: ReminderChannel,
    referenceIds: readonly string[],
    onDay: string,
  ): Promise<Map<string, Date>>;
  /** Retornos cujo recall por e-mail já chegou à última tentativa. */
  exhaustedRecalls(referenceIds: readonly string[]): Promise<Set<string>>;
}
