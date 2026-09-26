'use client';

import { Button, Icon } from '@still-void/ui/react';
import type { ReactNode } from 'react';
import { appTimeZone } from '@/domain/shared/time-zone';
import type { ClinicInfoDto } from '@/lib/dto';

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
}

interface DocumentFrameProps {
  clinic: ClinicInfoDto;
  title: string;
  children: ReactNode;
  /** Número/data de emissão persistidos (#94, DOC-01) — nunca `new Date()` no render. */
  documentNumber: string;
  issuedAt: string;
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
      {signature.legalGuardianLine && (
        <p className="mt-2 text-xs">
          Nome e CPF do responsável legal, se aplicável:
          ________________________________
        </p>
      )}
    </div>
  );
}

function DocumentFooter({
  clinic,
  documentNumber,
  dateLabel,
  timeLabel,
  patientSignature,
  signerOverride,
  footerNote,
}: {
  clinic: ClinicInfoDto;
  documentNumber: string;
  dateLabel: string;
  timeLabel: string;
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
      <p className="mb-10 text-sm">
        {clinic.city ? `${clinic.city}, ` : ''}
        {dateLabel}, {timeLabel}.
      </p>

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

      <p className="mt-6 text-xs">
        Documento nº {documentNumber} — gerado eletronicamente em {dateLabel},{' '}
        {timeLabel}, sem necessidade de assinatura manuscrita para validade
        administrativa.
      </p>
    </footer>
  );
}

/** Moldura A4: cabeçalho da clínica, título, corpo e bloco de assinatura. */
export function DocumentFrame({
  clinic,
  title,
  children,
  documentNumber,
  issuedAt,
  patientSignature,
  signerOverride,
  footerNote,
}: DocumentFrameProps) {
  const issuedDate = new Date(issuedAt);
  const dateLabel = issuedDate.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: appTimeZone(),
  });
  // Fuso explícito (#205): documento impresso nunca herda o fuso do processo.
  const timeLabel = issuedDate.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: appTimeZone(),
  });

  return (
    /* A moldura imprime em papel: fundo branco e tinta preta são o alvo real,
       não o tema da tela. Por isso o corpo do documento usa `black` literal —
       cor neutra, não paleta — enquanto a barra de ações, que só existe na tela
       e some no `print:`, segue os tokens do design system. */
    <div className="text-black">
      <div className="mb-6 flex items-center justify-between border-border border-b pb-4 print:hidden">
        <Button
          type="button"
          variant="link"
          onClick={() => window.history.back()}
        >
          <Icon name="chevron-left" /> Voltar
        </Button>
        <Button type="button" onClick={() => window.print()}>
          Imprimir / salvar PDF
        </Button>
      </div>

      <header className="mb-8 border-black border-b-2 pb-4 text-center">
        <h1 className="font-bold text-xl">{clinic.name}</h1>
        {clinic.cnpj && <p className="text-sm">CNPJ: {clinic.cnpj}</p>}
        {clinic.address && <p className="text-sm">{clinic.address}</p>}
      </header>

      <h2 className="mb-6 text-center font-bold text-lg uppercase">{title}</h2>

      <div className="text-sm leading-relaxed">{children}</div>

      <DocumentFooter
        clinic={clinic}
        documentNumber={documentNumber}
        dateLabel={dateLabel}
        timeLabel={timeLabel}
        patientSignature={patientSignature}
        signerOverride={signerOverride}
        footerNote={footerNote}
      />
    </div>
  );
}
