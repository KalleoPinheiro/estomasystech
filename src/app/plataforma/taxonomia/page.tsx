import { PageHeader } from '@/components/page-header';
import { TaxonomyImport } from './taxonomy-import';

/** Taxonomia (C4, #267): o catálogo é global e a tela não lê nada; a importação é uma ilha de cliente. */
export default function PlatformTaxonomyPage() {
  return (
    <>
      <PageHeader title="Taxonomia" />
      <TaxonomyImport />
    </>
  );
}
