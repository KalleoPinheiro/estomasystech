/**
 * Texto-base do TCLE de tratamento (O4.1, #216, ADR-030). O hash SHA-256 deste
 * texto — com os marcadores `{{...}}` da clínica, sem interpolar — é gravado
 * no aceite: qualquer alteração aqui invalida os aceites anteriores (o
 * paciente aceita de novo), e trocar os dados da clínica não. Por isso texto e
 * versão mudam sempre juntos. A autorização de imagem é outro termo
 * (`image-consent-text.ts`), aceito à parte.
 *
 * Texto redigido sem revisão jurídica (`LEGAL_REVIEW_PENDING`).
 */
export const CONSENT_TEXT_VERSION = 'v3';

export const CONSENT_TEXT = `TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO: TRATAMENTO (${CONSENT_TEXT_VERSION})

Clínica: {{CLINICA_NOME}}, CNPJ {{CLINICA_CNPJ}}
Encarregado pelos dados: {{ENCARREGADO_NOME}}, {{ENCARREGADO_CONTATO}}

1. Sobre o tratamento
Declaro que fui informado(a), de forma clara e em linguagem que entendi, sobre a natureza,
os objetivos, os benefícios esperados, os riscos possíveis e as alternativas dos cuidados de
estomaterapia propostos a mim: avaliação e tratamento de feridas, cuidados com estomias,
curativos, desbridamento quando indicado, orientações e acompanhamento. Entendo que os
resultados dependem também do meu cuidado em casa e que não há garantia de cura.

2. Dúvidas e liberdade de decidir
Tive a oportunidade de fazer perguntas e elas foram respondidas. Sei que posso recusar ou
interromper o tratamento a qualquer momento, sem punição e sem perder o direito ao
atendimento, e que a decisão sobre cada procedimento é minha.

3. Meus dados de saúde
Autorizo a clínica a registrar e usar meus dados pessoais e de saúde (anamnese, evolução,
avaliações, medidas e documentos clínicos) para cuidar de mim, manter o meu prontuário pelo
prazo exigido em lei (20 anos) e emitir os documentos que eu pedir, nos termos da Lei Geral
de Proteção de Dados (Lei nº 13.709/2018). O Aviso de Privacidade da clínica explica quem
trata os dados, por quanto tempo e quais são os meus direitos, e me foi apresentado antes
deste aceite.

4. O que este termo não autoriza
Este termo não autoriza o registro ou o uso de fotos (termo próprio, aceito à parte), nem o
compartilhamento dos meus dados clínicos com o médico que me indicou (termo próprio, aceito
à parte). Posso recusar esses dois termos e continuar a ser atendido(a).

5. Retirada do consentimento
Posso retirar este consentimento a qualquer momento, pelo portal ou pedindo à equipe. A
retirada vale daí em diante e não desfaz o que já foi feito. Entendo que a clínica pode
precisar guardar o prontuário já registrado, porque a lei obriga (LGPD, art. 16, I).

6. Menores e pessoas que não podem decidir por si
Se o paciente tiver menos de 18 anos ou não puder decidir sozinho, este termo é assinado
pelo pai, pela mãe ou pelo responsável legal, que declara ter essa condição.`;
