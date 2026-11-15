import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PAGE_SIZE } from '@/app/plataforma/auditoria/page-size';
import { nextAuditCursor } from '@/lib/audit-cursor';

const DIR = join(process.cwd(), 'src/app/plataforma/auditoria');
const read = (name: string) => readFileSync(join(DIR, name), 'utf8');

describe('Trilha da plataforma: limite da 1ª página (#878)', () => {
  it('Dado o limite da página, Quando lido, Então vale 100', () => {
    expect(PAGE_SIZE).toBe(100);
  });

  it('Dado o módulo da constante, Quando inspecionado, Então não é de cliente', () => {
    expect(read('page-size.ts')).not.toMatch(/^['"]use client['"]/m);
  });

  it('Dada a página do servidor, Quando importa PAGE_SIZE, Então vem do módulo sem diretiva', () => {
    expect(read('page.tsx')).toMatch(
      /import \{ PAGE_SIZE \} from '\.\/page-size';/,
    );
  });

  it('Dado o módulo de cliente, Quando inspecionado, Então não exporta PAGE_SIZE', () => {
    expect(read('platform-audit.tsx')).not.toMatch(/export const PAGE_SIZE/);
  });

  it('Dada uma 1ª página com menos eventos que o limite, Quando calcula o cursor, Então não há próxima página', () => {
    const events = Array.from({ length: 5 }, (_, index) => ({
      id: `e${index}`,
      occurredAt: new Date('2026-11-15T12:00:00.000Z'),
    }));
    expect(nextAuditCursor(events, PAGE_SIZE)).toBeNull();
  });

  it('Dada uma 1ª página cheia, Quando calcula o cursor, Então há próxima página', () => {
    const events = Array.from({ length: PAGE_SIZE }, (_, index) => ({
      id: `e${index}`,
      occurredAt: new Date('2026-11-15T12:00:00.000Z'),
    }));
    expect(nextAuditCursor(events, PAGE_SIZE)).not.toBeNull();
  });
});
