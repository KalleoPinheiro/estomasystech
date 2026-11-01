import { act, fireEvent, screen } from '@testing-library/react';
import {
  type ReactNode,
  Suspense,
  startTransition,
  use,
  useEffect,
  useState,
} from 'react';
import { vi } from 'vitest';
import type { UserRole } from '@/domain/auth/user-role';
import type { AppointmentStatus } from '@/domain/scheduling/appointment';
import {
  DEFAULT_SCHEDULE_CONFIG,
  type ScheduleConfig,
} from '@/domain/scheduling/schedule-config';
import { ValidationError } from '@/domain/shared/errors';
import type { ActionResult } from '@/lib/action-result';
import type {
  AppointmentDto,
  ProfessionalOptionDto,
  ScheduleClosureDto,
  WaitlistEntryDto,
} from '@/lib/dto';
import { renderWithToast } from './render-with-toast';
import { resolveServerTree, suspenseFallbacks } from './server-page';

/**
 * Dublê do servidor da agenda (#551). A página agora lê no servidor, então os
 * testes trocam o `fetch('/api/...')` de leitura por estas funções e simulam a
 * ida e volta ao servidor: cada `router.push/replace/refresh` da tela refaz a
 * página (`await AgendaPage(...)`) com a URL nova e a tela cliente recebe o
 * resultado dentro de uma transição, como no Next (o conteúdo anterior fica no
 * lugar e `isPending` vale até a resposta chegar). Gravações seguem por `fetch`.
 */

export const DEFAULT_COUNTS: Record<AppointmentStatus, number> = {
  scheduled: 0,
  confirmed: 0,
  completed: 0,
  cancelled: 0,
  no_show: 0,
};

export const DEFAULT_TEST_SCHEDULE_CONFIG: ScheduleConfig = {
  ...DEFAULT_SCHEDULE_CONFIG,
  weekdays: [1, 2, 3, 4, 5],
  startHour: 8,
  endHour: 18,
  minGapMinutes: 15,
};

interface ListArgs {
  from: Date;
  to: Date;
  professionalId?: string;
  statuses?: readonly AppointmentStatus[];
}

export interface AgendaState {
  role: UserRole;
  /** Fixo, ou calculado a partir do que a página pediu (período, status). */
  appointments: AppointmentDto[] | ((args: ListArgs) => AppointmentDto[]);
  counts: Record<AppointmentStatus, number>;
  professionals: ProfessionalOptionDto[];
  scheduleConfig: ScheduleConfig;
  closures: ScheduleClosureDto[];
  waitlist: WaitlistEntryDto[];
  /** Mensagem do erro de cada leitura (a que está preenchida falha). */
  fail: {
    appointments?: string;
    counts?: string;
    professionals?: string;
    schedule?: string;
    closures?: string;
    waitlist?: string;
  };
}

const initialState = (): AgendaState => ({
  role: 'company_admin',
  appointments: [],
  counts: { ...DEFAULT_COUNTS },
  professionals: [],
  scheduleConfig: DEFAULT_TEST_SCHEDULE_CONFIG,
  closures: [],
  waitlist: [],
  fail: {},
});

/** Roteador simulado: a tela chama estes métodos, o hospedeiro refaz a página. */
interface FakeRouter {
  push: (url: string) => void;
  replace: (url: string) => void;
  refresh: () => void;
}

/** Ponte entre o roteador simulado (estável) e o hospedeiro React. */
const control = { url: '/agenda', go: (_url: string) => {} };

export const agenda = {
  state: initialState(),
  /** Chamadas de leitura da camada de dados, para os testes conferirem o que a página pediu. */
  requireStaffPage: vi.fn(),
  listAppointmentsFor: vi.fn(),
  countAppointmentsFor: vi.fn(),
  listProfessionalOptions: vi.fn(),
  loadScheduleConfig: vi.fn(),
  listClosuresFor: vi.fn(),
  listWaitlistFor: vi.fn(),
  /** URLs visitadas pela tela (`push` e `replace`), em ordem. */
  pushed: [] as string[],
  replaced: [] as string[],
  refreshed: 0,
  router: {
    push: (url) => {
      agenda.pushed.push(url);
      control.go(url);
    },
    replace: (url) => {
      agenda.replaced.push(url);
      control.go(url);
    },
    refresh: () => {
      agenda.refreshed += 1;
      control.go(control.url);
    },
  } as FakeRouter,
};

const failure = (message: string) => async () => {
  throw new ValidationError(message);
};

/** Zera o estado e religa os dublês; chame no `beforeEach` do arquivo de teste. */
export function resetAgenda(overrides: Partial<AgendaState> = {}) {
  agenda.state = { ...initialState(), ...overrides };
  agenda.pushed = [];
  agenda.replaced = [];
  agenda.refreshed = 0;
  const read =
    <T,>(key: keyof AgendaState['fail'], value: () => T) =>
    async () => {
      const message = agenda.state.fail[key];
      if (message) {
        return failure(message)();
      }
      return value();
    };
  agenda.requireStaffPage.mockReset().mockImplementation(async () => ({
    role: agenda.state.role,
    subject: 'admin@clinica.com',
  }));
  agenda.listAppointmentsFor
    .mockReset()
    .mockImplementation(async (_session: unknown, args: ListArgs) =>
      read('appointments', () => {
        const { appointments } = agenda.state;
        return typeof appointments === 'function'
          ? appointments(args)
          : appointments;
      })(),
    );
  agenda.countAppointmentsFor
    .mockReset()
    .mockImplementation(read('counts', () => agenda.state.counts));
  agenda.listProfessionalOptions
    .mockReset()
    .mockImplementation(
      read('professionals', () => agenda.state.professionals),
    );
  agenda.loadScheduleConfig.mockReset().mockImplementation(
    read('schedule', () => ({
      config: agenda.state.scheduleConfig,
      isDefault: false,
    })),
  );
  agenda.listClosuresFor
    .mockReset()
    .mockImplementation(read('closures', () => agenda.state.closures));
  agenda.listWaitlistFor
    .mockReset()
    .mockImplementation(read('waitlist', () => agenda.state.waitlist));
}

/**
 * As gravações da agenda são Server Actions (`agenda-actions.ts`). Nos testes de
 * página elas viram a chamada REST equivalente (`fetch`), então os testes seguem
 * afirmando o que a clínica pediu (rota, ação e corpo) sem importar o servidor;
 * a Server Action real, com sessão, transação e auditoria, é provada em
 * `tests/app/agenda-actions.test.ts` e `tests/integracao/`. Como a ação real, a
 * atualização da tela vem junto (`router.refresh()` simulado).
 */
async function viaApi<T>(
  url: string,
  method: 'POST' | 'PATCH',
  body: unknown,
): Promise<ActionResult<T>> {
  try {
    const { apiFetch } = await import('@/lib/client');
    const data = await apiFetch<T>(url, {
      method,
      body: JSON.stringify(body),
    });
    agenda.router.refresh();
    return { success: true, data, error: null };
  } catch (error) {
    return { success: false, data: null, error: (error as Error).message };
  }
}

const patch = (action: string) => (input: { id: string }) => {
  const { id, ...rest } = input;
  return viaApi(`/api/appointments/${id}`, 'PATCH', { action, ...rest });
};

export const legacyActions = {
  scheduleAppointment: (input: unknown) =>
    viaApi('/api/appointments', 'POST', input),
  scheduleRecurring: (input: unknown) =>
    viaApi('/api/appointments/recurring', 'POST', input),
  rescheduleAppointment: patch('reschedule'),
  confirmAppointment: patch('confirm'),
  completeAppointment: patch('complete'),
  cancelAppointment: patch('cancel'),
  markAppointmentNoShow: patch('no_show'),
};

type SearchParams = Record<string, string | string[] | undefined>;

function toSearchParams(url: string): SearchParams {
  const params: SearchParams = {};
  new URL(url, 'http://localhost').searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

/** O que o servidor entregaria para `url`: a página resolvida, com o dado já lido. */
async function loadPage(url: string): Promise<ReactNode> {
  const { default: AgendaPage } = await import('@/app/(staff)/agenda/page');
  return resolveServerTree(
    await AgendaPage({ searchParams: Promise.resolve(toSearchParams(url)) }),
  );
}

function View({ page }: { page: Promise<ReactNode> }) {
  return use(page);
}

function Host({ initialUrl }: { initialUrl: string }) {
  const [current, setCurrent] = useState(() => loadPage(initialUrl));
  useEffect(() => {
    control.url = initialUrl;
    control.go = (url) => {
      control.url = url;
      startTransition(() => setCurrent(loadPage(url)));
    };
  }, [initialUrl]);
  return (
    <Suspense fallback={null}>
      <View page={current} />
    </Suspense>
  );
}

/**
 * Renderiza a agenda como o Next a serviria em `url`. Devolve `url()` com o
 * endereço atual (muda a cada navegação da tela).
 */
export async function renderAgenda(url = '/agenda') {
  control.url = url;
  let result!: ReturnType<typeof renderWithToast>;
  await act(async () => {
    result = renderWithToast(<Host initialUrl={url} />);
  });
  // Primeiro flush: a tela só existe depois da primeira leitura.
  // Por texto, não por papel: o modal do recall abre por cima e esconde o título.
  await screen.findByText('Agenda', { selector: 'h1' });
  return { ...result, url: () => control.url };
}

/**
 * Clique que pode navegar: a tela troca de recorte por `router.push/replace`,
 * a resposta do "servidor" chega depois e o React só a aplica dentro de um
 * `act` assíncrono. Use no lugar de `fireEvent.click` quando o clique muda a
 * URL ou chama `router.refresh()`.
 */
export async function click(element: Element) {
  await act(async () => {
    fireEvent.click(element);
  });
}

/** Navegação de fora da tela (clique em «Agenda» no menu, link compartilhado): o roteador leva a `url`. */
export async function visit(url: string) {
  await act(async () => {
    control.go(url);
  });
}

/** Janela (`from` incluso, `to` exclusivo) que a página pediu ao servidor na última leitura das consultas. */
export function lastListWindow(): { from: Date; to: Date } {
  const call = agenda.listAppointmentsFor.mock.calls.at(-1);
  if (!call) {
    throw new Error('A página ainda não leu as consultas');
  }
  return { from: new Date(call[1].from), to: new Date(call[1].to) };
}

/** Troca o valor de um campo que navega (filtro de profissional): mesma razão de `click`. */
export async function change(element: Element, value: string) {
  await act(async () => {
    fireEvent.change(element, { target: { value } });
  });
}

/**
 * O que a pessoa vê enquanto o servidor ainda não respondeu: o fallback do
 * `<Suspense>` da página (esqueleto com o mesmo cabeçalho).
 */
export async function renderSkeleton(url = '/agenda') {
  const { default: AgendaPage } = await import('@/app/(staff)/agenda/page');
  const tree = await AgendaPage({
    searchParams: Promise.resolve(toSearchParams(url)),
  });
  return renderWithToast(<>{suspenseFallbacks(tree)}</>);
}
