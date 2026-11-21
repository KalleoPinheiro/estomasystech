import { Alert, AlertDescription } from '@still-void/ui/react';
import Link from 'next/link';
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
  // Autônoma (#977): o documento é o CPF e o registro é o COREN dela.
  const subject =
    clinic.kind === 'individual'
      ? 'Cadastro sem CPF ou registro no conselho'
      : 'Clínica sem CNPJ ou responsável técnico';
  return (
    <Alert variant="danger" className="mb-4">
      <AlertDescription>
        {subject} cadastrados (falta: {missing}). Cadastre em{' '}
        <Link href="/configuracoes#dados" className="font-medium underline">
          Configurações → Dados cadastrais
        </Link>{' '}
        antes de emitir este documento.{' '}
        <Link href="/" className="font-medium underline">
          Voltar ao início
        </Link>
      </AlertDescription>
    </Alert>
  );
}
