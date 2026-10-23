/**
 * Autorização de imagem assinada pelo **representante legal** (#469, ADR-032):
 * variante de `image-consent-text.ts` redigida em nome de quem assina, com
 * versão e hash próprios. Mesmas regras: texto e versão mudam juntos.
 *
 * Texto redigido sem revisão jurídica (`LEGAL_REVIEW_PENDING`).
 */
export const IMAGE_CONSENT_REPRESENTATIVE_TEXT_VERSION = 'v1-representante';

export const IMAGE_CONSENT_REPRESENTATIVE_TEXT = `TERMO DE AUTORIZAÇÃO DE IMAGEM: FOTOS CLÍNICAS, ASSINADO PELO REPRESENTANTE LEGAL (${IMAGE_CONSENT_REPRESENTATIVE_TEXT_VERSION})

Clínica: {{CLINICA_NOME}}, CNPJ {{CLINICA_CNPJ}}
Encarregado pelos dados: {{ENCARREGADO_NOME}}, {{ENCARREGADO_CONTATO}}

1. O que autorizo
Na qualidade de pai, mãe ou responsável legal do(a) paciente, autorizo a clínica a fotografar
a região do corpo dele(a) em tratamento (ferida, estomia e pele ao redor), e a receber fotos
enviadas pelo portal, para acompanhar a evolução do tratamento. Entendo que a foto, mesmo sem o
rosto, é dado de saúde (Lei nº 13.709/2018).

2. Para que as fotos servem
Somente para: (a) comparar a evolução da lesão ao longo do tempo; (b) documentar o prontuário
do(a) paciente; (c) discutir o caso com os profissionais da própria clínica que o(a) atendem.

3. Para que as fotos NÃO servem
Não serão usadas para divulgação, redes sociais, publicidade, aulas, congressos ou
publicações. Qualquer uso fora do tratamento exige um termo próprio, que posso recusar.

4. Cuidados
As fotos são guardadas cifradas, ficam ligadas ao prontuário do(a) paciente, têm os metadados
(como localização) removidos e só são vistas por quem cuida dele(a). Quando o prazo de guarda do
prontuário acabar (20 anos), o arquivo da foto é apagado.

5. Retirada
Posso retirar esta autorização pelo portal ou pedindo à equipe. Depois da retirada, a clínica
não registra novas fotos e não aceita novos envios pelo portal. As fotos já registradas fazem
parte do prontuário e ficam guardadas pelo prazo legal, mas não serão usadas para mais nada. A
retirada não prejudica o atendimento do(a) paciente.

6. Quem assina
Assino na condição de pai, mãe ou responsável legal do(a) paciente, que tem menos de 18 anos
ou não pode decidir sozinho(a), e declaro ter essa condição. Quando o(a) paciente completar 18
anos, ele(a) poderá confirmar esta autorização em nome próprio.`;
