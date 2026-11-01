import { Card, CardContent, Icon } from '@still-void/ui/react';
import Link from 'next/link';
import { ErrorAlert } from '@/components/feedback';
import { loadBlock } from '@/lib/server/data/load-block';
import {
  loadPartnerPortal,
  loadPatientPortalView,
  loadRepresentedPatients,
} from '@/lib/server/data/portal';
import {
  requirePatientPortalPage,
  requireSignedInPage,
} from '@/lib/server/session';
import { GuardianPortalView } from './guardian-view';
import { PartnerPortalView } from './partner-view';
import { PatientPortalView } from './patient-view';

/** Equipe da clínica que abriu o portal: volta para o sistema, sem erro. */
function StaffNotice({ subject }: { subject: string }) {
  return (
    <Card>
      <CardContent className="p-6 text-sm">
        <p className="mb-3">
          Você está logado como <strong>equipe da clínica</strong> ({subject}).
        </p>
        <Link href="/" className="font-medium text-accent-ink hover:underline">
          Ir para o sistema da clínica <Icon name="chevron-right" />
        </Link>
      </CardContent>
    </Card>
  );
}

/**
 * Portal no servidor (#553, ADR-081): o papel vem da sessão, não de
 * `/api/portal/me`, e os dados do paciente, do responsável ou do parceiro
 * chegam no HTML. A carga não chama `/api` e a tela não troca de forma depois
 * de pronta (sem salto de layout). Sessão ausente ou vencida redireciona para
 * `/login?error=session_expired` (PORT-01/PORT-10: mensagem crua de sessão
 * nunca aparece). Cada paciente, responsável ou parceiro lê só os próprios
 * dados: o escopo vem da sessão, nunca da URL.
 */
export default async function PortalPage() {
  const session = await requireSignedInPage({ next: '/portal' });
  // Instante da renderização: separa consultas futuras de passadas.
  const nowMs = Date.now();

  if (session.role === 'partner') {
    const partner = await loadBlock(() => loadPartnerPortal(session));
    return partner.data ? (
      <PartnerPortalView data={partner.data} />
    ) : (
      <ErrorAlert message={partner.error} />
    );
  }

  if (session.role === 'patient') {
    const portalSession = await requirePatientPortalPage();
    const view = await loadBlock(() => loadPatientPortalView(portalSession));
    return view.data ? (
      <PatientPortalView {...view.data} nowMs={nowMs} />
    ) : (
      <ErrorAlert message={view.error} />
    );
  }

  if (session.role === 'guardian') {
    const portalSession = await requirePatientPortalPage();
    const represented = await loadBlock(() =>
      loadRepresentedPatients(portalSession),
    );
    if (!represented.data) return <ErrorAlert message={represented.error} />;
    const chosen = represented.data.selectedPatientId;
    const portal = chosen
      ? await loadBlock(() => loadPatientPortalView(portalSession))
      : null;
    if (portal?.error) return <ErrorAlert message={portal.error} />;
    return (
      <GuardianPortalView
        represented={represented.data}
        portal={portal?.data ?? null}
        nowMs={nowMs}
      />
    );
  }

  return <StaffNotice subject={session.subject} />;
}
