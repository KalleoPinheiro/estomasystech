import { describe, expect, it, vi } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import { DEFAULT_SCHEDULE_CONFIG } from '@/domain/scheduling/schedule-config';
import { getRepositories } from '@/infrastructure/container';
import { UnavailablePhotoStorage } from '@/infrastructure/storage/unavailable-photo-storage';
import { hashPassword } from '@/lib/auth/password';
import type { Session } from '@/lib/auth/session';
import { clinicScope } from '@/lib/auth/tenant-scope';
import { closuresUrl, closuresWindow } from '@/lib/closures-window';
import {
  listAccountsFor,
  loadCalendarStatus,
  loadClinicSettings,
  loadEmailChannel,
  loadOwnAccountView,
  loadScheduleSettings,
  ownAccountView,
} from '@/lib/server/data/settings';
import {
  prefetchSettings,
  SECTION_QUERIES,
} from '@/lib/server/data/settings-prefetch';
import { CLINIC_A_ID, ensureTestClinics } from '../../support/clinics';
import {
  clearEmailChannels,
  saveEmailChannel,
} from '../../support/email-channel';
import { jsonRequest } from '../../support/request';
import { cookieHeaderFor } from '../../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';

const session = (
  role: Session['role'] = 'company_admin',
  subject = 'admin@clinica.com',
): Session =>
  ({ role, subject, clinicId: CLINIC_A_ID, professionalId: null }) as Session;

const viaRoute = async (
  path: string,
  role: Session['role'] = 'company_admin',
) => {
  const response = await fetchRoute(path, role);
  return ((await response.json()) as { data: unknown }).data;
};

async function fetchRoute(path: string, role: Session['role']) {
  const headers = cookieHeaderFor(role, 'admin@clinica.com', CLINIC_A_ID);
  const request = jsonRequest(path, 'GET', undefined, headers);
  if (path.startsWith('/api/settings/clinic-info')) {
    return (await import('@/app/api/settings/clinic-info/route')).GET(request);
  }
  if (path.startsWith('/api/settings/schedule')) {
    return (await import('@/app/api/settings/schedule/route')).GET(request);
  }
  if (path.startsWith('/api/settings/email-channel')) {
    return (await import('@/app/api/settings/email-channel/route')).GET(
      request,
    );
  }
  if (path.startsWith('/api/settings/calendar-integration')) {
    return (await import('@/app/api/settings/calendar-integration/route')).GET(
      request,
    );
  }
  return (await import('@/app/api/accounts/route')).GET(request);
}

describe('Feature: dados de Configurações e Minha conta lidos no servidor (#557)', () => {
  it('Dado a clínica, Quando lê pela camada de dados, Então é a mesma resposta da rota', async () => {
    await ensureTestClinics();
    const expected = {
      '/api/settings/clinic-info': await loadClinicSettings(session()),
      '/api/settings/schedule': await loadScheduleSettings(session()),
      '/api/settings/email-channel': await loadEmailChannel(session()),
      '/api/settings/calendar-integration': await loadCalendarStatus(session()),
      '/api/accounts': await listAccountsFor(session()),
    };

    for (const [path, data] of Object.entries(expected)) {
      expect(JSON.parse(JSON.stringify(data)), path).toEqual(
        await viaRoute(path),
      );
    }
  });

  it('Dado uma sessão de clínica que não existe, Quando lê o cadastro, Então falha em vez de devolver vazio', async () => {
    await ensureTestClinics();
    const ghost = {
      ...session(),
      clinicId: '00000000-0000-4000-8000-0000000000ff',
    } as Session;

    await expect(loadClinicSettings(ghost)).rejects.toThrow(
      'Clínica não encontrada',
    );
  });

  it('Dado conta ativa, Quando lê Minha conta, Então traz e-mail, papel e segundo fator; conta ausente vira null', async () => {
    await ensureTestClinics();
    const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
    await userAccounts.save(
      UserAccount.create({
        email: 'conta-557@a.test',
        passwordHash: await hashPassword('senha-segura-557'),
        role: 'atendente',
        clinicId: CLINIC_A_ID,
      }),
    );

    const view = await loadOwnAccountView(
      session('atendente', 'conta-557@a.test'),
    );

    expect(view).toMatchObject({
      email: 'conta-557@a.test',
      role: 'atendente',
      mfa: { enrolled: false },
    });
    expect(
      await loadOwnAccountView(session('atendente', 'ninguem@a.test')),
    ).toBeNull();
  });

  it('Dado o Admin, Quando pré-lê cada seção, Então entrega só as URLs que ela consulta', async () => {
    await ensureTestClinics();
    const now = new Date('2026-11-15T12:00:00Z');
    const urls = async (slug: string) =>
      Object.keys(await prefetchSettings(session(), slug, now)).sort();

    expect(await urls('dados')).toEqual(['/api/settings/clinic-info']);
    expect(await urls('identidade')).toEqual([
      '/api/auth/identity',
      '/api/settings/clinic-info',
    ]);
    expect(await urls('horarios')).toEqual(['/api/settings/schedule']);
    expect(await urls('feriados')).toEqual(
      [closuresUrl(closuresWindow(now)), '/api/options/professionals'].sort(),
    );
    expect(await urls('google-agenda')).toEqual([
      '/api/settings/calendar-integration',
    ]);
    expect(await urls('email')).toEqual(['/api/settings/email-channel']);
    expect(await urls('contas')).toEqual([
      '/api/accounts',
      '/api/professionals',
      '/api/settings/email-channel',
    ]);
    expect(await urls('inexistente')).toEqual([]);
    expect(Object.keys(SECTION_QUERIES)).toContain('minha-conta');
  });

  it('Dado Atendente e Profissional, Quando pré-lê, Então não lê dado que o papel não pode usar', async () => {
    await ensureTestClinics();
    for (const role of ['atendente', 'profissional'] as const) {
      expect(await prefetchSettings(session(role), 'dados')).toEqual({});
      expect(await prefetchSettings(session(role), 'horarios')).toEqual({});
      expect(await prefetchSettings(session(role), 'email')).toEqual({});
      expect(
        await prefetchSettings(session(role), 'contas'),
      ).not.toHaveProperty('/api/professionals');
      expect(
        Object.keys(await prefetchSettings(session(role), 'feriados')),
      ).toHaveLength(2);
    }
  });

  it('Dado conta inativa ou falha de leitura, Quando pré-lê, Então a consulta fica de fora e o cliente a busca', async () => {
    await ensureTestClinics();
    expect(
      await prefetchSettings(
        session('atendente', 'ninguem@a.test'),
        'minha-conta',
      ),
    ).toEqual({});

    const repositories = await import('@/infrastructure/container');
    const spy = vi
      .spyOn(repositories, 'getRepositories')
      .mockRejectedValue(new Error('banco fora'));
    try {
      expect(await prefetchSettings(session(), 'dados')).toEqual({});
    } finally {
      spy.mockRestore();
    }
  });

  it('Dado conta Google conectada, Quando lê o status, Então traz e-mail e data da conexão', async () => {
    const repositories = await import('@/infrastructure/container');
    const connectedAt = new Date('2026-11-01T10:00:00Z');
    const spy = vi.spyOn(repositories, 'getRepositories').mockResolvedValue({
      googleAccounts: {
        findMostRecent: async () => ({
          email: 'agenda@clinica.com',
          connectedAt,
        }),
      },
    } as never);
    try {
      expect(await loadCalendarStatus(session())).toMatchObject({
        connected: true,
        email: 'agenda@clinica.com',
        connectedAt: connectedAt.toISOString(),
      });
    } finally {
      spy.mockRestore();
    }
  });

  it('Dado conta com foto e armazenamento disponível, Quando monta a visão, Então traz a foto e não marca o envio como indisponível', async () => {
    const account = UserAccount.create({
      email: 'foto@a.test',
      passwordHash: await hashPassword('senha-segura-557'),
      role: 'atendente',
      clinicId: CLINIC_A_ID,
    }).withAvatarKey('avatars/foto.png');
    const services = {
      mfa: { findFactor: async () => ({ id: 'f1' }) },
      photoStorage: {},
    } as never;

    const view = await ownAccountView(account, services);

    expect(view.avatarUrl).toContain(account.id);
    expect(view).not.toHaveProperty('imageUploadAvailable');
    expect(view.mfa.enrolled).toBe(true);

    const withoutStorage = await ownAccountView(account, {
      mfa: { findFactor: async () => null },
      photoStorage: new UnavailablePhotoStorage('sem armazenamento no teste'),
    } as never);
    expect(withoutStorage.imageUploadAvailable).toBe(false);
  });

  it('Dado canal de e-mail gravado, Quando lê, Então devolve o canal sem a chave', async () => {
    await ensureTestClinics();
    await saveEmailChannel(CLINIC_A_ID, 're_chave_secreta_557');

    try {
      const { channel } = await loadEmailChannel(session());

      expect(channel?.sender).toContain(CLINIC_A_ID);
      expect(JSON.stringify(channel)).not.toContain('re_chave_secreta_557');
    } finally {
      await clearEmailChannels();
    }
  });

  it('Dado a clínica, Quando lê o cadastro, Então traz o cadastro e a identidade com logo, tema e envio de imagem', async () => {
    await ensureTestClinics();

    const settings = await loadClinicSettings(session());

    expect(settings.info.name).toBeTruthy();
    expect(settings.identity).toMatchObject({
      logoUrl: null,
      imageUploadAvailable: expect.any(Boolean),
      theme: { mode: expect.any(String), accent: expect.any(String) },
    });
  });

  it('Dado grade nunca salva e depois salva, Quando lê, Então marca o padrão e depois a grade gravada', async () => {
    await ensureTestClinics();
    const { scheduleConfig } = await getRepositories(clinicScope(CLINIC_A_ID));
    const before = await scheduleConfig.get();

    if (before === null) {
      const standard = await loadScheduleSettings(session());
      expect(standard).toEqual({
        config: DEFAULT_SCHEDULE_CONFIG,
        isDefault: true,
      });
    }
    const saved = { ...DEFAULT_SCHEDULE_CONFIG, startHour: 7, endHour: 19 };
    await scheduleConfig.save(saved);

    const view = await loadScheduleSettings(session());

    expect(view.isDefault).toBe(false);
    expect(view.config).toEqual(saved);
  });

  it('Dado Google configurado ou não e sem conta, Quando lê o status, Então reflete o ambiente e vem desconectado', async () => {
    await ensureTestClinics();
    const keep = {
      id: process.env.GOOGLE_CLIENT_ID,
      secret: process.env.GOOGLE_CLIENT_SECRET,
      url: process.env.APP_URL,
    };
    try {
      process.env.GOOGLE_CLIENT_ID = '';
      expect(await loadCalendarStatus(session())).toEqual({
        configured: false,
        connected: false,
        email: null,
        connectedAt: null,
      });

      process.env.GOOGLE_CLIENT_ID = 'id';
      process.env.GOOGLE_CLIENT_SECRET = 'segredo';
      process.env.APP_URL = 'https://app.clinica.test';
      expect(await loadCalendarStatus(session())).toEqual({
        configured: true,
        connected: false,
        email: null,
        connectedAt: null,
      });
    } finally {
      for (const [name, value] of [
        ['GOOGLE_CLIENT_ID', keep.id],
        ['GOOGLE_CLIENT_SECRET', keep.secret],
        ['APP_URL', keep.url],
      ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it('Dado o Admin, Quando pré-lê, Então cada URL traz o valor lido e a seção de privacidade e Minha conta consultam o que precisam', async () => {
    await ensureTestClinics();
    const now = new Date('2026-11-15T12:00:00Z');

    const dados = await prefetchSettings(session(), 'dados', now);
    expect(dados['/api/settings/clinic-info']).toMatchObject({
      info: { name: expect.any(String) },
    });
    const feriados = await prefetchSettings(session(), 'feriados', now);
    expect(feriados[closuresUrl(closuresWindow(now))]).toEqual([]);
    expect(
      Object.keys(await prefetchSettings(session(), 'privacidade', now)),
    ).toEqual(['/api/settings/clinic-info']);
    expect(
      await prefetchSettings(
        session('atendente', 'ninguem@a.test'),
        'minha-conta',
      ),
    ).toEqual({});
    const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
    await userAccounts.save(
      UserAccount.create({
        email: 'prefetch-557@a.test',
        passwordHash: await hashPassword('senha-segura-557'),
        role: 'atendente',
        clinicId: CLINIC_A_ID,
      }),
    );
    const own = await prefetchSettings(
      session('atendente', 'prefetch-557@a.test'),
      'minha-conta',
    );
    expect(own['/api/me']).toMatchObject({ email: 'prefetch-557@a.test' });
    expect(
      await prefetchSettings(session('atendente'), 'google-agenda'),
    ).toEqual({});
  });

  it('Dado falha de leitura, Quando pré-lê, Então registra qual consulta falhou', async () => {
    await ensureTestClinics();
    const logging = await import('@/lib/log-error');
    const logged = vi.spyOn(logging, 'logError').mockImplementation(() => {});
    const repositories = await import('@/infrastructure/container');
    const spy = vi
      .spyOn(repositories, 'getRepositories')
      .mockRejectedValue(new Error('banco fora'));
    try {
      await prefetchSettings(session(), 'dados');
      expect(logged).toHaveBeenCalledWith(
        'Configurações: falha ao ler /api/settings/clinic-info no servidor',
        expect.any(Error),
      );
    } finally {
      spy.mockRestore();
      logged.mockRestore();
    }
  });

  it('Dado um instante, Quando monta a janela, Então vai de hoje a 400 dias no fuso da clínica', () => {
    const window = closuresWindow(new Date('2026-11-15T12:00:00Z'));

    expect(window).toEqual({ from: '2026-11-15', to: '2027-12-20' });
    expect(closuresUrl(window)).toBe(
      '/api/settings/schedule/closures?from=2026-11-15&to=2027-12-20',
    );
  });
});
