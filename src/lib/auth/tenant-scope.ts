import { LEGACY_CLINIC_ID } from '@/infrastructure/persistence/drizzle/legacy-clinic';

declare const tenantScopeBrand: unique symbol;

/**
 * Escopo de empresa entregue a `getRepositories`. Tipo "branded": só as
 * fábricas deste módulo produzem um valor — `getRepositories({ clinicId: null })`
 * não compila. Motivo: com o escopo decidido à mão em cada rota, várias
 * leituras ficaram sem filtro e vazaram dado entre empresas (PR #159).
 *
 * `clinicId: null` = visão de sistema (cross-empresa, sem filtro).
 */
export interface TenantScope {
  readonly clinicId: string | null;
  readonly [tenantScopeBrand]: true;
}

/** O que as fábricas leem de uma sessão (Session ou equivalente). */
interface ScopeSource {
  clinicId: string | null;
}

const scope = (clinicId: string | null): TenantScope =>
  ({ clinicId }) as TenantScope;

/**
 * Empresa exata da sessão. Sessão de empresa só enxerga a própria clínica;
 * papel de sistema (clinicId nulo) enxerga todas, como prevê o CONTEXT.md.
 * Padrão para leituras.
 */
export function sessionScope(
  session: ScopeSource | null | undefined,
): TenantScope {
  return scope(session?.clinicId ?? null);
}

/**
 * Empresa de escrita: repositórios recusam `save` sem empresa, então papel de
 * sistema (ou modo aberto, sem sessão) grava na clínica legada. Única origem
 * desse fallback — rotas que precisam do id (auditoria, findById) usam esta.
 */
export function writeClinicId(session: ScopeSource | null | undefined): string {
  return session?.clinicId ?? LEGACY_CLINIC_ID;
}

/** Escopo de escrita — ver `writeClinicId`. */
export function writeScope(
  session: ScopeSource | null | undefined,
): TenantScope {
  return scope(writeClinicId(session));
}

/** Empresa escolhida explicitamente (ex.: super_admin criando conta em outra clínica). */
export function clinicScope(clinicId: string): TenantScope {
  return scope(clinicId);
}

/**
 * Visão cross-empresa sem sessão de empresa — só para fluxos que não têm
 * clínica por natureza (login, bootstrap, cron, catálogo global). Cada arquivo
 * que usa está numa allowlist em `tests/architecture/tenant-scope.test.ts`:
 * adicionar um novo exige justificar lá.
 */
export function systemScope(): TenantScope {
  return scope(null);
}
