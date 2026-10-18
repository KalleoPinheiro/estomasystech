/**
 * Texto-base da autorização de imagem (fotos clínicas, #216, ADR-030):
 * aceite **separado** do TCLE de tratamento, exigido para o envio de foto
 * (PRO-RN-06). Mesmas regras de `consent-text.ts`: hash do texto-base, texto
 * e versão mudam juntos. Não há termo de uso didático ou de divulgação: a
 * clínica não usa foto fora do tratamento (ADR-030), e qualquer uso futuro
 * pede termo próprio.
 *
 * Texto redigido sem revisão jurídica (`LEGAL_REVIEW_PENDING`).
 */
export const IMAGE_CONSENT_TEXT_VERSION = 'v1';

export const IMAGE_CONSENT_TEXT = `TERMO DE AUTORIZAÇÃO DE IMAGEM: FOTOS CLÍNICAS (${IMAGE_CONSENT_TEXT_VERSION})

Clínica: {{CLINICA_NOME}}, CNPJ {{CLINICA_CNPJ}}
Encarregado pelos dados: {{ENCARREGADO_NOME}}, {{ENCARREGADO_CONTATO}}

1. O que autorizo
Autorizo a clínica a fotografar a região do meu corpo em tratamento (ferida, estomia e pele
ao redor), e a receber fotos que eu mesmo(a) enviar pelo portal, para acompanhar a evolução
do meu tratamento. Entendo que a foto, mesmo sem o rosto, é dado de saúde (Lei nº
13.709/2018).

2. Para que as fotos servem
Somente para: (a) comparar a evolução da lesão ao longo do tempo; (b) documentar o meu
prontuário; (c) discutir o meu caso com os profissionais da própria clínica que me atendem.

3. Para que as fotos NÃO servem
Não serão usadas para divulgação, redes sociais, publicidade, aulas, congressos ou
publicações. Qualquer uso fora do tratamento exige um termo próprio, que posso recusar.

4. Cuidados
As fotos são guardadas cifradas, ficam ligadas ao meu prontuário, têm os metadados (como
localização) removidos e só são vistas por quem cuida de mim. Quando o prazo de guarda do
prontuário acabar (20 anos), o arquivo da foto é apagado.

5. Retirada
Posso retirar esta autorização pelo portal ou pedindo à equipe. Depois da retirada, a clínica
não registra novas fotos e não aceita novos envios pelo portal. As fotos já registradas
fazem parte do prontuário e ficam guardadas pelo prazo legal, mas não serão usadas para mais
nada. A retirada não prejudica o meu atendimento.

6. Menores e pessoas que não podem decidir por si
Se o paciente tiver menos de 18 anos ou não puder decidir sozinho, quem assina é o pai, a
mãe ou o responsável legal.`;
