import { describe, expect, it } from 'vitest';
import nextConfig, { SECURITY_HEADERS } from '../next.config';

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
