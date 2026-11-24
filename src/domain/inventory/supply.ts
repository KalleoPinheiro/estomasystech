import { InsufficientStockError, ValidationError } from '../shared/errors';
import { newId } from '../shared/id';

/** Categoria do insumo (D2 do #963): separa cobertura de solução no registro do curativo. */
export const SUPPLY_CATEGORIES = [
  'cobertura',
  'solucao',
  'protecao',
  'outro',
] as const;

export type SupplyCategory = (typeof SUPPLY_CATEGORIES)[number];

export const SUPPLY_CATEGORY_LABELS: Record<SupplyCategory, string> = {
  cobertura: 'Cobertura',
  solucao: 'Solução',
  protecao: 'Proteção',
  outro: 'Outro',
};

export const SUPPLY_CATEGORY_INVALID_MESSAGE = 'Categoria do insumo inválida';

/** Valor vindo do banco: categoria conhecida ou null (sem categoria). */
export function parseSupplyCategory(
  value: string | null,
): SupplyCategory | null {
  return SUPPLY_CATEGORIES.find((category) => category === value) ?? null;
}

export interface SupplyProps {
  name: string;
  unit: string;
  minQty: number;
  priceCents: number;
  /** `null` ou ausente: sem categoria. */
  category?: SupplyCategory | null;
}

export interface SupplyState extends SupplyProps {
  id: string;
  stockQty: number;
  active: boolean;
  createdAt: Date;
}

export class Supply {
  private constructor(private readonly state: SupplyState) {}

  static create(props: SupplyProps): Supply {
    return new Supply({
      ...Supply.validate(props),
      id: newId(),
      stockQty: 0,
      active: true,
      createdAt: new Date(),
    });
  }

  static restore(state: SupplyState): Supply {
    return new Supply({ ...state });
  }

  private static validate(props: SupplyProps): SupplyProps {
    const name = props.name.trim();
    const unit = props.unit.trim();
    if (name.length === 0) {
      throw new ValidationError('Nome do insumo é obrigatório');
    }
    if (unit.length === 0) {
      throw new ValidationError('Unidade é obrigatória');
    }
    if (!Number.isInteger(props.minQty) || props.minQty < 0) {
      throw new ValidationError('Estoque mínimo deve ser inteiro não-negativo');
    }
    if (!Number.isInteger(props.priceCents) || props.priceCents < 0) {
      throw new ValidationError(
        'Preço deve ser inteiro não-negativo em centavos',
      );
    }
    const category = props.category ?? null;
    if (category !== null && !SUPPLY_CATEGORIES.includes(category)) {
      throw new ValidationError(SUPPLY_CATEGORY_INVALID_MESSAGE);
    }
    return {
      name,
      unit,
      minQty: props.minQty,
      priceCents: props.priceCents,
      category,
    };
  }

  private static assertPositiveQty(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError(
        'Quantidade da movimentação deve ser inteiro positivo',
      );
    }
  }

  update(changes: Partial<SupplyProps>): Supply {
    const validated = Supply.validate({
      name: changes.name ?? this.state.name,
      unit: changes.unit ?? this.state.unit,
      minQty: changes.minQty ?? this.state.minQty,
      priceCents: changes.priceCents ?? this.state.priceCents,
      // `null` limpa a categoria; ausente mantém a atual.
      category:
        changes.category === undefined ? this.state.category : changes.category,
    });
    return new Supply({ ...this.state, ...validated });
  }

  registerEntry(quantity: number): Supply {
    Supply.assertPositiveQty(quantity);
    return new Supply({
      ...this.state,
      stockQty: this.state.stockQty + quantity,
    });
  }

  registerExit(quantity: number): Supply {
    Supply.assertPositiveQty(quantity);
    if (quantity > this.state.stockQty) {
      throw new InsufficientStockError(
        `Estoque insuficiente de "${this.state.name}": disponível ${this.state.stockQty}, solicitado ${quantity}`,
      );
    }
    return new Supply({
      ...this.state,
      stockQty: this.state.stockQty - quantity,
    });
  }

  deactivate(): Supply {
    return new Supply({ ...this.state, active: false });
  }

  reactivate(): Supply {
    return new Supply({ ...this.state, active: true });
  }

  /**
   * `minQty === 0` significa "sem limiar configurado", não "qualquer estoque
   * já é baixo" — sem essa guarda, todo insumo recém-criado (stockQty 0,
   * minQty default 0) nascia marcado "estoque baixo" no dia 1 (achado [P0]
   * da auditoria UX 2026-08, §4 Materiais).
   */
  get isLowStock(): boolean {
    return this.state.minQty > 0 && this.state.stockQty <= this.state.minQty;
  }

  /** Zero é mais grave que "baixo" — mesma severidade visual escondia isso (achado [P0]). */
  get isOutOfStock(): boolean {
    return this.state.stockQty === 0;
  }

  get id(): string {
    return this.state.id;
  }

  get name(): string {
    return this.state.name;
  }

  get unit(): string {
    return this.state.unit;
  }

  get minQty(): number {
    return this.state.minQty;
  }

  get priceCents(): number {
    return this.state.priceCents;
  }

  get category(): SupplyCategory | null {
    return this.state.category ?? null;
  }

  get stockQty(): number {
    return this.state.stockQty;
  }

  get isActive(): boolean {
    return this.state.active;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }
}
