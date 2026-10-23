import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAFF_PAGES } from '@/lib/staff-access';
import { staffMetadata } from '@/lib/staff-metadata';

const STAFF_DIR = path.resolve(__dirname, '../../src/app/(staff)');

function layoutFor(href: string) {
  return href === '/'
    ? path.join(STAFF_DIR, 'layout.tsx')
    : path.join(STAFF_DIR, href.slice(1), 'layout.tsx');
}

describe('Título da aba das telas da equipe (#479)', () => {
  it('monta "<Tela> — EstomaSysTech"', () => {
    expect(staffMetadata('Agenda').title).toBe('Agenda — EstomaSysTech');
  });

  it.each(STAFF_PAGES.map((page) => [page.label, page.href] as const))(
    'dado a tela %s, o layout do servidor declara o título dela',
    async (label, href) => {
      expect(existsSync(layoutFor(href))).toBe(true);
      const mod = await import(/* @vite-ignore */ layoutFor(href));
      expect(mod.metadata).toEqual(staffMetadata(label));
    },
  );
});
