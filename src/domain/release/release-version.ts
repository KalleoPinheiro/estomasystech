import { ValidationError } from '@/domain/shared/errors';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const GIT_SHA = /^[0-9a-f]{7,40}$/i;
const MAX_NOTES = 500;

export const isSemver = (value: string): boolean => SEMVER.test(value);

/** Versão semver válida (`1.2.3`); recusa o resto para nunca gravar lixo no banco. */
export function parseReleaseVersion(value: string | undefined): string {
  const version = value?.trim() ?? '';
  if (!isSemver(version)) {
    throw new ValidationError(`Versão de release inválida: "${version}"`);
  }
  return version;
}

/** SHA hexadecimal de 7 a 40 caracteres, em minúsculas; qualquer outra coisa vira `null`. */
export function parseGitSha(value: string | undefined): string | null {
  const sha = value?.trim() ?? '';
  return GIT_SHA.test(sha) ? sha.toLowerCase() : null;
}

/** Nota curta e opcional: vazia vira `null` e o excesso é cortado. Nunca dado de paciente. */
export function parseReleaseNotes(value: string | undefined): string | null {
  const notes = value?.trim() ?? '';
  return notes === '' ? null : notes.slice(0, MAX_NOTES);
}
