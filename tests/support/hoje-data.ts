import { vi } from 'vitest';
import type { UserRole } from '@/domain/auth/user-role';
import { ValidationError } from '@/domain/shared/errors';
import type {
  AppointmentDto,
  FollowUpDto,
  MajorityReviewDto,
  SupplyDto,
  TriagePhotoDto,
} from '@/lib/dto';

/**
 * Dublê da camada de dados e das ações da tela Hoje (#548). A tela agora lê no
 * servidor, então os testes de página trocam o `fetch('/api/...')` de antes por
 * estas funções: os mesmos cenários, o mesmo vocabulário de opções.
 */
export const hoje = {
  session: { role: 'company_admin' as UserRole, subject: 'admin@clinica.com' },
  refresh: vi.fn(),
  requireStaffPage: vi.fn(),
  listAppointmentsFor: vi.fn(),
  buildMonthSummary: vi.fn(),
  listFollowUpsFor: vi.fn(),
  whatsappSentToday: vi.fn(),
  listSuppliesFor: vi.fn(),
  buildLinkedTriageQueue: vi.fn(),
  listMajorityReviewsFor: vi.fn(),
  resolveFollowUp: vi.fn(),
  decideTriage: vi.fn(),
  keepMajorityGuardian: vi.fn(),
};

export interface HojeDataOptions {
  role?: UserRole;
  summary?: { billing: unknown; appointmentsInMonth: number };
  summaryError?: string;
  /** Consultas do dia (período de até 25 h). */
  today?: AppointmentDto[];
  todayError?: string;
  /** Consultas dos últimos 30 dias (período longo): onde a tela procura consulta sem desfecho. */
  recent?: AppointmentDto[];
  followUps?: FollowUpDto[];
  followUpsError?: string;
  sent?: Record<string, string>;
  supplies?: SupplyDto[];
  suppliesError?: string;
  triage?: Partial<TriagePhotoDto>[];
  triageError?: string;
  majority?: MajorityReviewDto[];
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const fails = (message: string) => async () => {
  throw new ValidationError(message);
};

export const SUMMARY_FIXTURE = {
  billing: { paidCents: 150000, pendingCents: 50000, pendingCount: 3 },
  appointmentsInMonth: 12,
};

/** Configura o que cada leitura do servidor devolve — ou o erro que lança. */
export function mockHojeData(options: HojeDataOptions = {}) {
  const {
    role = 'company_admin',
    summary = SUMMARY_FIXTURE,
    summaryError,
    today = [],
    todayError,
    recent = [],
    followUps = [],
    followUpsError,
    sent = {},
    supplies = [],
    suppliesError,
    triage = [],
    triageError,
    majority = [],
  } = options;
  hoje.session.role = role;
  hoje.requireStaffPage.mockResolvedValue(hoje.session);
  hoje.buildMonthSummary.mockImplementation(
    summaryError ? fails(summaryError) : async () => summary,
  );
  hoje.listAppointmentsFor.mockImplementation(
    async (_session: unknown, range: { from: Date; to: Date }) => {
      const isDay =
        range.to.getTime() - range.from.getTime() <= DAY_MS + HOUR_MS;
      if (isDay && todayError) throw new ValidationError(todayError);
      return isDay ? today : recent;
    },
  );
  hoje.listFollowUpsFor.mockImplementation(
    followUpsError ? fails(followUpsError) : async () => followUps,
  );
  hoje.whatsappSentToday.mockResolvedValue(sent);
  hoje.listSuppliesFor.mockImplementation(
    suppliesError ? fails(suppliesError) : async () => supplies,
  );
  hoje.buildLinkedTriageQueue.mockImplementation(
    triageError ? fails(triageError) : async () => triage,
  );
  hoje.listMajorityReviewsFor.mockResolvedValue(majority);
  hoje.resolveFollowUp.mockResolvedValue({
    success: true,
    data: null,
    error: null,
  });
  hoje.decideTriage.mockResolvedValue({
    success: true,
    data: null,
    error: null,
  });
  hoje.keepMajorityGuardian.mockResolvedValue({
    success: true,
    data: null,
    error: null,
  });
}

export function resetHojeData() {
  for (const value of Object.values(hoje)) {
    if (typeof value === 'function' && 'mockReset' in value) value.mockReset();
  }
}
