import { describe, expect, it, vi } from 'vitest';
import type { AppRelease } from '@/application/ports/app-release-repository';
import { CurrentVersionReader } from '@/application/release/current-version';

const gravada: AppRelease = {
  version: '0.2.0',
  gitSha: 'abcdef1234567',
  releasedAt: new Date('2026-10-23T12:00:00Z'),
  notes: null,
};

const readerOf = (
  latest: () => Promise<AppRelease | null>,
  options: {
    build?: { version: string | undefined; sha?: string };
    exposeSha?: boolean;
    now?: () => number;
  } = {},
) =>
  new CurrentVersionReader(
    { latest },
    options.build ?? { version: '0.1.0' },
    options.exposeSha ?? false,
    options.now,
  );

describe('Feature: Versão atual do sistema vinda do banco (ADR-066)', () => {
  it('Dado uma release gravada, Quando lê, Então a do banco prevalece sobre a do build', async () => {
    const reader = readerOf(async () => gravada, {
      build: { version: '0.1.0' },
    });

    expect(await reader.read()).toEqual({
      version: '0.2.0',
      releasedAt: gravada.releasedAt,
    });
  });

  it('Dado o banco vazio, Quando lê, Então vale a versão do build, sem data', async () => {
    const reader = readerOf(async () => null, { build: { version: '0.2.0' } });

    expect(await reader.read()).toEqual({ version: '0.2.0', releasedAt: null });
  });

  it('Dado o banco fora do ar, Quando lê, Então cai para a versão do build', async () => {
    const reader = readerOf(
      async () => {
        throw new Error('conexão recusada');
      },
      { build: { version: '0.2.0' } },
    );

    expect(await reader.read()).toEqual({ version: '0.2.0', releasedAt: null });
  });

  it.each([undefined, '', 'latest'])(
    'Dado o banco vazio e a versão do build %j, Quando lê, Então não há versão',
    async (version) => {
      const reader = readerOf(async () => null, { build: { version } });

      expect(await reader.read()).toBeNull();
    },
  );

  it('Dado homologação, Quando lê, Então o SHA da release vem junto', async () => {
    const reader = readerOf(async () => gravada, { exposeSha: true });

    expect(await reader.read()).toMatchObject({ sha: 'abcdef1234567' });
  });

  it('Dado produção, Quando lê, Então o SHA nunca aparece', async () => {
    const reader = readerOf(async () => gravada, { exposeSha: false });

    expect(await reader.read()).not.toHaveProperty('sha');
  });

  it('Dado homologação sem release gravada, Quando lê, Então usa o SHA do build', async () => {
    const reader = readerOf(async () => null, {
      build: { version: '0.2.0', sha: 'F64B7AF2064C' },
      exposeSha: true,
    });

    expect(await reader.read()).toEqual({
      version: '0.2.0',
      releasedAt: null,
      sha: 'f64b7af2064c',
    });
  });

  it('Dada a segunda chamada em 5 minutos, Quando lê, Então não vai ao banco', async () => {
    let clock = 1_000;
    const latest = vi.fn(async () => gravada);
    const reader = readerOf(latest, { now: () => clock });

    await reader.read();
    clock += 4 * 60_000;
    await reader.read();

    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('Dado o cache vencido, Quando lê, Então consulta o banco de novo', async () => {
    let clock = 1_000;
    const latest = vi.fn(async () => gravada);
    const reader = readerOf(latest, { now: () => clock });

    await reader.read();
    clock += 5 * 60_000 + 1;
    await reader.read();

    expect(latest).toHaveBeenCalledTimes(2);
  });

  it('Dada uma falha do banco, Quando passam 30 s, Então tenta de novo e se recupera', async () => {
    let clock = 1_000;
    const latest = vi
      .fn<() => Promise<AppRelease | null>>()
      .mockRejectedValueOnce(new Error('fora do ar'))
      .mockResolvedValue(gravada);
    const reader = readerOf(latest, { now: () => clock });

    expect((await reader.read())?.releasedAt).toBeNull();
    clock += 10_000;
    await reader.read();
    expect(latest).toHaveBeenCalledTimes(1);

    clock += 30_000;
    expect((await reader.read())?.releasedAt).toEqual(gravada.releasedAt);
  });

  it('Dado exatamente 5 minutos de cache, Quando lê, Então já consulta de novo', async () => {
    let clock = 1_000;
    const latest = vi.fn(async () => gravada);
    const reader = readerOf(latest, { now: () => clock });

    await reader.read();
    clock += 5 * 60_000;
    await reader.read();

    expect(latest).toHaveBeenCalledTimes(2);
  });

  it('Dada a versão do build com espaços, Quando o banco está vazio, Então usa a versão limpa', async () => {
    const reader = readerOf(async () => null, {
      build: { version: ' 0.2.0 ' },
    });

    expect(await reader.read()).toEqual({ version: '0.2.0', releasedAt: null });
  });
});
