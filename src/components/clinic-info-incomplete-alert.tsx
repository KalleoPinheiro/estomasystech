import { Alert, AlertDescription } from '@still-void/ui/react';
import type { ClinicInfoDto } from '@/components/document-frame';
import { missingClinicInfoFields } from '@/domain/clinic/clinic';

/**
 * Bloqueio dos documentos quando faltam dados cadastrais da clínica (#62,
 * #485): diz o que falta e leva direto para Configurações → Dados cadastrais,
 * sem deixar a pessoa num beco sem saída.
 */
export function ClinicInfoIncompleteAlert({
  clinic,
}: {
  clinic: ClinicInfoDto;
}) {
  const missing = missingClinicInfoFields(clinic).join(', ');
  return (
    <Alert variant="danger" className="mb-4">
      <AlertDescription>
        Clínica sem CNPJ ou responsável técnico cadastrados (falta: {missing}).
        Cadastre em{' '}
        <a href="/configuracoes#dados" className="font-medium underline">
          Configurações → Dados cadastrais
        </a>{' '}
        antes de emitir este documento.{' '}
        <a href="/" className="font-medium underline">
          Voltar ao início
        </a>
      </AlertDescription>
    </Alert>
  );
}
