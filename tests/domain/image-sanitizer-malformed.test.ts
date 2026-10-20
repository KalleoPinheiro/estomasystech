import { describe, expect, it } from 'vitest';
import { stripImageMetadata } from '@/domain/clinical/image-sanitizer';

const JPEG_HEAD = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02]; // SOI + APP0 vazio
const WEBP_HEAD = [
  0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
];

describe('Feature: Sanitização fail-safe de imagens malformadas (AD-002)', () => {
  it('Dado entrada que lança ao ser lida, Quando sanitizar, Então devolve a própria entrada sem sanitizar', () => {
    const hostil = new Uint8Array(JPEG_HEAD);
    Object.defineProperty(hostil, 'length', {
      get() {
        throw new Error('leitura inválida');
      },
    });
    const result = stripImageMetadata(hostil);
    expect(result.data).toBe(hostil);
    expect(result.stripped).toBe(false);
  });

  it('Dado JPEG sem SOS que termina após os segmentos, Quando sanitizar, Então mantém os segmentos sem lançar', () => {
    const data = new Uint8Array(JPEG_HEAD);
    const result = stripImageMetadata(data);
    expect(Array.from(result.data)).toEqual(JPEG_HEAD);
    expect(result.stripped).toBe(true);
  });

  it('Dado JPEG com lixo onde deveria haver marcador, Quando sanitizar, Então devolve original', () => {
    const data = new Uint8Array([...JPEG_HEAD, 0x00, 0x11]);
    expect(stripImageMetadata(data).data).toBe(data);
  });

  it('Dado JPEG que termina em um byte 0xFF solto, Quando sanitizar, Então devolve original', () => {
    const data = new Uint8Array([...JPEG_HEAD, 0xff]);
    expect(stripImageMetadata(data).data).toBe(data);
  });

  it('Dado JPEG com marcador autônomo (RSTn), Quando sanitizar, Então o preserva sem ler comprimento', () => {
    const data = new Uint8Array([...JPEG_HEAD, 0xff, 0xd0]);
    const result = stripImageMetadata(data);
    expect(Array.from(result.data)).toEqual([...JPEG_HEAD, 0xff, 0xd0]);
  });

  it('Dado JPEG com marcador sem os 2 bytes de comprimento, Quando sanitizar, Então devolve original', () => {
    const data = new Uint8Array([...JPEG_HEAD, 0xff, 0xdb, 0x00]);
    expect(stripImageMetadata(data).data).toBe(data);
  });

  it('Dado WebP com cabeçalho de chunk incompleto no fim, Quando sanitizar, Então devolve original', () => {
    const data = new Uint8Array([...WEBP_HEAD, 0x56, 0x50, 0x38]);
    expect(stripImageMetadata(data).data).toBe(data);
  });

  it('Dado WebP com chunk maior que o buffer, Quando sanitizar, Então devolve original', () => {
    const data = new Uint8Array([
      ...WEBP_HEAD,
      0x56,
      0x50,
      0x38,
      0x20,
      0xff,
      0x00,
      0x00,
      0x00,
      0x01,
    ]);
    expect(stripImageMetadata(data).data).toBe(data);
  });

  it('Dado PNG com cabeçalho de chunk incompleto no fim, Quando sanitizar, Então devolve original', () => {
    const data = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
    ]);
    expect(stripImageMetadata(data).data).toBe(data);
  });
});
