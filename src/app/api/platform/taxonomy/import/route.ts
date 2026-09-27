import type { NextRequest } from 'next/server';
import { importTaxonomyCatalog } from '@/application/taxonomy/import-taxonomy-catalog';
import { getRepositories } from '@/infrastructure/container';
import {
  STOMATHERAPY_DIAGNOSES,
  STOMATHERAPY_INTERVENTIONS,
  STOMATHERAPY_LINKAGES,
  STOMATHERAPY_OUTCOMES,
} from '@/infrastructure/persistence/taxonomy-seed/stomatherapy-seed';
import { handleRequest } from '@/lib/api-response';
import { recordAudit } from '@/lib/audit';
import { requireStaffSession } from '@/lib/auth/require-session';
import { systemScope } from '@/lib/auth/tenant-scope';

/**
 * Bootstrap do catálogo de taxonomias com o subset curado de estomaterapia —
 * idempotente (ver importTaxonomyCatalog). Uma implantação real importa o
 * catálogo licenciado do cliente via `scripts/import-taxonomy.ts <arquivo>`.
 *
 * O catálogo é global (todas as clínicas o leem), então gravá-lo é ato de
 * plataforma: só o super_admin chega aqui (família `platform`, ADR-007).
 */
export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;
  const { session } = guard;

  return handleRequest(async () => {
    const {
      nursingDiagnoses,
      nursingOutcomes,
      nursingInterventions,
      taxonomyLinkages,
      auditEvents,
    } = await getRepositories(systemScope());
    const result = await importTaxonomyCatalog(
      {
        diagnoses: nursingDiagnoses,
        outcomes: nursingOutcomes,
        interventions: nursingInterventions,
        linkages: taxonomyLinkages,
      },
      {
        diagnoses: STOMATHERAPY_DIAGNOSES,
        outcomes: STOMATHERAPY_OUTCOMES,
        interventions: STOMATHERAPY_INTERVENTIONS,
        linkages: STOMATHERAPY_LINKAGES,
      },
    );
    recordAudit(auditEvents, session, {
      action: 'create',
      resourceType: 'taxonomy_catalog',
      resourceId: 'stomatherapy-seed',
    });
    return result;
  });
}
