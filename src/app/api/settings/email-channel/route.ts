import type { NextRequest } from 'next/server';
import { handleRequest } from '@/lib/api-response';
import { recordAuditNow } from '@/lib/audit';
import { toEmailChannelDto } from '@/lib/dto';
import { emailChannelInputSchema } from '@/lib/email-channel-schema';
import { channelContext, requireChannelAdmin } from './guard';

/** Canal de e-mail da clínica da sessão — `{ channel: null }` sem canal (C3). */
export async function GET(request: NextRequest) {
  const guard = requireChannelAdmin(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { manage } = await channelContext(guard.session);
    const channel = await manage.find();
    return { channel: channel ? toEmailChannelDto(channel) : null };
  });
}

/**
 * Salva o canal (upsert). `apiKey` vazia mantém a chave gravada; preenchida,
 * substitui e zera o último teste. A chave não é validada aqui: o teste é
 * explícito (design, Decisions: Teste do canal).
 */
export async function PUT(request: NextRequest) {
  const guard = requireChannelAdmin(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = emailChannelInputSchema.parse(await request.json());
    const { manage, services } = await channelContext(guard.session);
    const { channel, created } = await manage.save({
      ...body,
      by: guard.session?.subject ?? 'anonymous',
    });
    // Nunca a chave na trilha: só o id do canal.
    await recordAuditNow(services.auditEvents, guard.session, {
      action: created ? 'create' : 'update',
      resourceType: 'clinic_channel',
      resourceId: channel.id,
    });
    return { channel: toEmailChannelDto(channel) };
  });
}

/** Remove o canal: a clínica deixa de enviar e-mails a partir do próximo envio. */
export async function DELETE(request: NextRequest) {
  const guard = requireChannelAdmin(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const { manage, services } = await channelContext(guard.session);
    const removedId = await manage.remove();
    if (removedId) {
      await recordAuditNow(services.auditEvents, guard.session, {
        action: 'delete',
        resourceType: 'clinic_channel',
        resourceId: removedId,
      });
    }
    return { removed: true };
  });
}
