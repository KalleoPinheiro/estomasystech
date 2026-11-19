import {
  InvalidStatusTransitionError,
  ValidationError,
} from '../shared/errors';
import { newId } from '../shared/id';
import type { SlotOffer } from './waitlist-offer';

/** `expired`: o período desejado terminou sem vaga (job de retenção, #311). */
export const WAITLIST_STATUSES = [
  'waiting',
  'scheduled',
  'removed',
  'expired',
] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

/** Quem colocou o paciente na fila: a recepção ou o próprio paciente (portal). */
export type WaitlistSource = 'staff' | 'patient';

export interface WaitlistEntryProps {
  patientId: string;
  /** Procedimento desejado (opcional — texto livre em `notes` cobre o resto). */
  procedureId?: string | null;
  /** Profissional preferido; nulo = qualquer um. */
  professionalId?: string | null;
  /** Janela de datas aceitas pelo paciente, AAAA-MM-DD inclusivas. */
  fromDate: string;
  toDate: string;
  notes?: string | null;
  source: WaitlistSource;
}

export interface WaitlistEntryState extends WaitlistEntryProps {
  id: string;
  status: WaitlistStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  /** Oferta em aberto; nulo quando a entrada não segura vaga nenhuma. */
  offer: SlotOffer | null;
  /** Consultas já oferecidas a esta entrada, a atual inclusive. */
  offeredAppointmentIds: readonly string[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WINDOW_DAYS = 180;
const MAX_NOTES_LENGTH = 500;
const DAY_MS = 86_400_000;

const isRealDate = (value: string): boolean => {
  if (!DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
};

/**
 * Paciente aguardando vaga. A fila é por ordem de chegada; quando um horário
 * vaga, a recepção vê quem aceita aquele dia e oferece a vaga.
 */
export class WaitlistEntry {
  private constructor(private readonly state: WaitlistEntryState) {}

  static create(props: WaitlistEntryProps, now = new Date()): WaitlistEntry {
    if (props.patientId.trim().length === 0) {
      throw new ValidationError('Paciente é obrigatório');
    }
    if (!isRealDate(props.fromDate) || !isRealDate(props.toDate)) {
      throw new ValidationError('Período desejado deve estar em AAAA-MM-DD');
    }
    if (props.toDate < props.fromDate) {
      throw new ValidationError('O período desejado termina antes de começar');
    }
    const days =
      (Date.parse(`${props.toDate}T00:00:00Z`) -
        Date.parse(`${props.fromDate}T00:00:00Z`)) /
        DAY_MS +
      1;
    if (days > MAX_WINDOW_DAYS) {
      throw new ValidationError(
        `O período desejado pode ter no máximo ${MAX_WINDOW_DAYS} dias`,
      );
    }
    const notes = props.notes?.trim() || null;
    if (notes && notes.length > MAX_NOTES_LENGTH) {
      throw new ValidationError(
        `Observação deve ter até ${MAX_NOTES_LENGTH} caracteres`,
      );
    }
    return new WaitlistEntry({
      ...props,
      procedureId: props.procedureId ?? null,
      professionalId: props.professionalId ?? null,
      notes,
      id: newId(),
      status: 'waiting',
      createdAt: now,
      resolvedAt: null,
      offer: null,
      offeredAppointmentIds: [],
    });
  }

  static restore(state: WaitlistEntryState): WaitlistEntry {
    return new WaitlistEntry({ ...state });
  }

  private resolve(status: WaitlistStatus, at: Date): WaitlistEntry {
    if (this.state.status !== 'waiting') {
      throw new InvalidStatusTransitionError(
        'Esta entrada já saiu da lista de espera',
      );
    }
    return new WaitlistEntry({ ...this.state, status, resolvedAt: at });
  }

  /** Vaga oferecida e consulta marcada. */
  markScheduled(at = new Date()): WaitlistEntry {
    return this.resolve('scheduled', at);
  }

  /** Desistência, vaga resolvida por fora ou período vencido. */
  remove(at = new Date()): WaitlistEntry {
    return this.resolve('removed', at);
  }

  /**
   * Segura a vaga desta consulta até `expiresAt`. Uma entrada só segura uma
   * oferta por vez, e a mesma consulta não é oferecida de novo.
   */
  holdOffer(appointmentId: string, expiresAt: Date): WaitlistEntry {
    if (this.state.status !== 'waiting') {
      throw new InvalidStatusTransitionError(
        'Esta entrada já saiu da lista de espera',
      );
    }
    if (this.state.offer) {
      throw new ValidationError('Esta entrada já tem uma oferta em aberto');
    }
    if (this.wasOffered(appointmentId)) {
      throw new ValidationError('Esta vaga já foi oferecida a esta entrada');
    }
    return new WaitlistEntry({
      ...this.state,
      offer: { appointmentId, expiresAt, emailSentAt: null },
      offeredAppointmentIds: [
        ...this.state.offeredAppointmentIds,
        appointmentId,
      ],
    });
  }

  /** O e-mail desta oferta saiu. Repetir não muda o horário do primeiro envio. */
  markOfferEmailSent(at: Date): WaitlistEntry {
    const offer = this.state.offer;
    if (!offer) {
      throw new ValidationError('Não há oferta em aberto');
    }
    if (offer.emailSentAt) return this;
    return new WaitlistEntry({
      ...this.state,
      offer: { ...offer, emailSentAt: at },
    });
  }

  /** O prazo acabou: solta a vaga e a entrada pode receber outra. */
  expireOffer(now: Date): WaitlistEntry {
    const offer = this.state.offer;
    if (!offer) {
      throw new ValidationError('Não há oferta em aberto');
    }
    if (offer.expiresAt.getTime() > now.getTime()) {
      throw new ValidationError('A oferta ainda vale');
    }
    return new WaitlistEntry({ ...this.state, offer: null });
  }

  /**
   * Solta a vaga porque o horário não pode mais ser oferecido (já ocupado de
   * novo, ou a consulta começou). O histórico de ofertas fica.
   */
  withdrawOffer(): WaitlistEntry {
    if (!this.state.offer) {
      throw new ValidationError('Não há oferta em aberto');
    }
    return new WaitlistEntry({ ...this.state, offer: null });
  }

  wasOffered(appointmentId: string): boolean {
    return this.state.offeredAppointmentIds.includes(appointmentId);
  }

  /** A oferta em aberto ainda vale depois de `now`. Sem oferta, não. */
  offerExpiresAfter(now: Date): boolean {
    if (!this.state.offer) return false;
    return this.state.offer.expiresAt.getTime() > now.getTime();
  }

  offerEmailWasSent(): boolean {
    return this.state.offer?.emailSentAt != null;
  }

  offerExpiresAt(): Date {
    if (!this.state.offer) {
      throw new ValidationError('Não há oferta em aberto');
    }
    return this.state.offer.expiresAt;
  }

  /** Aceita um horário vago neste dia com este profissional? */
  accepts(day: string, professionalId: string | null): boolean {
    return (
      this.state.status === 'waiting' &&
      this.state.fromDate <= day &&
      day <= this.state.toDate &&
      (this.state.professionalId === null ||
        professionalId === null ||
        this.state.professionalId === professionalId)
    );
  }

  get id(): string {
    return this.state.id;
  }
  get patientId(): string {
    return this.state.patientId;
  }
  get procedureId(): string | null {
    return this.state.procedureId ?? null;
  }
  get professionalId(): string | null {
    return this.state.professionalId ?? null;
  }
  get fromDate(): string {
    return this.state.fromDate;
  }
  get toDate(): string {
    return this.state.toDate;
  }
  get notes(): string | null {
    return this.state.notes ?? null;
  }
  get source(): WaitlistSource {
    return this.state.source;
  }
  get status(): WaitlistStatus {
    return this.state.status;
  }
  get createdAt(): Date {
    return this.state.createdAt;
  }
  get resolvedAt(): Date | null {
    return this.state.resolvedAt;
  }
  get openOffer(): SlotOffer | null {
    const offer = this.state.offer;
    if (!offer) return null;
    return {
      appointmentId: offer.appointmentId,
      expiresAt: new Date(offer.expiresAt),
      emailSentAt: offer.emailSentAt ? new Date(offer.emailSentAt) : null,
    };
  }
  get offeredAppointmentIds(): readonly string[] {
    return this.state.offeredAppointmentIds;
  }
}

export interface WaitlistRepository {
  save(entry: WaitlistEntry): Promise<void>;
  findById(id: string): Promise<WaitlistEntry | null>;
  /** Fila ativa (status `waiting`), por ordem de chegada. */
  listWaiting(): Promise<WaitlistEntry[]>;
  findByPatient(patientId: string): Promise<WaitlistEntry[]>;
}
