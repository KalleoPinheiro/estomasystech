import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/domain/shared/errors';
import {
  type ClinicDiagnosisCsvRow,
  parseClinicDiagnosisCsv,
} from '@/domain/taxonomy/clinic-diagnosis-csv';
import {
  ClinicNursingDiagnosis,
  type ClinicNursingDiagnosisProps,
} from '@/domain/taxonomy/clinic-nursing-diagnosis';
import type { ClinicNursingDiagnosisRepository } from '@/domain/taxonomy/taxonomy-repositories';

/** Lista do catálogo da clínica para a tela de Configurações (ativos e inativos). */
export class ListClinicDiagnoses {
  constructor(private readonly diagnoses: ClinicNursingDiagnosisRepository) {}

  execute(): Promise<ClinicNursingDiagnosis[]> {
    return this.diagnoses.list();
  }
}

/** Busca do plano de cuidados no catálogo da clínica: só itens ativos, por título ou código. */
export class SearchClinicDiagnoses {
  constructor(private readonly diagnoses: ClinicNursingDiagnosisRepository) {}

  execute(input: {
    term: string;
    limit?: number;
  }): Promise<ClinicNursingDiagnosis[]> {
    return this.diagnoses.search(input.term, { limit: input.limit });
  }
}

/** Cadastro de um diagnóstico pela clínica (#954). O mesmo título não entra duas vezes. */
export class CreateClinicDiagnosis {
  constructor(private readonly diagnoses: ClinicNursingDiagnosisRepository) {}

  async execute(
    input: ClinicNursingDiagnosisProps,
  ): Promise<ClinicNursingDiagnosis> {
    const diagnosis = ClinicNursingDiagnosis.create(input);
    const existing = await this.diagnoses.list();
    if (existing.some((item) => item.key === diagnosis.key)) {
      throw new ConflictError(
        `O diagnóstico "${diagnosis.label}" já está no catálogo da clínica`,
      );
    }
    await this.diagnoses.save(diagnosis);
    return diagnosis;
  }
}

/** Desativar tira o item da busca do plano; os planos que já o usam não mudam (o título fica no plano). */
export class SetClinicDiagnosisActive {
  constructor(private readonly diagnoses: ClinicNursingDiagnosisRepository) {}

  async execute(input: {
    id: string;
    active: boolean;
  }): Promise<ClinicNursingDiagnosis> {
    const diagnosis = await this.diagnoses.findById(input.id);
    if (!diagnosis) {
      throw new NotFoundError('Diagnóstico da clínica', input.id);
    }
    const updated = input.active
      ? diagnosis.reactivate()
      : diagnosis.deactivate();
    await this.diagnoses.save(updated);
    return updated;
  }
}

export interface ClinicDiagnosisImportIssue {
  line: number;
  message: string;
}

export interface ImportClinicDiagnosesResult {
  created: ClinicNursingDiagnosis[];
  /** Título que já estava no catálogo ou repetido no próprio arquivo. */
  duplicates: ClinicDiagnosisImportIssue[];
  /** Linha recusada pela validação; as outras entram. */
  errors: ClinicDiagnosisImportIssue[];
}

function buildRow(
  clinicId: string,
  row: ClinicDiagnosisCsvRow,
): ClinicNursingDiagnosis | ClinicDiagnosisImportIssue {
  try {
    return ClinicNursingDiagnosis.create({ ...row, clinicId });
  } catch (error) {
    if (error instanceof ValidationError) {
      return { line: row.line, message: error.message };
    }
    throw error;
  }
}

/**
 * Importação CSV da lista que a clínica já usa (#954). O arquivo fica só no banco, no escopo da
 * empresa. Linha inválida não derruba o arquivo; título repetido é pulado, então reenviar o mesmo
 * arquivo corrigido não duplica nada.
 */
export class ImportClinicDiagnoses {
  constructor(private readonly diagnoses: ClinicNursingDiagnosisRepository) {}

  async execute(input: {
    clinicId: string;
    csv: string;
  }): Promise<ImportClinicDiagnosesResult> {
    const rows = parseClinicDiagnosisCsv(input.csv);
    const seen = new Set((await this.diagnoses.list()).map((item) => item.key));
    const result: ImportClinicDiagnosesResult = {
      created: [],
      duplicates: [],
      errors: [],
    };
    for (const row of rows) {
      const built = buildRow(input.clinicId, row);
      if (!(built instanceof ClinicNursingDiagnosis)) {
        result.errors.push(built);
      } else if (seen.has(built.key)) {
        result.duplicates.push({
          line: row.line,
          message: `"${built.label}" já está no catálogo`,
        });
      } else {
        seen.add(built.key);
        result.created.push(built);
      }
    }
    await this.diagnoses.saveMany(result.created);
    return result;
  }
}
