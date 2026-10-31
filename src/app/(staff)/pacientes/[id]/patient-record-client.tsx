'use client';

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  Icon,
} from '@still-void/ui/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@still-void/ui/react/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LoadingIndicator } from '@/components/feedback';
import { PageHeader } from '@/components/page-header';
import { PatientPhone } from '@/components/patient-phone';
import { StatusBadge } from '@/components/status-badge';
import { scrollFadeMask, useScrollEdges } from '@/components/use-scroll-edges';
import type {
  AnamnesisDto,
  CarePlanDto,
  ConditionDto,
  EvolutionNoteDto,
  PartnerShareConsentDto,
  PatientDto,
  ProfessionalOptionDto,
} from '@/lib/dto';
import { formatCivilDate } from '@/lib/format';
import type { Loaded } from '@/lib/server/data/load-block';
import { useStaffAccess, useStaffIdentity } from '@/lib/staff-access';
import { AnamnesisSection } from './anamnesis-section';
import { CarePlansSection } from './care-plans-section';
import { ConditionsSection } from './conditions-section';
import { EvolutionsSection } from './evolutions-section';
import { GuardianPanel } from './guardian-panel';
import { type PackageDto, PackagesSection } from './packages-section';
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

/** Só a chave válida — qualquer outro valor de `?aba=` cai no padrão "anamnese" (PRONT-04). */
export function resolveInitialTab(param: string | null | undefined): TabKey {
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

const EXPORT_TITLE = 'Exportação completa dos dados do titular (LGPD art. 18)';

/**
 * Ações secundárias da ficha. No celular (< 768px) viram o menu "Mais ações":
 * dois links soltos em linha tinham ~20px de altura e o de exportação parecia
 * desabilitado (#525). No computador seguem como links, com altura de toque
 * para quem usa a tela sensível ao toque.
 */
function PatientHeaderActions({
  consentHref,
  exportHref,
}: {
  consentHref: string;
  /** `null` quando o papel não pode exportar: o item some. */
  exportHref: string | null;
}) {
  // As duas variantes vão no HTML e o CSS escolhe: `useMediaQuery` é falso no servidor, e
  // trocar de variante ao hidratar empurrava o conteúdo (CLS, #552).
  return (
    <>
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline">
              Mais ações <Icon name="chevron-down" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem asChild className="min-h-11">
              <Link href={consentHref}>Termo de consentimento</Link>
            </DropdownMenuItem>
            {exportHref ? (
              <DropdownMenuItem asChild className="min-h-11">
                <a
                  href={exportHref}
                  target="_blank"
                  rel="noreferrer"
                  title={EXPORT_TITLE}
                >
                  Exportar dados (LGPD)
                </a>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <span className="hidden flex-wrap gap-x-4 gap-y-1 font-medium text-sm md:flex">
        <Link href={consentHref} className="text-accent-ink hover:underline">
          Termo de consentimento
        </Link>
        {exportHref ? (
          <a
            href={exportHref}
            target="_blank"
            rel="noreferrer"
            className="text-accent-ink hover:underline"
            title={EXPORT_TITLE}
          >
            Exportar dados (LGPD)
          </a>
        ) : null}
      </span>
    </>
  );
}

function PatientHeader({
  patient,
  canExport,
}: {
  patient: PatientDto;
  /** Decidido no servidor pela matriz de papéis da API (#185). */
  canExport: boolean;
}) {
  const exportPath = `/api/patients/${patient.id}/export`;
  return (
    <PageHeader
      leading={
        <Link
          href="/pacientes"
          className="inline-flex min-h-11 items-center gap-1 text-accent-ink text-sm hover:underline"
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
          {patient.birthDate
            ? ` · nasc. ${formatCivilDate(patient.birthDate)}`
            : ''}
          {patient.cpfMasked ? ` · CPF ${patient.cpfMasked}` : ''}
        </span>
      }
      actions={
        <PatientHeaderActions
          consentHref={`/documentos/consentimento/${patient.id}`}
          exportHref={canExport ? exportPath : null}
        />
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

/** Bloco lido no servidor; `null` quando o papel não usa a aba (nada foi lido). */
type Block<T> = Loaded<T> | null;

export interface PatientRecordClientProps {
  patient: PatientDto;
  /** Exportação LGPD: decidida no servidor pela mesma matriz de papéis da API (#185). */
  canExport: boolean;
  /** `?aba=` da URL; valor inválido cai em «anamnese» (PRONT-04). */
  initialTab?: string;
  anamnesis: Block<AnamnesisDto | null>;
  conditions: Block<ConditionDto[]>;
  evolutions: Block<EvolutionNoteDto[]>;
  carePlans: Block<CarePlanDto[]>;
  packages: Block<PackageDto[]>;
  partnerConsent: Block<PartnerShareConsentDto | null>;
  professionals: Block<ProfessionalOptionDto[]>;
}

/**
 * Ficha do paciente (#552, ADR-080): o servidor lê paciente e prontuário e
 * entrega tudo no HTML; aqui só moram a aba ativa, a guarda de descarte e as
 * mutações. Depois de gravar, `router.refresh()` relê o servidor — o estado
 * local deixou de ser a fonte da verdade.
 */
export function PatientRecordClient(props: PatientRecordClientProps) {
  const { patient, canExport } = props;
  const id = patient.id;
  const router = useRouter();
  const refresh = () => router.refresh();
  const [tab, setTabState] = useState<TabKey>(() =>
    resolveInitialTab(props.initialTab),
  );
  const setTab = (next: TabKey) => {
    setTabState(next);
    // `history` e não `router.replace`: trocar de aba não pode reler o prontuário
    // no servidor (seriam 6 leituras auditadas por clique). O Next sincroniza a URL.
    window.history.replaceState(null, '', `/pacientes/${id}?aba=${next}`);
  };
  const can = useStaffAccess();
  const identity = useStaffIdentity();
  const visibleTabs = TABS.filter((item) => can(item.api));
  // Aba pedida (URL/clique) se o papel a vê; senão a primeira visível.
  const activeTab: TabKey | undefined = visibleTabs.some((t) => t.key === tab)
    ? tab
    : visibleTabs[0]?.key;
  // Estado, não `ref`: os efeitos precisam rodar quando a lista aparece.
  const [tabListEl, setTabListEl] = useState<HTMLDivElement | null>(null);
  // No celular a lista de abas rola na horizontal (#198): a aba ativa sempre
  // entra na área visível, inclusive quando vem de `?aba=` na URL.
  useEffect(() => {
    tabListEl
      ?.querySelector<HTMLElement>(`[data-tab-key="${activeTab}"]`)
      ?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [activeTab, tabListEl]);
  const tabEdges = useScrollEdges(tabListEl);
  const tabMask = scrollFadeMask(tabEdges);
  const {
    pendingTab,
    setEvolutionsDirty,
    setAnamnesisDirty,
    requestTabChange,
    confirmDiscardAndSwitch,
    cancelPendingTab,
  } = useDirtyTabGuard(activeTab ?? tab);

  const anamnesis = props.anamnesis?.data ?? null;
  const conditions = props.conditions?.data ?? [];
  const evolutions = props.evolutions?.data ?? [];
  const carePlans = props.carePlans?.data ?? [];

  return (
    <div>
      <PatientHeader patient={patient} canExport={canExport} />
      <AllergyBanner allergies={anamnesis?.allergies} />
      <GuardianPanel patient={patient} onChanged={refresh} />
      {can('/api/patients/_/partner-consent') && (
        <PartnerConsentPanel
          patientId={id}
          consent={props.partnerConsent?.data ?? null}
          onChanged={refresh}
        />
      )}

      {activeTab === undefined ? (
        <NoRecordSections loading={identity?.loading ?? false} />
      ) : (
        <Tabs
          value={activeTab}
          onValueChange={(next) => requestTabChange(next as TabKey, setTab)}
        >
          <TabsList
            ref={setTabListEl}
            aria-label="Seções do prontuário"
            // Indício de rolagem (#525): borda esmaecida onde há mais abas
            // escondidas e `scroll-snap` para a rolagem parar numa aba inteira.
            className="snap-x snap-proximity"
            style={
              tabMask
                ? { maskImage: tabMask, WebkitMaskImage: tabMask }
                : undefined
            }
          >
            {visibleTabs.map((item) => (
              <TabsTrigger
                key={item.key}
                value={item.key}
                data-tab-key={item.key}
                // shrink-0 (#198): o gatilho da lib é flex-shrink 1 com
                // nowrap — em 390px os rótulos encolhiam e se sobrepunham em
                // vez de a lista rolar.
                className={
                  item.key === 'pacotes'
                    ? 'ml-auto shrink-0 snap-start'
                    : 'shrink-0 snap-start'
                }
              >
                {tabLabel(item, conditions, evolutions, carePlans)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={activeTab}>
            <Card className="p-5">
              <RecordTabPanel
                tab={activeTab}
                patientId={id}
                blocks={props}
                onChanged={refresh}
                onAnamnesisDirtyChange={setAnamnesisDirty}
                onEvolutionsDirtyChange={setEvolutionsDirty}
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
  blocks: PatientRecordClientProps;
  onChanged: () => void;
  onAnamnesisDirtyChange: (dirty: boolean) => void;
  onEvolutionsDirtyChange: (dirty: boolean) => void;
}

function RecordTabPanel({
  tab,
  patientId,
  blocks,
  onChanged,
  onAnamnesisDirtyChange,
  onEvolutionsDirtyChange,
}: RecordTabPanelProps) {
  if (tab === 'condicoes') {
    return (
      <ConditionsSection
        patientId={patientId}
        conditions={blocks.conditions?.data ?? []}
        error={blocks.conditions?.error ?? null}
        isLoading={false}
        onChanged={onChanged}
        onRetry={onChanged}
      />
    );
  }
  if (tab === 'evolucoes') {
    return (
      <EvolutionsSection
        patientId={patientId}
        evolutions={blocks.evolutions?.data ?? []}
        professionals={blocks.professionals?.data ?? []}
        error={blocks.evolutions?.error ?? null}
        isLoading={false}
        onSaved={onChanged}
        onRetry={onChanged}
        onDirtyChange={onEvolutionsDirtyChange}
      />
    );
  }
  if (tab === 'pacotes') {
    return <PackagesSection packages={blocks.packages} />;
  }
  if (tab === 'planoCuidados') {
    return (
      <CarePlansSection
        patientId={patientId}
        conditions={blocks.conditions?.data ?? []}
        plans={blocks.carePlans?.data ?? []}
        error={blocks.carePlans?.error ?? null}
        isLoading={false}
        onChanged={onChanged}
        onRetry={onChanged}
      />
    );
  }
  const anamnesis = blocks.anamnesis?.data ?? null;
  return (
    <AnamnesisSection
      key={anamnesis ? anamnesis.updatedAt : 'empty'}
      patientId={patientId}
      anamnesis={anamnesis}
      error={blocks.anamnesis?.error ?? null}
      isLoading={false}
      onSaved={onChanged}
      onRetry={onChanged}
      onDirtyChange={onAnamnesisDirtyChange}
    />
  );
}
