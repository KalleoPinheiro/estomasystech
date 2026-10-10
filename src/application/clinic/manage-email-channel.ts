import type { EmailGateway } from '@/application/ports/email-gateway';
import {
  ClinicChannel,
  type ClinicChannelRepository,
  type EmailProvider,
} from '@/domain/clinic/clinic-channel';
import { ConflictError } from '@/domain/shared/errors';

export const TEST_EMAIL_SUBJECT = 'VittaFlow — teste do canal de e-mail';
export const NO_CHANNEL_TO_TEST_MESSAGE = 'Configure o canal antes de testar';

const TEST_EMAIL_TEXT = [
  'Este é um e-mail de teste do VittaFlow.',
  '',
  'Se você o recebeu, o canal de e-mail da clínica está funcionando:',
  'lembretes, convites e redefinições de senha saem por ele.',
].join('\n');

export interface SaveEmailChannelInput {
  provider: EmailProvider;
  sender: string;
  /** Vazia ou ausente = mantém a chave gravada (obrigatória no 1º salvamento). */
  apiKey?: string | null;
  by: string;
}

export interface SaveEmailChannelResult {
  channel: ClinicChannel;
  created: boolean;
}

/** Tira do erro do provedor o que não pode ir para `last_error`: destinatário e chave. */
function redactProviderError(
  error: unknown,
  recipient: string,
  apiKey: string,
): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .split(apiKey)
    .join('<chave>')
    .split(recipient)
    .join('<destinatário>');
}

/**
 * Canal de e-mail da clínica do escopo pela tela de Configurações (C3, #266):
 * salvar, testar e remover. Só o `company_admin` chega aqui (família
 * `administrative`); a chave nunca sai deste caso de uso — quem chama vê só
 * `secretLast4`.
 */
export class ManageEmailChannel {
  constructor(
    private readonly channels: ClinicChannelRepository,
    /** Gateway do escopo (C1): o mesmo por onde saem os envios reais. */
    private readonly email: EmailGateway,
    private readonly clinicId: string,
  ) {}

  find(): Promise<ClinicChannel | null> {
    return this.channels.find('email');
  }

  /** Upsert por `(clinic, channel)`: a última escrita vence (Unresolved 2). */
  async save(input: SaveEmailChannelInput): Promise<SaveEmailChannelResult> {
    const current = await this.find();
    const channel = current
      ? current.reconfigure(input)
      : ClinicChannel.configure({
          clinicId: this.clinicId,
          channel: 'email',
          provider: input.provider,
          sender: input.sender,
          apiKey: input.apiKey ?? '',
          by: input.by,
        });
    await this.channels.save(channel);
    return { channel, created: current === null };
  }

  /** Envia o e-mail de teste para `to` e grava o resultado no canal. */
  async test(to: string, now: Date = new Date()): Promise<ClinicChannel> {
    const current = await this.find();
    if (!current) {
      throw new ConflictError(NO_CHANNEL_TO_TEST_MESSAGE);
    }
    let tested: ClinicChannel;
    try {
      await this.email.send({
        to,
        subject: TEST_EMAIL_SUBJECT,
        text: TEST_EMAIL_TEXT,
      });
      tested = current.recordTest({ ok: true }, now);
    } catch (error) {
      tested = current.recordTest(
        { ok: false, error: redactProviderError(error, to, current.apiKey) },
        now,
      );
    }
    await this.channels.save(tested);
    return tested;
  }

  /** Apaga o canal; o próximo envio da clínica não sai. */
  remove(): Promise<string | null> {
    return this.channels.remove('email');
  }
}
