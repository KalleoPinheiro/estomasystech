import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_CLINIC_ID } from '@/infrastructure/persistence/drizzle/legacy-clinic';
import {
  clinicScope,
  sessionScope,
  systemScope,
  type TenantScope,
  writeClinicId,
  writeScope,
} from '@/lib/auth/tenant-scope';

/**
 * Arquivos de `src/` autorizados a pedir a visão cross-empresa. Cada entrada
 * precisa de motivo: fluxos que não têm clínica por natureza. Uma rota nova
 * usando `systemScope()` quebra este teste até ser justificada aqui — foi o
 * escopo nulo decidido à mão que vazou dado entre empresas no PR #159.
 */
const SYSTEM_SCOPE_ALLOWLIST: Record<string, string> = {
  'lib/auth/tenant-scope.ts': 'definição da fábrica',
  'app/api/auth/bootstrap/route.ts':
    'cria o primeiro super_admin antes de existir sessão',
  'app/api/auth/forgot-password/route.ts':
    'sem sessão; e-mail pode existir em várias clínicas (#155)',
  'app/api/auth/login/route.ts':
    'sem sessão; a clínica só é conhecida após autenticar (#125)',
  'app/api/auth/set-password/route.ts':
    'sem sessão; o token identifica a conta e sua clínica',
  'lib/auth/mfa-route.ts':
    'segundo fator do super_admin: sem sessão; o token pendente identifica a conta (sem clínica)',
  'app/api/reminders/run/route.ts':
    'listar as empresas para o cron; o job roda com clinicScope de cada uma',
  'app/api/platform/taxonomy/import/route.ts':
    'catálogo de taxonomia é global (sem clinic_id); ato de plataforma (ADR-007)',
  'app/api/taxonomy/diagnoses/[code]/linked-terms/route.ts':
    'catálogo de taxonomia é global',
  'app/api/taxonomy/diagnoses/route.ts': 'catálogo de taxonomia é global',
  'app/api/taxonomy/interventions/route.ts': 'catálogo de taxonomia é global',
  'app/api/taxonomy/outcomes/route.ts': 'catálogo de taxonomia é global',
};

const SRC_ROOT = path.join(process.cwd(), 'src');

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const sourceFiles = collectSourceFiles(SRC_ROOT).map((full) => ({
  relative: path.relative(SRC_ROOT, full).split(path.sep).join('/'),
  content: readFileSync(full, 'utf-8'),
}));

describe('Feature: Escopo de empresa centralizado (tenant-scope)', () => {
  describe('Fábricas', () => {
    const companySession = { clinicId: 'clinic-a' };
    const systemSession = { clinicId: null };

    it('Dada sessão de empresa, Quando sessionScope/writeScope, Então ambos usam a clínica da sessão', () => {
      expect(sessionScope(companySession).clinicId).toBe('clinic-a');
      expect(writeScope(companySession).clinicId).toBe('clinic-a');
      expect(writeClinicId(companySession)).toBe('clinic-a');
    });

    it('Dado papel de sistema, Quando sessionScope, Então visão cross-empresa (null)', () => {
      expect(sessionScope(systemSession).clinicId).toBeNull();
    });

    it('Dado papel de sistema ou modo aberto, Quando writeScope, Então grava na clínica legada', () => {
      expect(writeScope(systemSession).clinicId).toBe(LEGACY_CLINIC_ID);
      expect(writeScope(null).clinicId).toBe(LEGACY_CLINIC_ID);
      expect(writeClinicId(undefined)).toBe(LEGACY_CLINIC_ID);
    });

    it('Dado modo aberto (sem sessão), Quando sessionScope, Então visão de sistema', () => {
      expect(sessionScope(undefined).clinicId).toBeNull();
    });

    it('Dado objeto literal, Quando usado como escopo, Então não compila (só as fábricas produzem TenantScope)', () => {
      // @ts-expect-error — `getRepositories({ clinicId: null })` não compila mais.
      const literal: TenantScope = { clinicId: null };
      expect(literal.clinicId).toBeNull();
    });

    it('Dada clínica explícita ou fluxo de sistema, Quando clinicScope/systemScope, Então usa o valor pedido', () => {
      expect(clinicScope('clinic-b').clinicId).toBe('clinic-b');
      expect(systemScope().clinicId).toBeNull();
    });
  });

  describe('Conformidade do código-fonte', () => {
    it('Dado o código de src/, Quando alguém usa systemScope(), Então o arquivo está na allowlist justificada', () => {
      const users = sourceFiles
        .filter((file) => file.content.includes('systemScope('))
        .map((file) => file.relative)
        .sort();

      expect(users).toEqual(Object.keys(SYSTEM_SCOPE_ALLOWLIST).sort());
    });

    it('Dado o código de src/app, Quando decide a empresa, Então não usa o fallback legado à mão', () => {
      // O fallback para a clínica legada vive só em writeClinicId/writeScope.
      const offenders = sourceFiles
        .filter((file) => file.relative.startsWith('app/'))
        .filter((file) => file.content.includes('LEGACY_CLINIC_ID'))
        .map((file) => file.relative);

      expect(offenders).toEqual([]);
    });
  });
});
