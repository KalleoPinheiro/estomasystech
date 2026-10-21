import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { UserAccount } from '@/domain/auth/user-account';
import type { UserRole } from '@/domain/auth/user-role';
import { getRepositories } from '@/infrastructure/container';
import { clinicScope } from '@/lib/auth/tenant-scope';
import {
  CLINIC_A_ID,
  CLINIC_B_ID,
  ensureClinic,
  ensureTestClinics,
} from '../support/clinics';
import { jsonRequest, multipartRequest } from '../support/request';
import { cookieHeaderFor } from '../support/session';

process.env.ESTOMASYSTECH_DB_DRIVER = 'pglite';
process.env.UPLOADS_DIR = mkdtempSync(path.join(tmpdir(), 'identity-'));

interface Envelope<T> {
  success: boolean;
  data: T;
  error: string | null;
}

const png = () =>
  sharp({ create: { width: 64, height: 64, channels: 3, background: '#09f' } })
    .png()
    .toBuffer();

const svgOk =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="#0a8f7a"/></svg>';
const svgEvil =
  '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.cookie)"><script>alert(1)</script></svg>';

const upload = (
  url: string,
  data: Uint8Array | string,
  headers: Record<string, string>,
  type = 'image/png',
) => {
  const form = new FormData();
  form.set('file', new File([data as BlobPart], 'arquivo', { type }));
  return multipartRequest(url, form, headers);
};

const admin = (clinicId = CLINIC_A_ID) =>
  cookieHeaderFor('company_admin', 'admin-logo@a.test', clinicId);
const atendente = (clinicId = CLINIC_A_ID) =>
  cookieHeaderFor('atendente', 'atendente-logo@a.test', clinicId);

const logoRoute = () => import('@/app/api/settings/clinic-logo/route');
const logoGetRoute = () => import('@/app/api/clinic/logo/route');
const avatarRoute = () => import('@/app/api/account/avatar/route');
const avatarGet = () => import('@/app/api/account/avatar/[id]/route');

const getLogo = async (headers: Record<string, string>, extra = {}) =>
  (await logoGetRoute()).GET(
    new NextRequest('http://localhost/api/clinic/logo', {
      headers: { ...headers, ...extra },
    }),
  );

const envelope = async <T>(response: Response) =>
  (await response.json()) as Envelope<T>;

const INVALID_CLINIC = 'clinic-logo-invalid';

beforeAll(async () => {
  await ensureTestClinics();
  await ensureClinic(INVALID_CLINIC);
});

describe('Feature: Logo da clínica (#427)', () => {
  describe('Cenário: o Admin envia uma imagem raster', () => {
    it('Dado um PNG, Quando o Admin envia, Então a logo é guardada como WebP e entregue com cabeçalhos seguros', async () => {
      const route = await logoRoute();

      const response = await route.POST(
        upload('/api/settings/clinic-logo', await png(), admin()),
      );
      const body = await envelope<{ logoUrl: string }>(response);

      expect(response.status).toBe(200);
      expect(body.data.logoUrl).toMatch(
        /^\/api\/clinic\/logo\?v=logo-.*-webp$/,
      );

      const served = await getLogo(atendente());
      expect(served.status).toBe(200);
      expect(served.headers.get('content-type')).toBe('image/webp');
      expect(served.headers.get('x-content-type-options')).toBe('nosniff');
      expect(served.headers.get('content-security-policy')).toBe(
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      );
      expect(
        (await sharp(Buffer.from(await served.arrayBuffer())).metadata())
          .format,
      ).toBe('webp');
    });

    it('Dada a logo já entregue, Quando o navegador revalida com o ETag, Então 304 sem corpo', async () => {
      const first = await getLogo(admin());
      const etag = first.headers.get('etag') as string;

      const again = await getLogo(admin(), { 'if-none-match': etag });

      expect(again.status).toBe(304);
      expect(await again.text()).toBe('');
    });

    it('Dada a logo enviada, Quando consultar Configurações e a identidade do menu, Então os endereços aparecem', async () => {
      const settings = await (
        await import('@/app/api/settings/clinic-info/route')
      ).GET(
        jsonRequest('/api/settings/clinic-info', 'GET', undefined, admin()),
      );
      const identity = await (
        await import('@/app/api/auth/identity/route')
      ).GET(jsonRequest('/api/auth/identity', 'GET', undefined, admin()));

      const body = await envelope<{
        identity: { logoUrl: string; imageUploadAvailable: boolean };
      }>(settings);
      expect(body.data.identity.logoUrl).toMatch(/^\/api\/clinic\/logo\?v=/);
      expect(body.data.identity.imageUploadAvailable).toBe(true);
      expect(
        (await envelope<{ clinicLogoUrl: string }>(identity)).data
          .clinicLogoUrl,
      ).toMatch(/^\/api\/clinic\/logo\?v=/);
    });

    it('Dada logo antiga, Quando o Admin envia outra, Então o endereço muda (cache não serve a antiga)', async () => {
      const route = await logoRoute();
      const first = await envelope<{ logoUrl: string }>(
        await route.POST(
          upload('/api/settings/clinic-logo', await png(), admin()),
        ),
      );
      const second = await envelope<{ logoUrl: string }>(
        await route.POST(
          upload('/api/settings/clinic-logo', await png(), admin()),
        ),
      );

      expect(second.data.logoUrl).not.toBe(first.data.logoUrl);
    });
  });

  describe('Cenário: SVG', () => {
    it('Dado um SVG limpo, Quando o Admin envia, Então é entregue como image/svg+xml, reconstruído', async () => {
      const route = await logoRoute();
      await route.POST(
        upload('/api/settings/clinic-logo', svgOk, admin(), 'image/svg+xml'),
      );

      const served = await getLogo(admin());

      expect(served.headers.get('content-type')).toBe('image/svg+xml');
      expect(served.headers.get('x-content-type-options')).toBe('nosniff');
      expect(served.headers.get('content-security-policy')).toContain(
        'sandbox',
      );
      expect(await served.text()).toContain(
        '<rect width="1" height="1" fill="#0a8f7a"/>',
      );
    });

    it('Dado um SVG com script e onload, Quando o Admin envia, Então 400 com erro claro e a logo anterior segue', async () => {
      const route = await logoRoute();
      const before = (await getLogo(admin())).headers.get('etag');

      const response = await route.POST(
        upload('/api/settings/clinic-logo', svgEvil, admin(), 'image/svg+xml'),
      );
      const body = await envelope<null>(response);

      expect(response.status).toBe(400);
      expect(body.error).toMatch(/^SVG não aceito: /);
      expect((await getLogo(admin())).headers.get('etag')).toBe(before);
    });

    it('Dado um SVG enviado como se fosse PNG, Quando o Admin envia, Então o tipo real vale (sanitiza igual)', async () => {
      const route = await logoRoute();

      const response = await route.POST(
        upload('/api/settings/clinic-logo', svgEvil, admin(), 'image/png'),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('Cenário: arquivo inválido', () => {
    it('Dado arquivo maior que 5 MB, Quando enviar, Então 400', async () => {
      const response = await (await logoRoute()).POST(
        upload(
          '/api/settings/clinic-logo',
          new Uint8Array(5 * 1024 * 1024 + 1),
          admin(INVALID_CLINIC),
        ),
      );

      expect(response.status).toBe(400);
      expect((await envelope<null>(response)).error).toBe(
        'Imagem excede o limite de 5 MB',
      );
    });

    it('Dado HTML com Content-Type de imagem, Quando enviar, Então 400 de formato', async () => {
      const response = await (await logoRoute()).POST(
        upload(
          '/api/settings/clinic-logo',
          '<html><script>alert(1)</script></html>',
          admin(INVALID_CLINIC),
        ),
      );

      expect(response.status).toBe(400);
      expect((await envelope<null>(response)).error).toMatch(
        /Formato de imagem não suportado/,
      );
    });

    it('Dado um HEIC, Quando enviar, Então 400 com a orientação para o iPhone', async () => {
      const heic = new Uint8Array([
        0,
        0,
        0,
        24,
        ...new TextEncoder().encode('ftypheic'),
        0,
        0,
        0,
        0,
      ]);

      const response = await (await logoRoute()).POST(
        upload(
          '/api/settings/clinic-logo',
          heic,
          admin(INVALID_CLINIC),
          'image/heic',
        ),
      );

      expect((await envelope<null>(response)).error).toMatch(
        /HEIC não é aceito/,
      );
    });

    it('Dado PNG corrompido, Quando enviar, Então 400 "corrompida"', async () => {
      const broken = (await png()).subarray(0, 30);

      const response = await (await logoRoute()).POST(
        upload('/api/settings/clinic-logo', broken, admin(INVALID_CLINIC)),
      );

      expect((await envelope<null>(response)).error).toBe(
        'Imagem corrompida ou ilegível',
      );
    });

    it('Dada requisição sem o campo file, Quando enviar, Então 400', async () => {
      const response = await (await logoRoute()).POST(
        multipartRequest(
          '/api/settings/clinic-logo',
          new FormData(),
          admin(INVALID_CLINIC),
        ),
      );

      expect(response.status).toBe(400);
    });
  });

  describe('Cenário: quem pode o quê', () => {
    it('Dado um Atendente, Quando enviar ou remover a logo, Então 403', async () => {
      const route = await logoRoute();

      const post = await route.POST(
        upload('/api/settings/clinic-logo', await png(), atendente()),
      );
      const del = await route.DELETE(
        new NextRequest('http://localhost/api/settings/clinic-logo', {
          method: 'DELETE',
          headers: atendente(),
        }),
      );

      expect([post.status, del.status]).toEqual([403, 403]);
    });

    it('Dada requisição sem sessão, Quando ler ou enviar, Então 401', async () => {
      const route = await logoRoute();
      const getRoute = await logoGetRoute();

      const get = await getRoute.GET(
        new NextRequest('http://localhost/api/clinic/logo'),
      );
      const post = await route.POST(
        new NextRequest('http://localhost/api/settings/clinic-logo', {
          method: 'POST',
          body: new FormData(),
        }),
      );

      expect([get.status, post.status]).toEqual([401, 401]);
    });

    it('Dada sessão de paciente, Quando ler a logo, Então 403', async () => {
      const response = await getLogo(
        cookieHeaderFor('patient', 'p@x.test', CLINIC_A_ID),
      );

      expect(response.status).toBe(403);
    });

    it('Dada a logo da clínica A, Quando a clínica B pedir a dela, Então 404 (nunca a da A)', async () => {
      const response = await getLogo(admin(CLINIC_B_ID));

      expect(response.status).toBe(404);
    });
  });

  describe('Cenário: remover', () => {
    it('Dada uma logo, Quando o Admin remove, Então a entrega vira 404 e fica na trilha', async () => {
      const route = await logoRoute();

      const response = await route.DELETE(
        new NextRequest('http://localhost/api/settings/clinic-logo', {
          method: 'DELETE',
          headers: admin(),
        }),
      );

      expect(
        (await envelope<{ logoUrl: null }>(response)).data.logoUrl,
      ).toBeNull();
      expect((await getLogo(admin())).status).toBe(404);
      await new Promise((resolve) => setTimeout(resolve, 20));
      const { auditEvents } = await getRepositories(clinicScope(CLINIC_A_ID));
      const events = await auditEvents.findAll({ resourceType: 'clinic-logo' });
      expect(events.map((e) => e.detail)).toEqual(
        expect.arrayContaining(['logo enviada', 'logo removida']),
      );
    });

    it('Dada clínica sem logo, Quando remover, Então segue 200 (idempotente)', async () => {
      const response = await (await logoRoute()).DELETE(
        new NextRequest('http://localhost/api/settings/clinic-logo', {
          method: 'DELETE',
          headers: admin(),
        }),
      );

      expect(response.status).toBe(200);
    });
  });

  describe('Cenário: limite de envios', () => {
    it('Dado o 11º envio no mesmo minuto, Quando o Admin enviar, Então 429', async () => {
      const clinicId = await ensureClinic('clinic-logo-rate');
      const route = await logoRoute();
      const data = await png();

      const statuses: number[] = [];
      for (let i = 0; i < 11; i += 1) {
        statuses.push(
          (
            await route.POST(
              upload('/api/settings/clinic-logo', data, admin(clinicId)),
            )
          ).status,
        );
      }

      expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
      expect(statuses[10]).toBe(429);
    });
  });
});

let seq = 0;
const seedAccount = async (
  role: UserRole = 'atendente',
  clinicId = CLINIC_A_ID,
  active = true,
) => {
  const { userAccounts } = await getRepositories(clinicScope(clinicId));
  let account = UserAccount.create({
    email: `avatar-${++seq}@${clinicId}.test`,
    passwordHash: 'scrypt$x',
    role,
    clinicId,
  });
  if (!active) account = account.deactivate();
  await userAccounts.save(account);
  return account;
};
const as = (account: UserAccount) =>
  cookieHeaderFor(account.role, account.email, account.clinicId);

const getAvatar = async (id: string, headers: Record<string, string>) =>
  (await avatarGet()).GET(
    new NextRequest(`http://localhost/api/account/avatar/${id}`, { headers }),
    { params: Promise.resolve({ id }) },
  );

describe('Feature: Avatar da equipe (#427)', () => {
  describe('Cenário: a pessoa envia o próprio avatar', () => {
    it('Dada uma conta da equipe, Quando envia um PNG, Então a colega da mesma clínica o vê como WebP', async () => {
      const ana = await seedAccount();
      const bia = await seedAccount('profissional');

      const response = await (await avatarRoute()).POST(
        upload('/api/account/avatar', await png(), as(ana)),
      );
      const body = await envelope<{ avatarUrl: string }>(response);

      expect(body.data.avatarUrl).toBe(
        `/api/account/avatar/${ana.id}?v=${new URL(body.data.avatarUrl, 'http://x').searchParams.get('v')}`,
      );
      const served = await getAvatar(ana.id, as(bia));
      expect(served.status).toBe(200);
      expect(served.headers.get('content-type')).toBe('image/webp');
      expect(served.headers.get('content-security-policy')).toContain(
        'sandbox',
      );
    });

    it('Dado o avatar enviado, Quando consultar Minha conta e a identidade, Então ambos trazem o endereço', async () => {
      const ana = await seedAccount();
      await (await avatarRoute()).POST(
        upload('/api/account/avatar', await png(), as(ana)),
      );

      const me = await (await import('@/app/api/me/route')).GET(
        new NextRequest('http://localhost/api/me', { headers: as(ana) }),
      );
      const identity = await (
        await import('@/app/api/auth/identity/route')
      ).GET(jsonRequest('/api/auth/identity', 'GET', undefined, as(ana)));

      expect(
        (await envelope<{ avatarUrl: string }>(me)).data.avatarUrl,
      ).toContain(`/api/account/avatar/${ana.id}`);
      expect(
        (await envelope<{ account: { avatarUrl: string } }>(identity)).data
          .account.avatarUrl,
      ).toContain(`/api/account/avatar/${ana.id}`);
    });

    it('Dado um SVG malicioso, Quando a pessoa envia, Então 400 e nada é guardado', async () => {
      const ana = await seedAccount();

      const response = await (await avatarRoute()).POST(
        upload('/api/account/avatar', svgEvil, as(ana), 'image/svg+xml'),
      );

      expect(response.status).toBe(400);
      expect((await getAvatar(ana.id, as(ana))).status).toBe(404);
    });

    it('Dado um SVG limpo, Quando a pessoa envia, Então é entregue como SVG', async () => {
      const ana = await seedAccount();
      await (await avatarRoute()).POST(
        upload('/api/account/avatar', svgOk, as(ana), 'image/svg+xml'),
      );

      const served = await getAvatar(ana.id, as(ana));

      expect(served.headers.get('content-type')).toBe('image/svg+xml');
    });

    it('Dado arquivo grande, Quando enviar, Então 400; sem o campo file, 400', async () => {
      const ana = await seedAccount();
      const route = await avatarRoute();

      const big = await route.POST(
        upload(
          '/api/account/avatar',
          new Uint8Array(5 * 1024 * 1024 + 1),
          as(ana),
        ),
      );
      const none = await route.POST(
        multipartRequest('/api/account/avatar', new FormData(), as(ana)),
      );

      expect([big.status, none.status]).toEqual([400, 400]);
    });

    it('Dado o 11º envio no minuto, Quando enviar, Então 429', async () => {
      const ana = await seedAccount();
      const route = await avatarRoute();
      const data = await png();

      const statuses: number[] = [];
      for (let i = 0; i < 11; i += 1) {
        statuses.push(
          (await route.POST(upload('/api/account/avatar', data, as(ana))))
            .status,
        );
      }

      expect(statuses[10]).toBe(429);
    });
  });

  describe('Cenário: só equipe, só da própria clínica, só conta ativa', () => {
    it('Dada uma conta de paciente, Quando tentar enviar avatar, Então 403 (paciente nunca, #376)', async () => {
      const response = await (await avatarRoute()).POST(
        upload(
          '/api/account/avatar',
          await png(),
          cookieHeaderFor('patient', 'p@x.test', CLINIC_A_ID),
        ),
      );

      expect(response.status).toBe(403);
    });

    it('Dada requisição sem sessão, Quando enviar, ler ou remover, Então 401', async () => {
      const route = await avatarRoute();

      const post = await route.POST(
        new NextRequest('http://localhost/api/account/avatar', {
          method: 'POST',
          body: new FormData(),
        }),
      );
      const del = await route.DELETE(
        new NextRequest('http://localhost/api/account/avatar', {
          method: 'DELETE',
        }),
      );
      const get = await getAvatar('x', {});

      expect([post.status, del.status, get.status]).toEqual([401, 401, 401]);
    });

    it('Dado o avatar da clínica A, Quando a equipe da B pedir, Então 404', async () => {
      const ana = await seedAccount();
      await (await avatarRoute()).POST(
        upload('/api/account/avatar', await png(), as(ana)),
      );
      const intruso = await seedAccount('atendente', CLINIC_B_ID);

      expect((await getAvatar(ana.id, as(intruso))).status).toBe(404);
    });

    it('Dada conta desativada com avatar, Quando a colega pedir, Então 404', async () => {
      const ana = await seedAccount();
      const bia = await seedAccount();
      await (await avatarRoute()).POST(
        upload('/api/account/avatar', await png(), as(ana)),
      );
      const { userAccounts } = await getRepositories(clinicScope(CLINIC_A_ID));
      await userAccounts.save(ana.deactivate());

      expect((await getAvatar(ana.id, as(bia))).status).toBe(404);
    });

    it('Dada conta sem avatar ou inexistente, Quando pedir, Então 404', async () => {
      const ana = await seedAccount();

      expect((await getAvatar(ana.id, as(ana))).status).toBe(404);
      expect((await getAvatar('nao-existe', as(ana))).status).toBe(404);
    });
  });

  describe('Cenário: remover', () => {
    it('Dado um avatar, Quando a pessoa remove, Então a entrega vira 404', async () => {
      const ana = await seedAccount();
      await (await avatarRoute()).POST(
        upload('/api/account/avatar', await png(), as(ana)),
      );

      const response = await (await avatarRoute()).DELETE(
        new NextRequest('http://localhost/api/account/avatar', {
          method: 'DELETE',
          headers: as(ana),
        }),
      );

      expect(
        (await envelope<{ avatarUrl: null }>(response)).data.avatarUrl,
      ).toBeNull();
      expect((await getAvatar(ana.id, as(ana))).status).toBe(404);
    });
  });
});

describe('Feature: Armazenamento de imagens indisponível (#427)', () => {
  it('Dado ambiente sem bucket (Vercel), Quando enviar logo ou avatar, Então 503 com orientação e o aviso sobe para a tela', async () => {
    const saved = {
      vercel: process.env.VERCEL,
      storage: process.env.PHOTO_STORAGE,
    };
    process.env.VERCEL = '1';
    process.env.PHOTO_STORAGE = '';
    try {
      const clinicId = await ensureClinic('clinic-sem-bucket');
      const ana = await seedAccount('atendente', clinicId);
      const logo = await (await logoRoute()).POST(
        upload('/api/settings/clinic-logo', await png(), admin(clinicId)),
      );
      const avatar = await (await avatarRoute()).POST(
        upload('/api/account/avatar', await png(), as(ana)),
      );
      const settings = await (
        await import('@/app/api/settings/clinic-info/route')
      ).GET(
        jsonRequest(
          '/api/settings/clinic-info',
          'GET',
          undefined,
          admin(clinicId),
        ),
      );
      const me = await (await import('@/app/api/me/route')).GET(
        new NextRequest('http://localhost/api/me', { headers: as(ana) }),
      );

      expect([logo.status, avatar.status]).toEqual([503, 503]);
      expect((await envelope<null>(logo)).error).toMatch(
        /armazenamento de imagens não está disponível/,
      );
      expect(
        (
          await envelope<{ identity: { imageUploadAvailable: boolean } }>(
            settings,
          )
        ).data.identity.imageUploadAvailable,
      ).toBe(false);
      expect(
        (await envelope<{ imageUploadAvailable: boolean }>(me)).data
          .imageUploadAvailable,
      ).toBe(false);
    } finally {
      if (saved.vercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = saved.vercel;
      if (saved.storage === undefined) delete process.env.PHOTO_STORAGE;
      else process.env.PHOTO_STORAGE = saved.storage;
    }
  });
});
