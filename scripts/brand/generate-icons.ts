/**
 * Gera os ícones do app instalável (#430) a partir da marca do Still Void: o
 * ponto de acento (violeta) sobre o fundo escuro, o mesmo `logoClasses.dot` do
 * `BrandLogo`. Os PNGs ficam versionados em `public/icons/`; rode este script
 * só se a marca mudar: `npx tsx scripts/brand/generate-icons.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { accents, colors } from '@still-void/ui/react';
import sharp from 'sharp';

const OUT = path.join(process.cwd(), 'public');

/** Ponto de 22% do lado, bem dentro da zona segura (80%) do ícone "maskable". */
const svg = (size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${colors.dark.bg}"/><circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.22}" fill="${accents.violet}"/></svg>`;

const targets: [string, number][] = [
  ['icons/icon-192.png', 192],
  ['icons/icon-512.png', 512],
  ['icons/icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
];

async function main() {
  mkdirSync(path.join(OUT, 'icons'), { recursive: true });
  for (const [file, size] of targets) {
    const png = await sharp(Buffer.from(svg(size))).png().toBuffer();
    writeFileSync(path.join(OUT, file), png);
  }
}

main();
