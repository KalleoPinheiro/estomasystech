'use client';

import { Card } from '@still-void/ui/react';
import { useToast } from '@still-void/ui/react/client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import type { CalendarIntegrationStatusDto } from '@/lib/dto';
import { formatDateTime } from '@/lib/format';
import { useApiQuery } from '@/lib/use-api-query';

/**
 * A conexão da agenda é uma integração, não um login: parte de uma sessão já
 * autenticada por senha e não interfere em nenhum fluxo de autenticação
 * (ADR-004). É um link direto porque a rota responde com um redirect do OAuth,
 * que o navegador precisa seguir na própria janela.
 */
// Allowlist de mensagens de erro do redirect do OAuth (mesmo padrão de
// LOGIN_ERROR_MESSAGES em src/app/login/page.tsx): nunca renderiza o valor
// bruto de `?reason=` — texto arbitrário da URL é vetor de phishing por texto
// refletido, mesmo com o React escapando.
const CALENDAR_ERROR_MESSAGES: Record<string, string> = {
  nao_configurado:
    'Integração com Google Agenda não está configurada no momento.',
  fluxo_invalido:
    'Não foi possível concluir a conexão — o fluxo expirou ou é inválido. Tente novamente.',
  sem_credencial:
    'O Google não devolveu credencial de longa duração — revogue o acesso do EstomaSysTech na sua conta Google e conecte de novo.',
  falha_conexao: 'Falha ao conectar o Google Agenda. Tente novamente.',
};
const GENERIC_CALENDAR_ERROR =
  'Não foi possível conectar o Google Agenda. Tente novamente.';

/**
 * Status real da conexão (issue #124) — antes disso a única forma de saber
 * se funcionou era consultar `google_accounts` direto no banco. O toast de
 * sucesso/erro do redirect do OAuth dispara uma única vez por combinação de
 * `calendar`/`reason` (evita repetir a cada re-render).
 */
export function CalendarIntegrationSection() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const { data, error, isLoading } = useApiQuery<CalendarIntegrationStatusDto>(
    '/api/settings/calendar-integration',
  );
  const calendarParam = searchParams.get('calendar');
  const reasonParam = searchParams.get('reason');
  const notifiedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!calendarParam) return;
    const key = `${calendarParam}:${reasonParam ?? ''}`;
    if (notifiedKey.current === key) return;
    notifiedKey.current = key;

    if (calendarParam === 'conectado') {
      toast({
        description: 'Google Agenda conectado com sucesso',
        variant: 'success',
      });
    } else if (calendarParam === 'erro') {
      toast({
        description: reasonParam
          ? (CALENDAR_ERROR_MESSAGES[reasonParam] ?? GENERIC_CALENDAR_ERROR)
          : GENERIC_CALENDAR_ERROR,
        variant: 'danger',
      });
    }
  }, [calendarParam, reasonParam, toast]);

  return (
    <Card as="section" className="p-5">
      <h2 className="font-semibold text-lg">Google Agenda</h2>
      <p className="mt-1 mb-4 text-ink-3 text-sm">
        Conecte a agenda do Google da clínica para sincronizar os agendamentos.
        A conexão é independente do login — sua sessão continua a mesma.
      </p>
      {error && <ErrorAlert message={error} />}
      {!error && isLoading && <LoadingIndicator />}
      {!error && !isLoading && data && (
        <p className="mb-4 text-ink-2 text-sm">
          {data.connected && data.email && data.connectedAt
            ? `Conectado como ${data.email} em ${formatDateTime(data.connectedAt)}.`
            : 'Nenhuma conta conectada.'}
        </p>
      )}
      <a
        href="/api/integrations/google-calendar"
        className="text-accent-ink text-sm hover:underline"
      >
        {data?.connected
          ? 'Reconectar Google Agenda'
          : 'Conectar Google Agenda'}
      </a>
    </Card>
  );
}
