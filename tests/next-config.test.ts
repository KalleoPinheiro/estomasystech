import { describe, expect, it } from 'vitest';
import { MAX_PHOTO_BYTES } from '@/domain/clinical/condition-photo';
import nextConfig, {
  PROXY_CLIENT_MAX_BODY_SIZE,
  SECURITY_HEADERS,
} from '../next.config';

describe('Feature: Headers de segurança do next.config (issue #219)', () => {
  it('Dado o next.config, Então não anuncia X-Powered-By', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('Dado o next.config, Então toda rota recebe COOP e CORP same-origin', async () => {
    const rules = await nextConfig.headers?.();
    expect(rules).toEqual([{ source: '/(.*)', headers: SECURITY_HEADERS }]);
    expect(SECURITY_HEADERS).toEqual(
      expect.arrayContaining([
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
      ]),
    );
  });
});

describe('Feature: Corpo máximo do proxy (issue #213)', () => {
  it('Dado o next.config, Então o limite cobre a foto de 5 MB e é menor que o padrão de 10 MB', () => {
    const limit = nextConfig.experimental?.proxyClientMaxBodySize;

    expect(limit).toBe(PROXY_CLIENT_MAX_BODY_SIZE);
    expect(PROXY_CLIENT_MAX_BODY_SIZE).toBe('6mb');
    expect(6 * 1024 * 1024).toBeGreaterThan(MAX_PHOTO_BYTES);
  });
});
