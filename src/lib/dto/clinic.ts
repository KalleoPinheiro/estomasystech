import type { Clinic } from '@/domain/clinic/clinic';

/** Dados cadastrais da clínica — cabeçalho/rodapé de documentos emitidos (#61/#62). */
export interface ClinicInfoDto {
  name: string;
  cnpj: string | null;
  address: string | null;
  city: string | null;
  professionalName: string | null;
  professionalRegistry: string | null;
}

export const toClinicInfoDto = (clinic: Clinic): ClinicInfoDto => ({
  name: clinic.name,
  cnpj: clinic.cnpj,
  address: clinic.address,
  city: clinic.city,
  professionalName: clinic.professionalName,
  professionalRegistry: clinic.professionalRegistry,
});
