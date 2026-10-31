import { notFound } from 'next/navigation';
import { ErrorAlert } from '@/components/feedback';
import { NotFoundError } from '@/domain/shared/errors';
import { describeFailure } from '@/lib/api-response';
import { classifyRoute, isFamilyAllowedForRole } from '@/lib/auth/route-family';
import { loadBlock } from '@/lib/server/data/load-block';
import {
  getPatientAnamnesis,
  getPatientPartnerConsent,
  getPatientRecord,
  listPatientCarePlans,
  listPatientConditions,
  listPatientEvolutions,
  listPatientPackageBalances,
  listPatientPackagesWithPrice,
} from '@/lib/server/data/patient-record';
import { listProfessionalOptions } from '@/lib/server/data/professionals';
import { requireStaffPageFor } from '@/lib/server/session';
import { canRoleAccess } from '@/lib/staff-pages';
import type { PackageDto } from './packages-section';
import { PatientRecordClient } from './patient-record-client';

/**
 * Ficha do paciente no servidor (#552, ADR-080): paciente, anamnese,
 * condições, evoluções, planos, pacotes, consentimento do parceiro e os nomes
 * dos autores chegam no HTML, sem chamada `/api` na carga. Cada leitura roda
 * só para o papel que usa a aba (#199, mesma matriz da API) e falha sozinha:
 * um bloco com erro vira alerta com «Tentar novamente» na própria aba. O
 * Profissional sem vínculo recebe 404 (R4) e a leitura segue auditada.
 */
export default async function PatientRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aba?: string | string[] }>;
}) {
  const session = await requireStaffPageFor('/pacientes');
  const [{ id }, { aba }] = await Promise.all([params, searchParams]);
  const allowed = (api: string) => canRoleAccess(api, session.role);
  const onlyIf = <T,>(api: string, load: () => Promise<T>) =>
    allowed(api) ? loadBlock(load) : Promise.resolve(null);

  const patientRead = getPatientRecord(session, id).then(
    (patient) => ({ patient }),
    (error: unknown) => ({ error }),
  );
  const [
    patientResult,
    anamnesis,
    conditions,
    evolutions,
    carePlans,
    packages,
    partnerConsent,
    professionals,
  ] = await Promise.all([
    patientRead,
    onlyIf('/api/patients/_/anamnesis', () => getPatientAnamnesis(session, id)),
    onlyIf('/api/conditions', () => listPatientConditions(session, id)),
    onlyIf('/api/patients/_/evolutions', () =>
      listPatientEvolutions(session, id),
    ),
    onlyIf('/api/care-plans', () => listPatientCarePlans(session, id)),
    onlyIf('/api/patients/_/packages', () =>
      session.role === 'profissional'
        ? listPatientPackageBalances(session, id)
        : (listPatientPackagesWithPrice(session, id) as Promise<PackageDto[]>),
    ),
    onlyIf('/api/patients/_/partner-consent', () =>
      getPatientPartnerConsent(session, id),
    ),
    onlyIf('/api/patients/_/evolutions', () =>
      listProfessionalOptions(session),
    ),
  ]);

  if ('error' in patientResult) {
    // Sem o id cru na tela: o 404 do servidor traz o UUID, que não ajuda ninguém (#189).
    if (patientResult.error instanceof NotFoundError) notFound();
    return (
      <ErrorAlert message={describeFailure(patientResult.error).message} />
    );
  }

  return (
    <PatientRecordClient
      patient={patientResult.patient}
      canExport={isFamilyAllowedForRole(
        classifyRoute(`/api/patients/${id}/export`),
        session.role,
      )}
      initialTab={Array.isArray(aba) ? aba[0] : aba}
      anamnesis={anamnesis}
      conditions={conditions}
      evolutions={evolutions}
      carePlans={carePlans}
      packages={packages}
      partnerConsent={partnerConsent}
      professionals={professionals}
    />
  );
}
