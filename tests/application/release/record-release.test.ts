import { describe, expect, it } from 'vitest';
import type {
  AppRelease,
  AppReleaseRepository,
  NewAppRelease,
} from '@/application/ports/app-release-repository';
import { RecordRelease } from '@/application/release/record-release';
import { ValidationError } from '@/domain/shared/errors';

class FakeReleases implements AppReleaseRepository {
  recorded: NewAppRelease[] = [];
  async record(release: NewAppRelease) {
    this.recorded.push(release);
  }
  async latest(): Promise<AppRelease | null> {
    return null;
  }
}

describe('Feature: Gravar a release implantada (ADR-066)', () => {
  it('Dado uma versão e um SHA, Quando grava, Então envia versão, SHA e a hora', async () => {
    const releases = new FakeReleases();
    const at = new Date('2026-10-23T12:00:00Z');

    await new RecordRelease(releases, () => at).execute({
      version: '0.2.0',
      sha: 'ABCDEF1234',
      notes: ' Rodada 2 ',
    });

    expect(releases.recorded).toEqual([
      { version: '0.2.0', gitSha: 'abcdef1234', notes: 'Rodada 2', at },
    ]);
  });

  it('Dado só a versão, Quando grava, Então SHA e notas ficam nulos e a hora é a do relógio', async () => {
    const releases = new FakeReleases();

    await new RecordRelease(releases).execute({ version: '0.2.0' });

    expect(releases.recorded[0]).toMatchObject({
      version: '0.2.0',
      gitSha: null,
      notes: null,
    });
    expect(releases.recorded[0].at).toBeInstanceOf(Date);
  });

  it('Dada uma versão inválida, Quando grava, Então recusa e nada é gravado', async () => {
    const releases = new FakeReleases();

    await expect(
      new RecordRelease(releases).execute({ version: 'latest' }),
    ).rejects.toThrow(ValidationError);
    expect(releases.recorded).toEqual([]);
  });
});
