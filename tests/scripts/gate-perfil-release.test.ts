import { describe, expect, it } from 'vitest';
import {
  DOCKER_STEPS,
  planFor,
  profileFor,
  STEPS,
} from '../../scripts/gate/plano';
import {
  formatReceipt,
  REQUIRED_STEPS,
  verifyReceipt,
} from '../../scripts/gate/receipt';

const SHA = 'c'.repeat(40);
const names = (plan: ReturnType<typeof planFor>) =>
  plan.ok ? plan.steps.map((s) => s.name) : [];
const receipt = (steps: string[], skipped: string[] = []) =>
  formatReceipt({
    sha: SHA,
    passed: true,
    e2eTests: 300,
    steps,
    skipped,
    minutes: 40,
  });

describe('Feature: perfil do gate da release (ADR-071)', () => {
  it('Dado a branch release/v0.3.0, Então o perfil é release; feature e hotfix são pr', () => {
    expect(profileFor('release/v0.3.0')).toBe('release');
    expect(profileFor('feat/570-release-cut')).toBe('pr');
    expect(profileFor('hotfix/x')).toBe('pr');
  });

  it('Dado o worktree destacado do release:cut com GATE_PERFIL=release, Então o perfil é release', () => {
    expect(profileFor('HEAD', 'release')).toBe('release');
    expect(profileFor('release/v0.3.0', 'pr')).toBe('pr');
    expect(profileFor('HEAD', 'outro')).toBe('pr');
  });

  it('Dado o perfil release com regra alterada, Então roda build, E2E, integridade, Docker e backup, sem mutação', () => {
    const plan = planFor({
      profile: 'release',
      hasDocker: true,
      rules: ['src/domain/a.ts'],
    });
    expect(names(plan)).toEqual([
      ...STEPS.map((s) => s.name),
      'docker',
      'backup',
    ]);
    expect(names(plan)).not.toContain('mutacao');
    expect(plan.ok && plan.skipped).toEqual([]);
  });

  it('Dado o perfil release sem Docker, Então recusa em vez de pular a imagem e o backup', () => {
    const plan = planFor({ profile: 'release', hasDocker: false, rules: [] });
    expect(plan).toMatchObject({ ok: false });
    expect(!plan.ok && plan.reason).toContain('exige Docker');
  });

  it('Dado o perfil pr com regra alterada e sem Docker, Então muta só o arquivo e registra Docker e backup como pulados', () => {
    const plan = planFor({
      profile: 'pr',
      hasDocker: false,
      rules: ['src/domain/a.ts', 'src/application/b.ts'],
    });
    expect(names(plan)).toEqual([...STEPS.map((s) => s.name), 'mutacao']);
    expect(plan.ok && plan.steps.at(-1)?.args).toEqual([
      'run',
      'test:mutacao',
      '--',
      '--mutate',
      'src/domain/a.ts,src/application/b.ts',
    ]);
    expect(plan.ok && plan.skipped).toEqual(['docker', 'backup']);
  });

  it('Dado o perfil pr com Docker e sem regra alterada, Então roda as etapas Docker com segredos descartáveis', () => {
    const plan = planFor({ profile: 'pr', hasDocker: true, rules: [] });
    expect(names(plan)).toEqual([
      ...STEPS.map((s) => s.name),
      'docker',
      'backup',
    ]);
    expect(DOCKER_STEPS.every((s) => s.docker)).toBe(true);
  });
});

describe('Feature: recibo do PR release → main (ADR-071)', () => {
  const full = [...REQUIRED_STEPS, 'docker', 'backup'];

  it('Dado o PR da release que muda regra, Quando o recibo não tem mutação, Então vale', () => {
    expect(
      verifyReceipt(receipt(full), SHA, ['src/domain/a.ts'], 'release/v0.3.0'),
    ).toMatchObject({ ok: true });
  });

  it('Dado o PR da release, Quando o recibo pulou Docker ou backup, Então reprova', () => {
    const check = verifyReceipt(
      receipt([...REQUIRED_STEPS], ['docker', 'backup']),
      SHA,
      [],
      'release/v0.3.0',
    );
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('docker, backup');
  });

  it('Dado um hotfix que muda regra, Quando o recibo não tem mutação, Então reprova como antes', () => {
    expect(
      verifyReceipt(receipt(full), SHA, ['src/domain/a.ts'], 'hotfix/x').ok,
    ).toBe(false);
  });
});
