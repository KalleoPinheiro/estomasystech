import { act } from '@testing-library/react';
import { type ReactElement, useEffect, useState } from 'react';
import type { vi } from 'vitest';
import {
  PatientRecordClient,
  type PatientRecordClientProps,
} from '@/app/(staff)/pacientes/[id]/patient-record-client';
import type { UserRole } from '@/domain/auth/user-role';
import { classifyRoute, isFamilyAllowedForRole } from '@/lib/auth/route-family';
import type { Loaded } from '@/lib/server/data/load-block';
import { canRoleAccess } from '@/lib/staff-pages';
import { renderWithToast } from './render-with-toast';

interface Envelope {
  success: boolean;
  data: unknown;
  error: string | null;
}

async function read<T>(url: string): Promise<Loaded<T>> {
  try {
    const response = await fetch(url);
    const body = (await response.json()) as Envelope;
    return response.ok && body.success !== false
      ? { data: body.data as T, error: null }
      : { data: null, error: body.error ?? 'Erro' };
  } catch (error) {
    return { data: null, error: String(error) };
  }
}

/**
 * Leituras que o servidor faz para a ficha (#552), feitas aqui contra o
 * roteador de `fetch` simulado do teste: a mesma massa que antes alimentava a
 * tela pelo navegador agora vira as props que a página de servidor entrega.
 * Só lê o que o papel usa, como `page.tsx`; as chamadas de montagem saem do
 * registro do `fetch` para o teste contar só o que a tela faz depois.
 */
export async function loadRecordProps(
  id: string,
  role: UserRole,
  initialTab?: string,
  { quiet = true }: { quiet?: boolean } = {},
): Promise<PatientRecordClientProps> {
  const only = <T,>(api: string, url: string) =>
    canRoleAccess(api, role) ? read<T>(url) : Promise.resolve(null);
  const patient = await read<PatientRecordClientProps['patient']>(
    `/api/patients/${id}`,
  );
  if (patient.data === null) throw new Error(patient.error);
  const props: PatientRecordClientProps = {
    patient: patient.data,
    canExport: isFamilyAllowedForRole(
      classifyRoute(`/api/patients/${id}/export`),
      role,
    ),
    initialTab,
    anamnesis: await only(
      '/api/patients/_/anamnesis',
      `/api/patients/${id}/anamnesis`,
    ),
    conditions: await only('/api/conditions', `/api/patients/${id}/conditions`),
    evolutions: await only(
      '/api/patients/_/evolutions',
      `/api/patients/${id}/evolutions`,
    ),
    carePlans: await only('/api/care-plans', `/api/patients/${id}/care-plans`),
    packages: await only(
      '/api/patients/_/packages',
      role === 'profissional'
        ? `/api/patients/${id}/packages`
        : `/api/packages?patientId=${id}`,
    ),
    partnerConsent: await only(
      '/api/patients/_/partner-consent',
      `/api/patients/${id}/partner-consent`,
    ),
    professionals: await only(
      '/api/patients/_/evolutions',
      '/api/options/professionals',
    ),
  };
  if (quiet) (fetch as unknown as ReturnType<typeof vi.fn>).mockClear();
  return props;
}

interface RouterRefresh {
  refresh: ReturnType<typeof vi.fn>;
}

/**
 * `router.refresh()` da tela relê o prontuário no servidor. Aqui a releitura é
 * a mesma de `loadRecordProps` contra o `fetch` simulado (que guarda o estado
 * do que as mutações gravaram), e a tela recebe as props novas.
 */
function RecordHarness({
  initial,
  reload,
  overrides,
  router,
}: {
  initial: PatientRecordClientProps;
  reload: () => Promise<PatientRecordClientProps>;
  overrides?: Partial<PatientRecordClientProps>;
  router?: RouterRefresh;
}) {
  const [props, setProps] = useState(initial);
  useEffect(() => {
    router?.refresh.mockImplementation(() => {
      void reload().then(setProps);
    });
  }, [router, reload]);
  return <PatientRecordClient {...props} {...overrides} />;
}

/** Renderiza a ficha com as props lidas do `fetch` simulado, dentro do provider do layout. */
export async function renderPatientRecord(
  wrap: (children: ReactElement) => ReactElement,
  options: {
    id?: string;
    role?: UserRole;
    initialTab?: string;
    /** Troca partes do que o servidor entregaria (ex.: `canExport: false`). */
    overrides?: Partial<PatientRecordClientProps>;
    /** Liga o `router.refresh` simulado à releitura do servidor. */
    router?: RouterRefresh;
  } = {},
) {
  const id = options.id ?? 'pac-1';
  const role =
    options.role ??
    (await read<{ account: { role: UserRole } }>('/api/auth/identity')).data
      ?.account.role ??
    'company_admin';
  const initial = await loadRecordProps(id, role, options.initialTab);
  const reload = () =>
    loadRecordProps(id, role, options.initialTab, { quiet: false });
  await act(async () => {
    renderWithToast(
      wrap(
        <RecordHarness
          initial={initial}
          reload={reload}
          overrides={options.overrides}
          router={options.router}
        />,
      ),
    );
  });
}
