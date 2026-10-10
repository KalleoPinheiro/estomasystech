import { and, eq } from 'drizzle-orm';
import {
  type ChannelKind,
  ChannelSecretUnreadableError,
  type ChannelTestStatus,
  ClinicChannel,
  type ClinicChannelRepository,
  type EmailProvider,
} from '@/domain/clinic/clinic-channel';
import type { FieldCipher } from '@/lib/data-cipher';
import type { AppDb } from './db';
import { clinicChannels } from './schema';

/**
 * Canal da clínica do escopo, com a chave cifrada pela chave de dados
 * (ADR-006). Com `clinicId` nulo (escopo de sistema) recusa: `withTenant` sem
 * clínica não filtraria nada e devolveria a chave de outra empresa.
 */
export class DrizzleClinicChannelRepository implements ClinicChannelRepository {
  constructor(
    private readonly db: AppDb,
    private readonly clinicId: string | null,
    private readonly cipher: FieldCipher,
  ) {}

  async find(channel: ChannelKind): Promise<ClinicChannel | null> {
    const clinicId = this.requireClinic();
    const rows = await this.db
      .select()
      .from(clinicChannels)
      .where(
        and(
          eq(clinicChannels.clinicId, clinicId),
          eq(clinicChannels.channel, channel),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) {
      return null;
    }
    return ClinicChannel.restore({
      id: row.id,
      clinicId: row.clinicId,
      channel: row.channel as ChannelKind,
      provider: row.provider as EmailProvider,
      sender: row.sender,
      apiKey: this.decryptSecret(clinicId, row.encryptedSecret),
      lastStatus: row.lastStatus as ChannelTestStatus | null,
      lastStatusAt: row.lastStatusAt,
      lastError: row.lastError,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    });
  }

  async save(channel: ClinicChannel): Promise<void> {
    const clinicId = this.requireClinic();
    if (channel.clinicId !== clinicId) {
      throw new Error('Canal de outra clínica fora do escopo');
    }
    const values = {
      provider: channel.provider,
      sender: channel.sender,
      encryptedSecret: this.cipher.encrypt(channel.apiKey),
      secretLast4: channel.secretLast4,
      lastStatus: channel.lastStatus,
      lastStatusAt: channel.lastStatusAt,
      lastError: channel.lastError,
      updatedAt: channel.updatedAt,
      updatedBy: channel.updatedBy,
    };
    await this.db
      .insert(clinicChannels)
      .values({
        id: channel.id,
        clinicId,
        channel: channel.channel,
        ...values,
      })
      .onConflictDoUpdate({
        target: [clinicChannels.clinicId, clinicChannels.channel],
        set: values,
      });
  }

  private decryptSecret(clinicId: string, encrypted: string): string {
    try {
      return this.cipher.decrypt(encrypted);
    } catch {
      // O erro da cifra não sobe: a mensagem dele não deve chegar ao log.
      throw new ChannelSecretUnreadableError(clinicId);
    }
  }

  private requireClinic(): string {
    if (this.clinicId === null) {
      throw new Error('Canal de comunicação exige escopo de clínica');
    }
    return this.clinicId;
  }
}
