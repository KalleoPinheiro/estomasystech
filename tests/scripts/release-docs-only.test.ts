import { describe, expect, it } from 'vitest';
import { isDocsOnly } from '../../scripts/release/lib';

describe('PR só de documentação dispensa o recibo do gate local (ADR-053)', () => {
  it('Dado só .md de docs, ADR, specs e raiz, Quando classifica, Então é docs-only', () => {
    expect(
      isDocsOnly([
        'docs/adr/053-docs-sem-recibo.md',
        'docs/domains/agenda/README.md',
        '.specs/archive/handoff-2026.md',
        '.changeset/docs.md',
        'AGENTS.md',
      ]),
    ).toBe(true);
  });

  it('Dado qualquer arquivo que não é .md, Quando classifica, Então exige o recibo', () => {
    expect(isDocsOnly(['docs/x.md', 'package.json'])).toBe(false);
    expect(isDocsOnly(['docs/diagrama.png'])).toBe(false);
    expect(isDocsOnly(['docs/x.md', 'src/domain/auth/x.ts'])).toBe(false);
  });

  it('Dado .md dentro de código, teste, pipeline ou config de agente, Quando classifica, Então exige o recibo', () => {
    for (const f of [
      'src/app/ajuda.md',
      'tests/fixtures/caso.md',
      'scripts/seed/leia.md',
      '.github/workflows/nota.md',
      '.claude/skills/x/SKILL.md',
      'drizzle/leia.md',
    ]) {
      expect(isDocsOnly(['docs/x.md', f]), f).toBe(false);
    }
  });

  it('Dado diff vazio ou ilegível, Quando classifica, Então exige o recibo', () => {
    expect(isDocsOnly([])).toBe(false);
  });
});
