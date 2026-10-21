import { describe, expect, it } from 'vitest';
import {
  assertStagingMfaFlagSafe,
  stagingMfaDisabled,
} from '@/lib/runtime-env';
import { startRuntimeGuards } from '@/lib/runtime-guards';

describe('Feature: Staging sem segundo fator (ADR-054)', () => {
  describe('Cenário: stagingMfaDisabled', () => {
    it('Dado staging com STAGING_DISABLE_MFA=true, Então dispensa o 2FA', () => {
      expect(
        stagingMfaDisabled({ APP_ENV: 'staging', STAGING_DISABLE_MFA: 'true' }),
      ).toBe(true);
    });

    it.each(['production', 'preview', 'development'])(
      'Dado %s com STAGING_DISABLE_MFA=true, Então o 2FA continua exigido',
      (appEnv) => {
        expect(
          stagingMfaDisabled({
            APP_ENV: appEnv,
            STAGING_DISABLE_MFA: 'true',
          }),
        ).toBe(false);
      },
    );

    it('Dado staging sem a variável ou com outro valor, Então o 2FA continua exigido', () => {
      expect(stagingMfaDisabled({ APP_ENV: 'staging' })).toBe(false);
      expect(
        stagingMfaDisabled({ APP_ENV: 'staging', STAGING_DISABLE_MFA: '1' }),
      ).toBe(false);
    });

    it('Dado produção implícita (NODE_ENV=production) com a variável, Então o 2FA continua exigido', () => {
      expect(
        stagingMfaDisabled({
          NODE_ENV: 'production',
          STAGING_DISABLE_MFA: 'true',
        }),
      ).toBe(false);
    });
  });

  describe('Cenário: o boot recusa a variável fora da staging', () => {
    it.each(['production', 'preview', 'development'])(
      'Dado %s com STAGING_DISABLE_MFA=true, Então o boot lança',
      async (appEnv) => {
        const env = { APP_ENV: appEnv, STAGING_DISABLE_MFA: 'true' };

        expect(() => assertStagingMfaFlagSafe(env)).toThrow(
          'STAGING_DISABLE_MFA só pode ficar ligado na staging.',
        );
        await expect(startRuntimeGuards(env)).rejects.toThrow(
          'STAGING_DISABLE_MFA',
        );
      },
    );

    it('Dado staging com a variável, ou produção sem ela, Então o boot segue', () => {
      expect(() =>
        assertStagingMfaFlagSafe({
          APP_ENV: 'staging',
          STAGING_DISABLE_MFA: 'true',
        }),
      ).not.toThrow();
      expect(() =>
        assertStagingMfaFlagSafe({ APP_ENV: 'production' }),
      ).not.toThrow();
    });
  });
});
