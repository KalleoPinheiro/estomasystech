import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';
import { isPublicPath } from '@/lib/auth/access-policy';

describe('Feature: Instalar na tela inicial (#430)', () => {
  it('Dado um visitante sem sessão, Quando o navegador pedir o manifesto e os ícones, Então os caminhos são públicos', () => {
    for (const path of [
      '/manifest.webmanifest',
      '/apple-touch-icon.png',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/icon-maskable-512.png',
    ]) {
      expect(isPublicPath(path)).toBe(true);
    }
  });

  it('Dado o manifesto, Quando lido, Então abre como app em português e usa a marca da plataforma', () => {
    const m = manifest();

    expect(m.name).toBe('EstomaSysTech');
    expect(m.display).toBe('standalone');
    expect(m.lang).toBe('pt-BR');
    expect(m.start_url).toBe('/');
  });

  it('Dado o manifesto, Quando listar os ícones, Então 192, 512 e maskable existem em public/', () => {
    const icons = manifest().icons ?? [];

    expect(icons.map((i) => i.sizes)).toEqual([
      '192x192',
      '512x512',
      '512x512',
    ]);
    expect(icons.filter((i) => i.purpose === 'maskable')).toHaveLength(1);
    for (const icon of icons) {
      expect(existsSync(join(process.cwd(), 'public', icon.src))).toBe(true);
    }
    expect(existsSync(join(process.cwd(), 'public/apple-touch-icon.png'))).toBe(
      true,
    );
  });
});
