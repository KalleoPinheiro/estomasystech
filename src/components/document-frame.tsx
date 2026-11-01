import type { ReactNode } from 'react';
import { IdentityImage } from '@/components/identity-image';
import {
  IssueDocument,
  IssuedDateLine,
  IssuedFootnote,
} from '@/components/issue-document';
import { DocumentActions } from '@/components/print-button';
import type { ClinicInfoDto } from '@/lib/dto';
import type { IssueDocumentInput } from '@/lib/server/document-issuance';

export type { ClinicInfoDto };

interface DocumentSignerOverride {
  name: string;
  registry?: string | null;
}

interface DocumentPatientSignature {
  name: string;
  /** Legenda abaixo da linha — default "Paciente". */
  roleLabel?: string;
  /** Linha em branco pra nome/CPF de quem assina por outra pessoa (#94, DOC-08). */
  legalGuardianLine?: boolean;
  /**
   * Responsável cadastrado na ficha (#329): o nome e o parentesco saem
   * impressos no lugar da linha em branco; o CPF segue para preenchimento.
   */
  legalGuardian?: { name: string; relationshipLabel: string };
}

interface DocumentFrameProps {
  clinic: ClinicInfoDto;
  title: string;
  children: ReactNode;
  /**
   * Documento a emitir pela ilha de emissão ao montar (#546, ADR-082): o número
   * e a data entram em espaço fixo e a emissão nunca acontece no render.
   */
  issue?: IssueDocumentInput;
  /**
   * Número/data de emissão persistidos (#94, DOC-01) quando o documento já foi
   * emitido (reimpressão) — nunca `new Date()` no render.
   */
  documentNumber?: string;
  issuedAt?: string;
  /**
   * Quando presente, a assinatura do paciente entra ANTES da assinatura do
   * profissional, na mesma ordem [data → paciente → profissional] — corrige a
   * ordem trocada do consentimento (#94, DOC-03).
   */
  patientSignature?: DocumentPatientSignature;
  /** Sobrescreve nome/registro da assinatura do profissional (#94, DOC-11). */
  signerOverride?: DocumentSignerOverride;
  /** Notas extras no rodapé (versão do termo, "duas vias", etc. — #94, DOC-10). */
  footerNote?: ReactNode;
}

function PatientSignatureBlock({
  signature,
}: {
  signature: DocumentPatientSignature;
}) {
  return (
    <div className="mb-10 flex flex-col items-center gap-1">
      <div className="mx-auto w-64 border-black border-t pt-1 text-center">
        {signature.name}
        <span className="block text-xs">
          {signature.roleLabel ?? 'Paciente'}
        </span>
      </div>
      {signature.legalGuardian ? (
        <p className="mt-2 text-xs">
          Responsável legal: {signature.legalGuardian.name} (
          {signature.legalGuardian.relationshipLabel}). CPF do responsável:
          ________________________________
        </p>
      ) : (
        signature.legalGuardianLine && (
          <p className="mt-2 text-xs">
            Nome e CPF do responsável legal, se aplicável:
            ________________________________
          </p>
        )
      )}
    </div>
  );
}

function DocumentFooter({
  clinic,
  patientSignature,
  signerOverride,
  footerNote,
}: {
  clinic: ClinicInfoDto;
  patientSignature?: DocumentPatientSignature;
  signerOverride?: DocumentSignerOverride;
  footerNote?: ReactNode;
}) {
  const signerName =
    signerOverride?.name ??
    clinic.professionalName ??
    'Assinatura do profissional';
  const signerRegistry =
    signerOverride?.registry ?? clinic.professionalRegistry;

  return (
    <footer className="mt-12">
      <IssuedDateLine city={clinic.city} />

      {patientSignature && (
        <PatientSignatureBlock signature={patientSignature} />
      )}

      <div className="mx-auto w-64 border-black border-t pt-1 text-center text-sm">
        {signerName}
        {signerRegistry && (
          <span className="block text-xs">{signerRegistry}</span>
        )}
      </div>

      {footerNote && <div className="mt-6 text-xs">{footerNote}</div>}

      <IssuedFootnote />
    </footer>
  );
}

/**
 * Moldura A4: cabeçalho da clínica, título, corpo e bloco de assinatura.
 * Componente de servidor (#546): só a barra de ações e o número/data da emissão
 * são ilhas de cliente.
 */
export function DocumentFrame({
  clinic,
  title,
  children,
  issue,
  documentNumber,
  issuedAt,
  patientSignature,
  signerOverride,
  footerNote,
}: DocumentFrameProps) {
  const initial =
    documentNumber && issuedAt ? { documentNumber, issuedAt } : null;

  return (
    <IssueDocument request={issue} initial={initial}>
      {/* A moldura imprime em papel: fundo branco e tinta preta são o alvo real,
          não o tema da tela. Por isso o corpo do documento usa `black` literal —
          cor neutra, não paleta — enquanto a barra de ações, que só existe na tela
          e some no `print:`, segue os tokens do design system. */}
      <div className="text-black">
        <DocumentActions />

        <header className="mb-8 border-black border-b-2 pb-4 text-center">
          {clinic.logoUrl && (
            <div className="mb-2 flex justify-center">
              <IdentityImage
                kind="logo"
                url={clinic.logoUrl}
                name={clinic.name}
                size={64}
              />
            </div>
          )}
          <h1 className="font-bold text-xl">{clinic.name}</h1>
          {clinic.cnpj && <p className="text-sm">CNPJ: {clinic.cnpj}</p>}
          {clinic.address && <p className="text-sm">{clinic.address}</p>}
        </header>

        <h2 className="mb-6 text-center font-bold text-lg uppercase">
          {title}
        </h2>

        <div className="text-sm leading-relaxed">{children}</div>

        <DocumentFooter
          clinic={clinic}
          patientSignature={patientSignature}
          signerOverride={signerOverride}
          footerNote={footerNote}
        />
      </div>
    </IssueDocument>
  );
}
