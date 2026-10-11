import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';
import { hashConsentText } from './consent-record';

/** "accept": aceite do compartilhamento. "revoke": revogação (append-only, nunca apaga o aceite). */
export type PartnerShareConsentKind = 'accept' | 'revoke';

/** Quem registrou: o paciente pelo portal ou a equipe pela ficha (#292). */
export type PartnerShareConsentActor = 'patient' | 'staff';

export interface PartnerShareConsentState {
  id: string;
  patientId: string;
  /** Parceiro que recebe o compartilhamento: o consentimento é paciente × parceiro. */
  partnerId: string;
  kind: PartnerShareConsentKind;
  /** SHA-256 do texto exato exibido no aceite. Vazio em revogações. */
  textHash: string;
  /** Versão do texto vigente no aceite. Nula em revogações. */
  textVersion: string | null;
  actor: PartnerShareConsentActor;
  ipAddress: string | null;
  recordedAt: Date;
}

export interface PartnerShareConsentStatus {
  /** Consentimento ativo para o texto vigente. */
  active: boolean;
  /** Registro mais recente (aceite ou revogação), ou `null` sem histórico. */
  current: PartnerShareConsent | null;
  /** Aceite mais recente, mesmo que revogado depois (para mostrar data e versão). */
  latestAccept: PartnerShareConsent | null;
}

function requireIds(patientId: string, partnerId: string): void {
  if (!patientId.trim()) {
    throw new ValidationError('Paciente é obrigatório');
  }
  if (!partnerId.trim()) {
    throw new ValidationError('Parceiro é obrigatório');
  }
}

const newestFirst = (a: PartnerShareConsent, b: PartnerShareConsent) =>
  b.recordedAt.getTime() - a.recordedAt.getTime() ||
  // Empate de milissegundo: a revogação vence (desfecho mais restritivo).
  (a.kind === 'revoke' ? -1 : 1);

/**
 * Consentimento específico e revogável do paciente para o parceiro que o
 * indicou ver condições e avaliações no portal do parceiro (#292, decisão de
 * @KalleoPinheiro na #216). Mesmo modelo do TCLE (`ConsentRecord`): registros
 * imutáveis, hash do texto exato e status pelo registro mais recente.
 */
export class PartnerShareConsent {
  private constructor(private readonly state: PartnerShareConsentState) {}

  static accept(input: {
    patientId: string;
    partnerId: string;
    consentText: string;
    textVersion: string;
    ipAddress?: string | null;
  }): PartnerShareConsent {
    requireIds(input.patientId, input.partnerId);
    if (!input.consentText.trim()) {
      throw new ValidationError('Texto do consentimento é obrigatório');
    }
    if (!input.textVersion.trim()) {
      throw new ValidationError('Versão do consentimento é obrigatória');
    }
    return new PartnerShareConsent({
      id: newId(),
      patientId: input.patientId,
      partnerId: input.partnerId,
      kind: 'accept',
      textHash: hashConsentText(input.consentText),
      textVersion: input.textVersion,
      actor: 'patient',
      ipAddress: input.ipAddress?.trim() || null,
      recordedAt: new Date(),
    });
  }

  static revoke(input: {
    patientId: string;
    partnerId: string;
    actor: PartnerShareConsentActor;
    ipAddress?: string | null;
  }): PartnerShareConsent {
    requireIds(input.patientId, input.partnerId);
    return new PartnerShareConsent({
      id: newId(),
      patientId: input.patientId,
      partnerId: input.partnerId,
      kind: 'revoke',
      textHash: '',
      textVersion: null,
      actor: input.actor,
      ipAddress: input.ipAddress?.trim() || null,
      recordedAt: new Date(),
    });
  }

  static restore(state: PartnerShareConsentState): PartnerShareConsent {
    return new PartnerShareConsent({ ...state });
  }

  /**
   * Status do par paciente × parceiro a partir do histórico (qualquer ordem).
   * Registros de outro parceiro são ignorados: trocar o "Indicado por" não
   * leva o consentimento junto. Ativo só se o registro mais recente é um
   * aceite do texto vigente.
   */
  static resolveStatus(
    records: readonly PartnerShareConsent[],
    partnerId: string,
    consentText: string,
  ): PartnerShareConsentStatus {
    const ofPartner = records
      .filter((record) => record.partnerId === partnerId)
      .sort(newestFirst);
    const current = ofPartner[0] ?? null;
    const latestAccept =
      ofPartner.find((record) => record.kind === 'accept') ?? null;
    const active =
      current?.kind === 'accept' &&
      current.textHash === hashConsentText(consentText);
    return { active, current, latestAccept };
  }

  get id(): string {
    return this.state.id;
  }

  get patientId(): string {
    return this.state.patientId;
  }

  get partnerId(): string {
    return this.state.partnerId;
  }

  get kind(): PartnerShareConsentKind {
    return this.state.kind;
  }

  get textHash(): string {
    return this.state.textHash;
  }

  get textVersion(): string | null {
    return this.state.textVersion;
  }

  get actor(): PartnerShareConsentActor {
    return this.state.actor;
  }

  get ipAddress(): string | null {
    return this.state.ipAddress;
  }

  get recordedAt(): Date {
    return this.state.recordedAt;
  }
}

export interface PartnerShareConsentRepository {
  save(record: PartnerShareConsent): Promise<void>;
  /** Histórico do paciente (todos os parceiros), mais recente primeiro. */
  findByPatientId(patientId: string): Promise<PartnerShareConsent[]>;
  /** Histórico de vários pacientes com um parceiro, em lote (portal do parceiro, sem N+1). */
  findByPartnerAndPatientIds(
    partnerId: string,
    patientIds: string[],
  ): Promise<PartnerShareConsent[]>;
}
