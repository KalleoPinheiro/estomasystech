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

/** B2 (#214): o segundo fator do super_admin fica no ADR-008 e nos docs de acesso. */
describe('Feature: Registro da decisão do B2 (ADR-008)', () => {
  it('Dado o ADR-008 e os documentos de acesso, Quando ler, Então registram o segundo fator obrigatório, os códigos de recuperação e o recadastro', () => {
    const adr = read('docs/adr/008-segundo-fator-do-super-admin.md');
    const acesso = read('docs/domains/acesso/README.md');
    const context = read('CONTEXT.md');

    expect(adr).toMatch(/^---\n[\s\S]*?status: frozen\n/);
    expect(adr).toMatch(/\*\*Status:\*\* aceito/);
    expect(adr).toContain('RFC 6238');
    expect(adr).toContain('last_used_step');
    expect(adr).toContain('mfaEnrollmentRequired');
    expect(adr).toContain('10 códigos de uso único');
    expect(adr).toContain('recadastro obrigatório');
    expect(acesso).toMatch(/\| ACE-RN-18 \| Super Admin entra em duas etapas/);
    expect(acesso).toMatch(/\| ACE-RN-19 \| Sem fator cadastrado/);
    expect(acesso).toMatch(
      /\| ACE-RN-20 \| Código de recuperação válido não abre sessão/,
    );
    expect(acesso).toContain('008-segundo-fator-do-super-admin.md');
    expect(context).toContain('**Second factor** (segundo fator)');
    expect(context).toContain('**Recovery code** (código de recuperação)');
    expect(context).toContain('008-segundo-fator-do-super-admin.md');
  });
});

/** B3 (#214): a recuperação de emergência fica no ADR-009, no runbook e nos docs de acesso. */
describe('Feature: Registro da decisão do B3 (ADR-009)', () => {
  it('Dado o ADR-009, o runbook e os documentos de acesso, Quando ler, Então registram a recuperação de emergência', () => {
    const adr = read(
      'docs/adr/009-recuperacao-de-emergencia-do-super-admin.md',
    );
    const runbook = read('docs/engineering/producao.md');
    const acesso = read('docs/domains/acesso/README.md');
    const context = read('CONTEXT.md');

    expect(adr).toMatch(/^---\n[\s\S]*?status: frozen\n/);
    expect(adr).toMatch(/\*\*Status:\*\* aceito/);
    expect(adr).toMatch(/\*\*Emenda:\*\* \[ADR-004\]/);
    expect(adr).toContain('[ADR-005]');
    expect(adr).toContain('npm run admin:recover');

    expect(runbook).toContain(
      '## 10. Recuperação de emergência do Super Admin',
    );
    expect(runbook).toContain(
      'npm run admin:recover -- --novo-email=novo@clinica.com.br',
    );
    expect(runbook).toContain('`--confirmar`');
    expect(runbook).toContain('**1 hora**');
    for (const code of ['| `0` |', '| `2` |', '| `1` |']) {
      expect(runbook).toContain(code);
    }

    expect(acesso).toMatch(/\| ACE-RN-21 \| Super Admin que perdeu tudo/);
    expect(acesso).toContain('009-recuperacao-de-emergencia-do-super-admin.md');
    expect(acesso).not.toContain('bloco B3');
    expect(context).toContain('**Emergency recovery**');
  });
});
