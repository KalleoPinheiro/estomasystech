import { type Mock, vi } from 'vitest';
import { ClinicChannel } from '@/domain/clinic/clinic-channel';
import { clinicScope } from '@/lib/auth/tenant-scope';

/**
 * Grava o canal de e-mail (Resend) da clínica com a chave dada — o que a C3
 * fará pela tela. Remetente derivado do id, para o teste distinguir clínicas.
 */
export async function saveEmailChannel(
  clinicId: string,
  apiKey: string,
): Promise<void> {
  const { getRepositories } = await import('@/infrastructure/container');
  const { clinicChannels } = await getRepositories(clinicScope(clinicId));
  await clinicChannels.save(
    ClinicChannel.configure({
      clinicId,
      channel: 'email',
      provider: 'resend',
      sender: `Clínica <contato@${clinicId}.test>`,
      apiKey,
      by: 'admin@clinica.test',
    }),
  );
}

/** Apaga o canal de e-mail de todas as clínicas — cada teste começa sem canal. */
export async function clearEmailChannels(): Promise<void> {
  const { getDb } = await import('@/infrastructure/persistence/drizzle/db');
  const schema = await import('@/infrastructure/persistence/drizzle/schema');
  await (await getDb()).delete(schema.clinicChannels);
}

/** Substitui o `fetch` global por um que responde ao provedor com `status`. */
export function stubProviderFetch(status = 200): Mock {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => 'erro do provedor',
    json: async () => ({ message: 'erro do provedor' }),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export interface ProviderCall {
  auth: string;
  to: string;
  text: string;
}

/** Chave, destinatário e corpo de cada POST ao Resend, na ordem. */
export function providerCalls(fetchMock: Mock): ProviderCall[] {
  return fetchMock.mock.calls.map(([, options]) => {
    const init = options as RequestInit;
    const body = JSON.parse(init.body as string) as {
      to: string | string[];
      text: string;
    };
    return {
      auth: (init.headers as Record<string, string>).Authorization,
      to: Array.isArray(body.to) ? body.to.join(',') : body.to,
      text: body.text,
    };
  });
}
