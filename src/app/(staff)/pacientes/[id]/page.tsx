'use client';

import { Alert, AlertDescription, Card, Icon } from '@still-void/ui/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@still-void/ui/react/client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useRef, useState } from 'react';
import { ErrorAlert, LoadingIndicator } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { PatientPhone } from '@/components/patient-phone';
import { StatusBadge } from '@/components/status-badge';
import { classifyRoute, isFamilyAllowedForRole } from '@/lib/auth/route-family';
import type {
  AnamnesisDto,
  CarePlanDto,
  ConditionDto,
  EvolutionNoteDto,
  PatientDto,
  SidebarIdentityDto,
} from '@/lib/dto';
import { formatDate } from '@/lib/format';
import { useStaffAccess, useStaffIdentity } from '@/lib/staff-access';
import { useApiQuery } from '@/lib/use-api-query';
import { AnamnesisSection } from './anamnesis-section';
import { CarePlansSection } from './care-plans-section';
import { ConditionsSection } from './conditions-section';
import { EvolutionsSection } from './evolutions-section';
import { GuardianPanel } from './guardian-panel';
import { PackagesSection } from './packages-section';
import { PartnerConsentPanel } from './partner-consent-panel';

/**
 * `api`: rota de que a aba depende — a aba só aparece para o papel que pode
 * usá-la (#199, mesma matriz da autorização). Atendente não vê as abas
 * clínicas nem dispara as leituras 403.
 */
const TABS = [
  { key: 'anamnese', label: 'Anamnese', api: '/api/patients/_/anamnesis' },
  { key: 'condicoes', label: 'Estomias e feridas', api: '/api/conditions' },
  {
    key: 'evolucoes',
    label: 'Evoluções (SOAP)',
    api: '/api/patients/_/evolutions',
  },
  {
    key: 'planoCuidados',
    label: 'Plano de Cuidados (SAE)',
    api: '/api/care-plans',
  },
  { key: 'pacotes', label: 'Pacotes', api: '/api/patients/_/packages' },
] as const;

type TabKey = (typeof TABS)[number]['key'];
type Tab = (typeof TABS)[number];

const TAB_KEYS = TABS.map((t) => t.key);

/** 404 sem o id cru: a mensagem do servidor traz o UUID, que não ajuda ninguém (#189). */
function patientErrorMessage(error: string, status: number | null): string {
  return status === 404 ? 'Paciente não encontrado.' : error;
}

/** Só a chave válida — qualquer outro valor de `?aba=` cai no padrão "anamnese" (PRONT-04). */
function resolveInitialTab(param: string | null): TabKey {
  return TAB_KEYS.includes(param as TabKey) ? (param as TabKey) : 'anamnese';
}

function tabLabel(
  tab: Tab,
  conditions: ConditionDto[],
  evolutions: EvolutionNoteDto[],
  carePlans: CarePlanDto[],
): string {
  // Contador só de itens ativos pra condições/planos — evolução não tem
  // estado ativo/resolvido, conta o total (PRONT-01).
  const counts: Partial<Record<TabKey, number>> = {
    condicoes: conditions.filter((c) => c.status === 'active').length,
    evolucoes: evolutions.length,
    planoCuidados: carePlans.filter((p) => p.status === 'active').length,
  };
  const count = counts[tab.key] ?? 0;
  return count > 0 ? `${tab.label} (${count})` : tab.label;
}

/**
 * O link de exportação LGPD só aparece para quem a API deixa exportar (#185):
 * mesma matriz de família de rota do servidor. Sem identidade carregada (ou
 * com erro) o link fica escondido; `account: null` é o modo aberto, em que o
 * servidor libera tudo.
 */
function useCanExport(exportPath: string): boolean {
  const { data: identity } =
    useApiQuery<SidebarIdentityDto>('/api/auth/identity');
  if (!identity) {
    return false;
  }
  if (identity.account === null) {
    return true;
  }
  return isFamilyAllowedForRole(
    classifyRoute(exportPath),
    identity.account.role,
  );
}

function PatientHeader({ patient }: { patient: PatientDto }) {
  const exportPath = `/api/patients/${patient.id}/export`;
  const canExport = useCanExport(exportPath);
  return (
    <PageHeader
      leading={
        <Link
          href="/pacientes"
          className="inline-flex items-center gap-1 text-accent-ink text-sm hover:underline"
        >
          <Icon name="chevron-left" /> Pacientes
        </Link>
      }
      title={patient.fullName}
      badge={
        <StatusBadge
          status={patient.active ? 'confirmed' : 'cancelled'}
          label={patient.active ? 'Ativo' : 'Inativo'}
        />
      }
      description={
        <span className="break-words">
          <PatientPhone
            phone={patient.phone}
            needsCorrection={patient.phoneNeedsCorrection}
          />{' '}
          {patient.email ? ` · ${patient.email}` : ''}
          {patient.birthDate ? ` · nasc. ${formatDate(patient.birthDate)}` : ''}
        </span>
      }
      actions={
        <span className="flex flex-wrap gap-x-4 gap-y-1 font-medium text-sm">
          <a
            href={`/documentos/consentimento/${patient.id}`}
            className="text-accent-ink hover:underline"
          >
            Termo de consentimento
          </a>
          {canExport ? (
            <a
              href={exportPath}
              target="_blank"
              rel="noreferrer"
              className="text-ink-3 hover:underline"
              title="Exportação completa dos dados do titular (LGPD art. 18)"
            >
              Exportar dados (LGPD)
            </a>
          ) : null}
        </span>
      }
    />
  );
}

function AllergyBanner({ allergies }: { allergies?: string }) {
  if (!allergies) {
    return null;
  }
  return (
    <Alert
      variant="danger"
      className="mb-6"
      icon={<Icon name="alert-triangle" />}
    >
      <AlertDescription className="font-bold">
        Alergias: {allergies}
      </AlertDescription>
    </Alert>
  );
}

/** Leituras clínicas da ficha, só para quem pode ver cada aba (#199). */
function useClinicalRecord(id: string, can: (api: string) => boolean) {
  const allowed = (key: TabKey) =>
    can(TABS.find((t) => t.key === key)?.api ?? '');
  const anamnesis = useApiQuery<AnamnesisDto | null>(
    allowed('anamnese') ? `/api/patients/${id}/anamnesis` : null,
  );
  const conditions = useApiQuery<ConditionDto[]>(
    allowed('condicoes') ? `/api/patients/${id}/conditions` : null,
  );
  const evolutions = useApiQuery<EvolutionNoteDto[]>(
    allowed('evolucoes') ? `/api/patients/${id}/evolutions` : null,
  );
  const carePlans = useApiQuery<CarePlanDto[]>(
    allowed('planoCuidados') ? `/api/patients/${id}/care-plans` : null,
  );
  return { anamnesis, conditions, evolutions, carePlans };
}

/** Papel sem nenhuma aba (ex.: Atendente): aviso em vez de alerta de erro. */
function NoRecordSections({ loading }: { loading: boolean }) {
  if (loading) return <LoadingIndicator />;
  return (
    <Card className="p-5" data-record-restricted>
      <p className="text-ink-2 text-sm">
        As seções clínicas do prontuário são restritas a profissionais e
        administradores da clínica.
      </p>
    </Card>
  );
}

/**
 * Guarda de troca de aba (issue #66): SOAP em edição ou anamnese alterada
 * pedem confirmação antes de descartar. Extraído em hook próprio para manter
 * a complexidade de `PatientRecordPage` dentro do limite do projeto.
 */
function useDirtyTabGuard(tab: TabKey) {
  const [evolutionsDirty, setEvolutionsDirty] = useState(false);
  const [anamnesisDirty, setAnamnesisDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<TabKey | null>(null);

  const isCurrentTabDirty =
    (tab === 'evolucoes' && evolutionsDirty) ||
    (tab === 'anamnese' && anamnesisDirty);

  const requestTabChange = (
    nextTab: TabKey,
    setTab: (next: TabKey) => void,
  ) => {
    if (nextTab === tab) return;
    if (isCurrentTabDirty) {
      setPendingTab(nextTab);
      return;
    }
    setTab(nextTab);
  };

  const confirmDiscardAndSwitch = (setTab: (next: TabKey) => void) => {
    if (pendingTab) {
      setTab(pendingTab);
    }
    setPendingTab(null);
  };

  return {
    pendingTab,
    setEvolutionsDirty,
    setAnamnesisDirty,
    requestTabChange,
    confirmDiscardAndSwitch,
    cancelPendingTab: () => setPendingTab(null),
  };
}

export default function PatientRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<TabKey>(() =>
    resolveInitialTab(searchParams.get('aba')),
  );
  const setTab = (next: TabKey) => {
    setTabState(next);
    router.replace(`/pacientes/${id}?aba=${next}`, { scroll: false });
  };
  const can = useStaffAccess();
  const identity = useStaffIdentity();
  const visibleTabs = TABS.filter((item) => can(item.api));
  // Aba pedida (URL/clique) se o papel a vê; senão a primeira visível.
  const activeTab: TabKey | undefined = visibleTabs.some((t) => t.key === tab)
    ? tab
    : visibleTabs[0]?.key;
  const tabListRef = useRef<HTMLDivElement>(null);
  // No celular a lista de abas rola na horizontal (#198): a aba ativa sempre
  // entra na área visível, inclusive quando vem de `?aba=` na URL.
  useEffect(() => {
    tabListRef.current
      ?.querySelector<HTMLElement>(`[data-tab-key="${activeTab}"]`)
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeTab]);
  const {
    pendingTab,
    setEvolutionsDirty,
    setAnamnesisDirty,
    requestTabChange,
    confirmDiscardAndSwitch,
    cancelPendingTab,
  } = useDirtyTabGuard(activeTab ?? tab);

  const {
    data: patient,
    error,
    errorStatus,
    refresh: refreshPatient,
  } = useApiQuery<PatientDto>(`/api/patients/${id}`);
  const record = useClinicalRecord(id, can);
  const {
    data: anamnesis,
    error: anamnesisError,
    isLoading: anamnesisLoading,
    refresh: refreshAnamnesis,
  } = record.anamnesis;
  const {
    data: conditions,
    error: conditionsError,
    isLoading: conditionsLoading,
    refresh: refreshConditions,
  } = record.conditions;
  const {
    data: evolutions,
    error: evolutionsError,
    isLoading: evolutionsLoading,
    refresh: refreshEvolutions,
  } = record.evolutions;
  const {
    data: carePlans,
    error: carePlansError,
    isLoading: carePlansLoading,
    refresh: refreshCarePlans,
  } = record.carePlans;

  if (error) {
    return <ErrorAlert message={patientErrorMessage(error, errorStatus)} />;
  }
  if (!patient) return <LoadingIndicator />;

  return (
    <div>
      <PatientHeader patient={patient} />
      <AllergyBanner allergies={anamnesis?.allergies} />
      <GuardianPanel patient={patient} onChanged={refreshPatient} />
      {can('/api/patients/_/partner-consent') && (
        <PartnerConsentPanel patientId={id} />
      )}

      {activeTab === undefined ? (
        <NoRecordSections loading={identity?.loading ?? false} />
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(next) => requestTabChange(next as TabKey, setTab)}
        >
          <TabsList ref={tabListRef} aria-label="Seções do prontuário">
            {visibleTabs.map((item) => (
              <TabsTrigger
                key={item.key}
                value={item.key}
                data-tab-key={item.key}
                // shrink-0 (#198): o gatilho da lib é flex-shrink 1 com
                // nowrap — em 390px os rótulos encolhiam e se sobrepunham em
                // vez de a lista rolar.
                className={
                  item.key === 'pacotes' ? 'ml-auto shrink-0' : 'shrink-0'
                }
              >
                {tabLabel(
                  item,
                  conditions ?? [],
                  evolutions ?? [],
                  carePlans ?? [],
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab}>
            <Card className="p-5">
              <RecordTabPanel
                tab={activeTab}
                patientId={id}
                anamnesis={anamnesis ?? null}
                anamnesisError={anamnesisError}
                anamnesisLoading={anamnesisLoading}
                onAnamnesisDirtyChange={setAnamnesisDirty}
                conditions={conditions ?? []}
                conditionsError={conditionsError}
                conditionsLoading={conditionsLoading}
                evolutions={evolutions ?? []}
                evolutionsError={evolutionsError}
                evolutionsLoading={evolutionsLoading}
                onEvolutionsDirtyChange={setEvolutionsDirty}
                carePlans={carePlans ?? []}
                carePlansError={carePlansError}
                carePlansLoading={carePlansLoading}
                refreshAnamnesis={refreshAnamnesis}
                refreshConditions={refreshConditions}
                refreshEvolutions={refreshEvolutions}
                refreshCarePlans={refreshCarePlans}
              />
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <AlertDialog
        open={pendingTab !== null}
        onOpenChange={(open) => !open && cancelPendingTab()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Há texto não salvo nesta aba. Trocar de aba agora descarta o que
              foi digitado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDiscardAndSwitch(setTab)}>
              Descartar e trocar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface RecordTabPanelProps {
  tab: TabKey;
  patientId: string;
  anamnesis: AnamnesisDto | null;
  anamnesisError: string | null;
  anamnesisLoading: boolean;
  onAnamnesisDirtyChange: (dirty: boolean) => void;
  conditions: ConditionDto[];
  conditionsError: string | null;
  conditionsLoading: boolean;
  evolutions: EvolutionNoteDto[];
  evolutionsError: string | null;
  evolutionsLoading: boolean;
  onEvolutionsDirtyChange: (dirty: boolean) => void;
  carePlans: CarePlanDto[];
  carePlansError: string | null;
  carePlansLoading: boolean;
  refreshAnamnesis: () => void;
  refreshConditions: () => void;
  refreshEvolutions: () => void;
  refreshCarePlans: () => void;
}

function RecordTabPanel({
  tab,
  patientId,
  anamnesis,
  anamnesisError,
  anamnesisLoading,
  onAnamnesisDirtyChange,
  conditions,
  conditionsError,
  conditionsLoading,
  evolutions,
  evolutionsError,
  evolutionsLoading,
  onEvolutionsDirtyChange,
  carePlans,
  carePlansError,
  carePlansLoading,
  refreshAnamnesis,
  refreshConditions,
  refreshEvolutions,
  refreshCarePlans,
}: RecordTabPanelProps) {
  if (tab === 'condicoes') {
    return (
      <ConditionsSection
        patientId={patientId}
        conditions={conditions}
        error={conditionsError}
        isLoading={conditionsLoading}
        onChanged={refreshConditions}
        onRetry={refreshConditions}
      />
    );
  }
  if (tab === 'evolucoes') {
    return (
      <EvolutionsSection
        patientId={patientId}
        evolutions={evolutions}
        error={evolutionsError}
        isLoading={evolutionsLoading}
        onSaved={refreshEvolutions}
        onRetry={refreshEvolutions}
        onDirtyChange={onEvolutionsDirtyChange}
      />
    );
  }
  if (tab === 'pacotes') {
    return <PackagesSection patientId={patientId} />;
  }
  if (tab === 'planoCuidados') {
    return (
      <CarePlansSection
        patientId={patientId}
        conditions={conditions}
        plans={carePlans}
        error={carePlansError}
        isLoading={carePlansLoading}
        onChanged={refreshCarePlans}
        onRetry={refreshCarePlans}
      />
    );
  }
  return (
    <AnamnesisSection
      key={anamnesis ? anamnesis.updatedAt : 'empty'}
      patientId={patientId}
      anamnesis={anamnesis}
      error={anamnesisError}
      isLoading={anamnesisLoading}
      onSaved={refreshAnamnesis}
      onRetry={refreshAnamnesis}
      onDirtyChange={onAnamnesisDirtyChange}
    />
  );
}
