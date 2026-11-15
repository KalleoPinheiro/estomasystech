import { describe, expect, it } from 'vitest';
import {
  formatReceipt,
  REQUIRED_STEPS,
  verifyReceipt,
} from '../../scripts/gate/receipt';
import { findGateReason, findReason } from '../../scripts/gate/test-integrity';
import {
  approvalBranch,
  checkPreparedVersion,
  consolidatedGateAlterado,
  consolidatedTesteAlterado,
  cutStart,
  integrityArgs,
  motivoSemRotulo,
  prNumbersFromSubjects,
  releaseCommitSubject,
  releasePrBody,
  worktreePath,
} from '../../scripts/release/cut-lib';
import { checkHomologacao } from '../../scripts/release/lib';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const state = {
  approved: A,
  head: A,
  parent: B,
  subject: 'feat: x (#9)',
  version: '0.3.0',
};

describe('Feature: release:cut só corta o SHA homologado (ADR-071)', () => {
  it('Dado a marca homologacao/v0.3.0 no HEAD, Então corta e roda o prepare', () => {
    expect(approvalBranch('0.3.0')).toBe('homologacao/v0.3.0');
    expect(cutStart(state)).toEqual({ ok: true, prepared: false });
  });

  it('Dado que a marca não existe, Então recusa citando a branch da marca', () => {
    const r = cutStart({ ...state, approved: null });
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.reason).toContain('homologacao/v0.3.0 não existe');
  });

  it('Dado que a release andou depois da homologação, Então recusa e pede nova homologação', () => {
    const r = cutStart({ ...state, approved: B });
    expect(!r.ok && r.reason).toContain('homologue este SHA');
  });

  it('Dado o commit de versão do prepare sobre o SHA homologado (nova execução), Então segue sem versionar de novo', () => {
    const r = cutStart({
      ...state,
      head: 'd'.repeat(40),
      parent: A,
      subject: releaseCommitSubject('0.3.0'),
    });
    expect(r).toEqual({ ok: true, prepared: true });
    expect(
      cutStart({
        ...state,
        head: 'd'.repeat(40),
        parent: A,
        subject: 'fix: outro',
      }).ok,
    ).toBe(false);
  });

  it('Dado o prepare que não versionou, Então recusa; com a versão da branch, segue', () => {
    expect(checkPreparedVersion('0.3.0', '0.3.0')).toEqual({ ok: true });
    const r = checkPreparedVersion('0.3.0', '0.2.0');
    expect(!r.ok && r.reason).toContain('não versionou');
  });
});

describe('Feature: TESTE-ALTERADO consolidado do lote (ADR-071)', () => {
  it('Dado o log da release, Então acha os PRs squash e de merge, sem repetir', () => {
    expect(
      prNumbersFromSubjects([
        'feat(agenda): filtro (#538)',
        'Merge pull request #566 from KalleoPinheiro/release/v0.2.0',
        'chore(release): v0.3.0',
        'fix: x (#538)',
        'docs: y (#12) ',
      ]),
    ).toEqual([12, 538, 566]);
  });

  it('Dado PRs com e sem motivo, Então junta numa linha só que o check:testes aceita', () => {
    const line = consolidatedTesteAlterado([
      {
        number: 538,
        body: 'texto\nTESTE-ALTERADO: o filtro da agenda passou a esconder canceladas; regra nova\n',
      },
      { number: 539, body: 'sem motivo' },
      {
        number: 541,
        body: 'TESTE-ALTERADO: o fuso passou a ser o da clínica (APP_TIMEZONE)',
      },
    ]);
    expect(line).toBe(
      'TESTE-ALTERADO: #538 o filtro da agenda passou a esconder canceladas, regra nova; #541 o fuso passou a ser o da clínica (APP_TIMEZONE)',
    );
    expect(findReason(line ?? '')).not.toBeNull();
  });

  it('Dado nenhum PR com motivo, Então não há linha', () => {
    expect(
      consolidatedTesteAlterado([{ number: 1, body: 'TESTE-ALTERADO: curto' }]),
    ).toBeNull();
    expect(consolidatedTesteAlterado([])).toBeNull();
  });
});

describe('Feature: worktree e PR da release (ADR-071)', () => {
  it('Então o worktree fica ao lado do clone, nunca dentro', () => {
    expect(worktreePath('/home/k/projects/estomasystech', '0.3.0')).toBe(
      '/home/k/projects/estomasystech-cut-v0.3.0',
    );
  });

  it('Dado o recibo do gate da release, Então o corpo do PR passa no recibo-gate e traz o lote e o TESTE-ALTERADO', () => {
    const receipt = formatReceipt({
      sha: A,
      passed: true,
      e2eTests: 320,
      steps: [...REQUIRED_STEPS, 'docker', 'backup'],
      skipped: [],
      minutes: 42,
    });
    const body = releasePrBody({
      version: '0.3.0',
      receipt,
      prs: [538, 541],
      testeAlterado: 'TESTE-ALTERADO: #538 motivo de negócio bem explicado',
    });
    expect(body).toContain('Release v0.3.0');
    expect(body).toContain('Lote: #538, #541.');
    expect(body).toContain('homologacao/v0.3.0');
    expect(
      body
        .trimEnd()
        .endsWith('TESTE-ALTERADO: #538 motivo de negócio bem explicado'),
    ).toBe(true);
    expect(
      verifyReceipt(body, A, ['src/domain/a.ts'], 'release/v0.3.0'),
    ).toMatchObject({ ok: true });
    expect(checkHomologacao(body, ['src/domain/a.ts'])).toEqual({ ok: true });
  });

  it('Dado lote sem PR identificado e sem motivo, Então o corpo diz isso e não tem TESTE-ALTERADO', () => {
    const body = releasePrBody({
      version: '0.3.0',
      receipt: 'E2E-GATE: x',
      prs: [],
      testeAlterado: null,
    });
    expect(body).toContain('nenhum PR identificado no log');
    expect(body).not.toContain('TESTE-ALTERADO');
    expect(body.endsWith('\n')).toBe(true);
  });
});

describe('Feature: GATE-ALTERADO do lote no corte (#845)', () => {
  it('Dado PRs com e sem GATE-ALTERADO, Então junta numa linha só que o check:testes aceita', () => {
    const line = consolidatedGateAlterado([
      {
        number: 814,
        body: 'texto\nGATE-ALTERADO: o limite de complexidade cognitiva passou a valer em src/; regra nova\n',
      },
      { number: 815, body: 'sem motivo' },
      {
        number: 833,
        body: 'GATE-ALTERADO: o timeout do job de mutação passou de 45 para 120 minutos',
      },
    ]);
    expect(line).toBe(
      'GATE-ALTERADO: #814 o limite de complexidade cognitiva passou a valer em src/, regra nova; #833 o timeout do job de mutação passou de 45 para 120 minutos',
    );
    expect(findGateReason(line ?? '')).not.toBeNull();
  });

  it('Dado motivo curto ou nenhum PR, Então não há linha', () => {
    expect(
      consolidatedGateAlterado([{ number: 1, body: 'GATE-ALTERADO: curto' }]),
    ).toBeNull();
    expect(consolidatedGateAlterado([])).toBeNull();
  });

  it('Dado o TESTE-ALTERADO de um PR, Então o consolidado do gate o ignora', () => {
    expect(
      consolidatedGateAlterado([
        {
          number: 2,
          body: 'TESTE-ALTERADO: um motivo de negócio bem explicado',
        },
      ]),
    ).toBeNull();
  });

  it('Dado as duas linhas, Então os argumentos do check-test-integrity levam --motivo e --motivo-gate sem o rótulo', () => {
    expect(
      integrityArgs(
        'TESTE-ALTERADO: #1 motivo de teste bem explicado',
        'GATE-ALTERADO: #2 motivo de gate bem explicado',
      ),
    ).toEqual([
      '--motivo',
      '#1 motivo de teste bem explicado',
      '--motivo-gate',
      '#2 motivo de gate bem explicado',
    ]);
    expect(
      integrityArgs(null, 'GATE-ALTERADO: #2 motivo de gate bem explicado'),
    ).toEqual(['--motivo-gate', '#2 motivo de gate bem explicado']);
    expect(
      integrityArgs('TESTE-ALTERADO: #1 motivo de teste bem explicado', null),
    ).toEqual(['--motivo', '#1 motivo de teste bem explicado']);
    expect(integrityArgs(null, null)).toEqual([]);
  });

  it('Dado uma linha rotulada, Então motivoSemRotulo devolve só o texto, e null vira vazio', () => {
    expect(motivoSemRotulo('GATE-ALTERADO: abc def', 'GATE-ALTERADO')).toBe(
      'abc def',
    );
    expect(motivoSemRotulo('TESTE-ALTERADO:   abc', 'TESTE-ALTERADO')).toBe(
      'abc',
    );
    expect(motivoSemRotulo(null, 'GATE-ALTERADO')).toBe('');
  });

  it('Dado o GATE-ALTERADO do lote, Então o corpo do PR release → main o repete ao final', () => {
    const body = releasePrBody({
      version: '0.3.0',
      receipt: 'E2E-GATE: x',
      prs: [814],
      testeAlterado: 'TESTE-ALTERADO: #538 motivo de negócio bem explicado',
      gateAlterado: 'GATE-ALTERADO: #814 motivo do gate bem explicado',
    });
    expect(
      body
        .trimEnd()
        .endsWith(
          'TESTE-ALTERADO: #538 motivo de negócio bem explicado\n\nGATE-ALTERADO: #814 motivo do gate bem explicado',
        ),
    ).toBe(true);
    expect(findGateReason(body)).toBe('#814 motivo do gate bem explicado');
  });

  it('Dado só o GATE-ALTERADO, Então o corpo não ganha linhas em branco sobrando antes dele', () => {
    const body = releasePrBody({
      version: '0.3.0',
      receipt: 'x',
      prs: [],
      testeAlterado: null,
      gateAlterado: 'GATE-ALTERADO: #814 motivo do gate bem explicado',
    });
    expect(body).not.toContain('\n\n\n');
    expect(
      body
        .trimEnd()
        .endsWith('\n\nGATE-ALTERADO: #814 motivo do gate bem explicado'),
    ).toBe(true);
  });

  it('Dado lote sem GATE-ALTERADO, Então o corpo não o traz', () => {
    const body = releasePrBody({
      version: '0.3.0',
      receipt: 'x',
      prs: [],
      testeAlterado: null,
      gateAlterado: null,
    });
    expect(body).not.toContain('GATE-ALTERADO');
    const semCampo = releasePrBody({
      version: '0.3.0',
      receipt: 'x',
      prs: [],
      testeAlterado: null,
    });
    expect(semCampo).not.toContain('GATE-ALTERADO');
  });
});
