import { Layout, Prose } from '@still-void/ui/react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { GENERIC_CONTROLLER, renderLegalText } from '@/lib/legal-text';
import { PRIVACY_NOTICE_TEXT } from '@/lib/privacy-notice-text';

export const metadata: Metadata = {
  title: 'Aviso de privacidade — VittaFlow',
};

/**
 * Aviso de privacidade público (LGPD, art. 9º; #216, ADR-030). Sem login não
 * se sabe de qual clínica é o visitante, então o aviso nomeia "a clínica onde
 * você se atende"; a versão com CNPJ e encarregado da clínica está no portal.
 */
export default function PrivacyNoticePage() {
  return (
    <Layout className="max-w-3xl">
      <main className="flex flex-col gap-4 py-8">
        <BrandLogo />
        <Prose className="whitespace-pre-wrap text-sm">
          {renderLegalText(PRIVACY_NOTICE_TEXT, GENERIC_CONTROLLER)}
        </Prose>
        <p className="text-sm">
          <Link href="/login" className="text-accent-ink hover:underline">
            Voltar ao login
          </Link>
        </p>
      </main>
    </Layout>
  );
}
