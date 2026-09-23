import type { CommissionRule } from '../billing/commission';
import { ValidationError } from '../shared/errors';
import { newId } from '../shared/id';

export const COMMISSION_TYPES = ['percentage', 'fixed'] as const;
export type CommissionType = (typeof COMMISSION_TYPES)[number];

/** Teto do valor fixo por sessão: R$ 100.000,00 — barra digitação absurda. */
const MAX_FIXED_CENTS = 10_000_000;

export interface ProfessionalProps {
  fullName: string;
  /** Registro profissional (ex.: COREN-SP 123456). */
  registry?: string | null;
  /**
   * Como o repasse é calculado (configurável só pelo Admin da clínica):
   * `percentage` = % sobre o valor da sessão; `fixed` = valor fixo por sessão.
   */
  commissionType?: CommissionType;
  /** Percentual de repasse sobre o valor da sessão (0–100), tipo `percentage`. */
  commissionPct?: number | null;
  /** Valor fixo por sessão realizada, em centavos, tipo `fixed`. */
  commissionFixedCents?: number | null;
}

export interface ProfessionalState extends ProfessionalProps {
  id: string;
  active: boolean;
  createdAt: Date;
}

/** Muda o campo só quando veio no patch (`undefined` = mantém). */
const pick = <T>(next: T | undefined, current: T): T =>
  next !== undefined ? next : current;

/** Profissional da equipe que atende e assina evoluções. */
export class Professional {
  private constructor(private readonly state: ProfessionalState) {}

  static create(props: ProfessionalProps): Professional {
    return new Professional({
      ...Professional.validate(props),
      id: newId(),
      active: true,
      createdAt: new Date(),
    });
  }

  static restore(state: ProfessionalState): Professional {
    return new Professional({ ...state });
  }

  private static validate(props: ProfessionalProps): ProfessionalProps {
    const fullName = props.fullName.trim();
    if (fullName.length === 0) {
      throw new ValidationError('Nome do profissional é obrigatório');
    }
    const commissionType = props.commissionType ?? 'percentage';
    if (!COMMISSION_TYPES.includes(commissionType)) {
      throw new ValidationError('Tipo de repasse inválido');
    }
    const pct = props.commissionPct ?? null;
    if (pct != null && (!Number.isInteger(pct) || pct < 0 || pct > 100)) {
      throw new ValidationError(
        'Repasse deve ser um percentual inteiro de 0 a 100',
      );
    }
    const fixed = props.commissionFixedCents ?? null;
    const fixedInvalid =
      fixed != null &&
      (!Number.isInteger(fixed) || fixed < 0 || fixed > MAX_FIXED_CENTS);
    if (fixedInvalid) {
      throw new ValidationError(
        'Valor fixo de repasse deve ser em centavos, de 0 a R$ 100.000,00',
      );
    }
    if (commissionType === 'fixed' && fixed == null) {
      throw new ValidationError(
        'Informe o valor fixo por sessão para o repasse do tipo valor fixo',
      );
    }
    return {
      fullName,
      registry: props.registry?.trim() || null,
      commissionType,
      commissionPct: pct,
      commissionFixedCents: fixed,
    };
  }

  update(changes: Partial<ProfessionalProps>): Professional {
    const validated = Professional.validate({
      fullName: changes.fullName ?? this.state.fullName,
      registry: pick(changes.registry, this.state.registry),
      commissionType: pick(changes.commissionType, this.state.commissionType),
      commissionPct: pick(changes.commissionPct, this.state.commissionPct),
      commissionFixedCents: pick(
        changes.commissionFixedCents,
        this.state.commissionFixedCents,
      ),
    });
    return new Professional({ ...this.state, ...validated });
  }

  deactivate(): Professional {
    return new Professional({ ...this.state, active: false });
  }

  reactivate(): Professional {
    return new Professional({ ...this.state, active: true });
  }

  get id(): string {
    return this.state.id;
  }

  get fullName(): string {
    return this.state.fullName;
  }

  get registry(): string | null {
    return this.state.registry ?? null;
  }

  get commissionType(): CommissionType {
    return this.state.commissionType ?? 'percentage';
  }

  get commissionPct(): number | null {
    return this.state.commissionPct ?? null;
  }

  get commissionFixedCents(): number | null {
    return this.state.commissionFixedCents ?? null;
  }

  /** Regra de repasse vigente; `null` = sem repasse configurado. */
  get commissionRule(): CommissionRule | null {
    if (this.commissionType === 'fixed') {
      return this.commissionFixedCents != null
        ? { kind: 'fixed', centsPerSession: this.commissionFixedCents }
        : null;
    }
    return this.commissionPct != null
      ? { kind: 'percentage', pct: this.commissionPct }
      : null;
  }

  get isActive(): boolean {
    return this.state.active;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }
}
