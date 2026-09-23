import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { Invoice } from '@/domain/billing/invoice';
import { SessionPackage } from '@/domain/billing/package';
import { NotFoundError } from '@/domain/shared/errors';
import { Money } from '@/domain/shared/money';
import { getRepositories } from '@/infrastructure/container';
import { handleRequest } from '@/lib/api-response';
import { requireStaffSession } from '@/lib/auth/require-session';
import { sessionScope, writeScope } from '@/lib/auth/tenant-scope';

const createSchema = z.object({
  patientId: z.string().min(1),
  procedureId: z.string().min(1),
  totalSessions: z.number().int().min(1).max(100),
  priceCents: z.number().int().min(0).max(1_000_000_000),
  /** Validade opcional (COMP3-07). */
  expiresAt: z.iso.datetime().nullish(),
});

const toPackageDto = (pkg: SessionPackage, procedureName?: string) => ({
  id: pkg.id,
  patientId: pkg.patientId,
  procedureId: pkg.procedureId,
  procedureName,
  totalSessions: pkg.totalSessions,
  usedSessions: pkg.usedSessions,
  remainingSessions: pkg.remainingSessions,
  priceCents: pkg.priceCents,
  expiresAt: pkg.expiresAt?.toISOString() ?? null,
  active: pkg.isActive,
  createdAt: pkg.createdAt.toISOString(),
});

export async function GET(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const patientId = request.nextUrl.searchParams.get('patientId');
    if (!patientId) {
      return [];
    }
    const { sessionPackages, procedures } = await getRepositories(
      sessionScope(guard.session),
    );
    const packages = await sessionPackages.findByPatientId(patientId);
    const catalog = await procedures.findAll();
    const nameById = new Map(catalog.map((p) => [p.id, p.name]));
    return packages.map((pkg) =>
      toPackageDto(pkg, nameById.get(pkg.procedureId)),
    );
  });
}

export async function POST(request: NextRequest) {
  const guard = requireStaffSession(request);
  if (!guard.ok) return guard.response;

  return handleRequest(async () => {
    const body = createSchema.parse(await request.json());
    const { sessionPackages, patients, procedures, invoices } =
      await getRepositories(writeScope(guard.session));

    const [patient, procedure] = await Promise.all([
      patients.findById(body.patientId),
      procedures.findById(body.procedureId),
    ]);
    if (!patient) {
      throw new NotFoundError('Paciente', body.patientId);
    }
    if (!procedure) {
      throw new NotFoundError('Procedimento', body.procedureId);
    }

    const pkg = SessionPackage.create({
      ...body,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    });
    await sessionPackages.save(pkg);

    // Venda do pacote fatura uma única vez; as sessões consomem saldo (O3.3).
    const invoice = Invoice.create({
      patientId: pkg.patientId,
      appointmentId: null,
      description: `Pacote: ${procedure.name} (${pkg.totalSessions} sessões)`,
      amount: Money.fromCents(pkg.priceCents),
    });
    await invoices.save(invoice);

    return toPackageDto(pkg, procedure.name);
  });
}
