import { useEffect, useRef, useState } from 'react';
import { DataRights } from '@/app/portal/data-rights';
import { GuardianPortalView } from '@/app/portal/guardian-view';
import { PartnerConsentSection } from '@/app/portal/partner-consent-card';
import { PartnerPortalView } from '@/app/portal/partner-view';
import {
  PatientPortalView,
  type PatientPortalViewData,
} from '@/app/portal/patient-view';
import { MyWaitlist } from '@/app/portal/waitlist';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { apiFetch } from '@/lib/client';
import type {
  DataSubjectRequestDto,
  PartnerShareConsentDto,
  WaitlistEntryDto,
} from '@/lib/dto';
import type { PartnerPortalData } from '@/lib/server/data/portal';
import { portalRouter } from './portal-router';

/**
 * Harness dos testes de tela do portal (#553, ADR-081). A página agora lê no
 * servidor e entrega as leituras como props; estas telas de teste fazem o papel
 * do servidor com o MESMO vocabulário de antes (`fetch` simulado das rotas
 * `/api/portal/*`), e `router.refresh()` refaz a leitura, como a renderização
 * do servidor faz depois de uma gravação. Os cenários e as asserções dos
 * testes não mudam: só quem entrega o dado.
 */
/** Leitura que falha mantém o último valor, como a leitura da mesma URL fazia. */
const tryFetch = <T,>(url: string, previous: T | null): Promise<T | null> =>
  apiFetch<T>(url).catch(() => previous);

/** As mesmas leituras que a página faz no servidor, na mesma condição. */
async function readPatientView(
  last: PatientPortalViewData | null,
): Promise<PatientPortalViewData> {
  const data = await apiFetch<PatientPortalViewData['data']>(
    '/api/portal/patient',
  );
  const consent = await tryFetch<PatientPortalViewData['consent']>(
    '/api/portal/patient/consent',
    last?.consent ?? null,
  );
  const imageConsent = await tryFetch<PatientPortalViewData['imageConsent']>(
    '/api/portal/patient/consent?purpose=image',
    last?.imageConsent ?? null,
  );
  const waitlist =
    (await tryFetch<PatientPortalViewData['waitlist']>(
      '/api/portal/patient/waitlist',
      last?.waitlist ?? null,
    )) ?? [];
  // Responsável de adulto não decide termos nem direitos do titular.
  const canDecide = !data.actingFor || consent?.canSign === true;
  const dataRequests = canDecide
    ? await tryFetch<PatientPortalViewData['dataRequests']>(
        '/api/portal/patient/data-requests',
        last?.dataRequests ?? null,
      )
    : null;
  const partnerConsent = canDecide
    ? await tryFetch<PatientPortalViewData['partnerConsent']>(
        '/api/portal/patient/partner-consent',
        last?.partnerConsent ?? null,
      )
    : null;
  return {
    data,
    consent,
    imageConsent,
    waitlist,
    dataRequests,
    partnerConsent,
  };
}

/** Lê ao montar e a cada `router.refresh()`; falha de uma releitura mantém a tela. */
function useServerRead<T>(read: (last: T | null) => Promise<T>) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ value: T | null; error: string | null }>(
    { value: null, error: null },
  );
  const last = useRef<T | null>(null);
  const readRef = useRef(read);
  readRef.current = read;

  useEffect(() => {
    portalRouter.reload = () => setVersion((v) => v + 1);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refaz a leitura a cada refresh
  useEffect(() => {
    let cancelled = false;
    readRef.current(last.current).then(
      (value) => {
        last.current = value;
        if (!cancelled) setState({ value, error: null });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState((previous) => ({
            value: previous.value,
            error: error instanceof Error ? error.message : 'Erro',
          }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [version]);
  return state;
}

export function PatientPortalHarness({
  onSwitchPatient,
}: {
  onSwitchPatient?: () => void;
}) {
  const [nowMs] = useState(() => Date.now());
  const { value, error } = useServerRead(readPatientView);
  if (!value) {
    return error ? <ErrorAlert message={error} /> : <LoadingIndicator />;
  }
  return (
    <PatientPortalView
      {...value}
      nowMs={nowMs}
      onSwitchPatient={onSwitchPatient}
    />
  );
}

interface GuardianRead {
  represented: {
    patients: { id: string; fullName: string }[];
    selectedPatientId: string | null;
  };
  portal: PatientPortalViewData | null;
}

export function GuardianPortalHarness() {
  const [nowMs] = useState(() => Date.now());
  const { value, error } = useServerRead<GuardianRead>(async (last) => {
    const represented = await apiFetch<GuardianRead['represented']>(
      '/api/portal/guardian/patients',
    );
    const portal = represented.selectedPatientId
      ? await readPatientView(last?.portal ?? null)
      : null;
    return { represented, portal };
  });
  if (!value) {
    return error ? <ErrorAlert message={error} /> : <LoadingIndicator />;
  }
  return (
    <GuardianPortalView
      represented={value.represented}
      portal={value.portal}
      nowMs={nowMs}
    />
  );
}

export function PartnerPortalHarness() {
  const { value, error } = useServerRead(() =>
    apiFetch<PartnerPortalData>('/api/portal/partner'),
  );
  if (!value) {
    return error ? <ErrorAlert message={error} /> : <LoadingIndicator />;
  }
  return <PartnerPortalView data={value} />;
}

/** Direitos do titular: lê os pedidos como a página lê no servidor. */
export function DataRightsHarness({
  asRepresentative = false,
}: {
  asRepresentative?: boolean;
}) {
  const { value } = useServerRead<DataSubjectRequestDto[]>((last) =>
    tryFetch<DataSubjectRequestDto[]>(
      '/api/portal/patient/data-requests',
      last,
    ).then((requests) => requests ?? []),
  );
  return (
    <DataRights requests={value ?? []} asRepresentative={asRepresentative} />
  );
}

/** Consentimento para o parceiro indicador: `null` quando a leitura não traz parceiro. */
export function PartnerConsentHarness({
  asRepresentative = false,
}: {
  asRepresentative?: boolean;
}) {
  const { value } = useServerRead<{ consent: PartnerShareConsentDto | null }>(
    async (last) => ({
      consent: await tryFetch<PartnerShareConsentDto | null>(
        '/api/portal/patient/partner-consent',
        last?.consent ?? null,
      ),
    }),
  );
  if (!value) return null;
  return (
    <PartnerConsentSection
      consent={value.consent}
      asRepresentative={asRepresentative}
    />
  );
}

/** Lista de espera do paciente, lida como a página lê no servidor. */
export function MyWaitlistHarness() {
  const { value } = useServerRead<WaitlistEntryDto[]>((last) =>
    tryFetch<WaitlistEntryDto[]>('/api/portal/patient/waitlist', last).then(
      (entries) => entries ?? [],
    ),
  );
  if (!value) return null;
  return <MyWaitlist entries={value} />;
}
