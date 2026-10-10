import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';

/** Tipos de canal de comunicação de uma clínica (ADR-011). */
export const CHANNEL_KINDS = ['email'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/** Provedores de e-mail implementados; o próximo entra aqui e na fábrica. */
export const EMAIL_PROVIDERS = ['resend'] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

export type ChannelTestStatus = 'ok' | 'failed';

/** Caracteres finais da chave que a tela pode mostrar; o resto nunca sai. */
const VISIBLE_SECRET_CHARS = 4;

export interface ClinicChannelState {
  id: string;
  clinicId: string;
  channel: ChannelKind;
  provider: EmailProvider;
  sender: string;
  /** Chave em claro — só em memória; o repositório grava cifrada. */
  apiKey: string;
  lastStatus: ChannelTestStatus | null;
  lastStatusAt: Date | null;
  lastError: string | null;
  updatedAt: Date;
  updatedBy: string;
}

export interface ConfigureChannelInput {
  clinicId: string;
  channel: ChannelKind;
  provider: EmailProvider;
  sender: string;
  apiKey: string;
  by: string;
  now?: Date;
}

/**
 * Credencial com que os envios de uma clínica saem (C1, ADR-011). A clínica
 * é dona da conta e do custo do provedor; sem canal, ela não envia.
 */
export class ClinicChannel {
  private constructor(private readonly state: ClinicChannelState) {}

  static configure(input: ConfigureChannelInput): ClinicChannel {
    const sender = input.sender.trim();
    const apiKey = input.apiKey.trim();
    if (!sender) {
      throw new ValidationError('Remetente obrigatório');
    }
    if (apiKey.length <= VISIBLE_SECRET_CHARS) {
      throw new ValidationError('Chave de API inválida');
    }
    return new ClinicChannel({
      id: newId(),
      clinicId: input.clinicId,
      channel: input.channel,
      provider: input.provider,
      sender,
      apiKey,
      lastStatus: null,
      lastStatusAt: null,
      lastError: null,
      updatedAt: input.now ?? new Date(),
      updatedBy: input.by,
    });
  }

  static restore(state: ClinicChannelState): ClinicChannel {
    return new ClinicChannel({ ...state });
  }

  get id(): string {
    return this.state.id;
  }

  get clinicId(): string {
    return this.state.clinicId;
  }

  get channel(): ChannelKind {
    return this.state.channel;
  }

  get provider(): EmailProvider {
    return this.state.provider;
  }

  get sender(): string {
    return this.state.sender;
  }

  get apiKey(): string {
    return this.state.apiKey;
  }

  get secretLast4(): string {
    return this.state.apiKey.slice(-VISIBLE_SECRET_CHARS);
  }

  get lastStatus(): ChannelTestStatus | null {
    return this.state.lastStatus;
  }

  get lastStatusAt(): Date | null {
    return this.state.lastStatusAt;
  }

  get lastError(): string | null {
    return this.state.lastError;
  }

  get updatedAt(): Date {
    return this.state.updatedAt;
  }

  get updatedBy(): string {
    return this.state.updatedBy;
  }
}

/**
 * A chave do canal está gravada mas não decifra (chave de dados trocada sem
 * `DATA_ENCRYPTION_KEY_PREVIOUS`, payload adulterado). A mensagem leva só a
 * clínica — nunca a chave nem o texto cifrado.
 */
export class ChannelSecretUnreadableError extends Error {
  constructor(readonly clinicId: string) {
    super(`Chave do canal da clínica ${clinicId} não decifra`);
    this.name = 'ChannelSecretUnreadableError';
  }
}

/**
 * Leitura e gravação do canal **da clínica do escopo**. O escopo de sistema não
 * tem canal: a implementação recusa, em vez de ler o de uma clínica qualquer.
 */
export interface ClinicChannelRepository {
  find(channel: ChannelKind): Promise<ClinicChannel | null>;
  /** Upsert por `(clinic, channel)`. */
  save(channel: ClinicChannel): Promise<void>;
}
