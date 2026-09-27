import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * B1 (#214): a decisão de que o super_admin é o operador da plataforma fica
 * registrada no ADR-007 e nos documentos que descrevem os papéis (critérios
 * 23 e 24 da tarefa).
 */
const read = (path: string): string =>
  readFileSync(join(process.cwd(), path), 'utf8');

const ADR = 'docs/adr/007-super-admin-operador-da-plataforma.md';

/** Frases que descreviam o super_admin com acesso a dado de clínica. */
const STALE_CLAIMS = [
  /inclusive dado clínico/i,
  /including clinical data/i,
  /Full access to every Clinic/i,
  /Super Admin too/i,
  /any other role/i,
  /Super Admin access to another Clinic/i,
  /Acesso do Super Admin a dado de outra empresa/i,
  /cross-clinic by definition/i,
];

describe('Feature: Registro da decisão do B1 (ADR-007)', () => {
  it('Dado o ADR-007, Quando ler, Então está aceito, emenda o ADR-003 e cobre os quatro pontos', () => {
    const adr = read(ADR);

    expect(adr).toMatch(/^---\n[\s\S]*?status: frozen\n/);
    expect(adr).toMatch(/\*\*Status:\*\* aceito/);
    expect(adr).toMatch(/\*\*Emenda:\*\* \[ADR-003\]/);
    // Sem acesso clínico nem operacional.
    expect(adr).toContain(
      '`clinical`,\n  `operational`, `administrative` e `professional_self`',
    );
    // Família platform.
    expect(adr).toContain("FAMILY_ALLOWED_ROLES.platform = ['super_admin']");
    // Um único super_admin: matriz + constraint.
    expect(adr).toContain('PROVISIONING_MATRIX');
    expect(adr).toContain('ck_user_accounts_system_role_has_no_clinic');
    // Catálogo como ato de plataforma.
    expect(adr).toContain('POST /api/platform/taxonomy/import');
  });

  it('Dado os documentos de acesso, Quando ler, Então descrevem o super_admin como operador da plataforma', () => {
    const acesso = read('docs/domains/acesso/README.md');
    const context = read('CONTEXT.md');

    expect(acesso).toContain('operador da plataforma');
    expect(acesso).toMatch(
      /\| ACE-RN-10 \| Super Admin só acessa a família `platform`/,
    );
    expect(acesso).toMatch(/\| `super_admin` \| só a plataforma/);
    expect(context).toContain('operador da plataforma');
    expect(context).toMatch(
      /Monthly closing per professional\*\*, one per month, recorded only by Admin de Empresa\. /,
    );
    for (const doc of [acesso, context]) {
      for (const stale of STALE_CLAIMS) {
        expect(doc).not.toMatch(stale);
      }
    }
  });
});
