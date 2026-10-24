/**
 * Textos-base dos termos assinados pelo **representante legal** do paciente
 * menor ou que não pode decidir (#469, ADR-032): mesmo conteúdo dos termos do
 * próprio paciente (`consent-text.ts`, `image-consent-text.ts`), redigido em
 * nome de quem assina. Cada variante tem versão e hash próprios; o aceite do
 * representante cobre a variante dele, o do paciente adulto cobre a original.
 *
 * Texto redigido sem revisão jurídica (`LEGAL_REVIEW_PENDING`).
 */
export const CONSENT_REPRESENTATIVE_TEXT_VERSION = 'v3-representante';

export const CONSENT_REPRESENTATIVE_TEXT = `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO: TRATAMENTO, ASSINADO PELO REPRESENTANTE LEGAL (${CONSENT_REPRESENTATIVE_TEXT_VERSION})

Clínica: {{CLINICA_NOME}}, CNPJ {{CLINICA_CNPJ}}
Encarregado pelos dados: {{ENCARREGADO_NOME}}, {{ENCARREGADO_CONTATO}}

1. Sobre o tratamento
Na qualidade de pai, mãe ou responsável legal do(a) paciente, declaro que fui informado(a), de
forma clara e em linguagem que entendi, sobre a natureza, os objetivos, os benefícios
esperados, os riscos possíveis e as alternativas dos cuidados de estomaterapia propostos ao(à)
paciente: avaliação e tratamento de feridas, cuidados com estomias, curativos, desbridamento
quando indicado, orientações e acompanhamento. Entendo que os resultados dependem também do
cuidado em casa e que não há garantia de cura.

2. Dúvidas e liberdade de decidir
Tive a oportunidade de fazer perguntas e elas foram respondidas. Sei que posso recusar ou
interromper o tratamento do(a) paciente a qualquer momento, sem punição e sem que ele(a) perca
o direito ao atendimento, e que a decisão sobre cada procedimento cabe a mim, ouvido(a) o(a)
paciente sempre que possível.

3. Os dados de saúde do(a) paciente
Autorizo a clínica a registrar e usar os dados pessoais e de saúde do(a) paciente (anamnese,
evolução, avaliações, medidas e documentos clínicos) para cuidar dele(a), manter o prontuário
pelo prazo exigido em lei (20 anos) e emitir os documentos que eu pedir, nos termos da Lei
Geral de Proteção de Dados (Lei nº 13.709/2018). O Aviso de Privacidade da clínica explica quem
trata os dados, por quanto tempo e quais são os direitos do(a) paciente, e me foi apresentado
antes deste aceite.

4. O que este termo não autoriza
Este termo não autoriza o registro ou o uso de fotos (termo próprio, aceito à parte), nem o
compartilhamento dos dados clínicos do(a) paciente com o médico que o(a) indicou (termo
próprio, aceito à parte). Posso recusar esses dois termos e o(a) paciente continua a ser
atendido(a).

5. Retirada do consentimento
Posso retirar este consentimento a qualquer momento, pelo portal ou pedindo à equipe. A
retirada vale daí em diante e não desfaz o que já foi feito. Entendo que a clínica pode
precisar guardar o prontuário já registrado, porque a lei obriga (LGPD, art. 16, I).

6. Quem assina
Assino na condição de pai, mãe ou responsável legal do(a) paciente, que tem menos de 18 anos
ou não pode decidir sozinho(a), e declaro ter essa condição. Quando o(a) paciente completar 18
anos, ele(a) poderá confirmar este termo em nome próprio.`;
