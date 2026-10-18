import { RETENTION_YEARS } from '@/domain/retention/retention-policy';

/**
 * Aviso de privacidade (LGPD, art. 9º; #216, ADR-030). Informativo: não pede
 * aceite e não tem hash. Exibido em `/privacidade` (genérico, sem login) e no
 * portal do paciente (com os dados da clínica). Mudou o conteúdo, suba a
 * versão. Os prazos vêm de `RETENTION_YEARS` (fonte única, #323); o destino
 * dos dados espelha o ADR-018; mudou lá, muda aqui.
 *
 * Texto redigido sem revisão jurídica (`LEGAL_REVIEW_PENDING`).
 */
export const PRIVACY_NOTICE_VERSION = 'v3';

export const PRIVACY_NOTICE_TEXT = `AVISO DE PRIVACIDADE (${PRIVACY_NOTICE_VERSION})

1. Quem cuida dos seus dados
{{CLINICA_NOME}}, CNPJ {{CLINICA_CNPJ}}, com endereço em {{CLINICA_ENDERECO}}, é a controladora
dos seus dados pessoais: ela decide por que e como eles são usados. O sistema VittaFlow, que a
clínica usa para agenda e prontuário, atua como operador: trata os dados apenas para a clínica
e segundo as instruções dela.

Encarregado pelo tratamento de dados (canal para dúvidas e pedidos sobre seus dados):
{{ENCARREGADO_NOME}}, {{ENCARREGADO_CONTATO}}.

2. Que dados tratamos e para quê
- Cadastro: nome, telefone, e-mail (se você informar), data de nascimento, CPF (se necessário
  para o recibo), dados do responsável ou cuidador, quando houver. Finalidade: identificar
  você, agendar e confirmar consultas, avisar sobre horários e emitir documentos e recibos.
- Saúde: anamnese, evoluções, estomias e feridas, avaliações, medidas, fotos clínicas, planos
  de cuidado e documentos clínicos. Finalidade: prestar e acompanhar o seu tratamento e cumprir
  o dever legal de manter o prontuário.
- Financeiro: faturas e recebimentos. Finalidade: cobrança e obrigações fiscais.
- Acesso: e-mail de login do portal e registros de acesso e de alterações (data, hora, quem
  fez e o que foi feito, sem repetir o conteúdo clínico). Finalidade: segurança e prova de
  quem acessou o quê.

3. Por que podemos tratar seus dados (bases legais)
- Dados de saúde: tutela da saúde, em procedimento realizado por profissional de saúde ou
  serviço de saúde (LGPD, art. 11, II, "f"), e cumprimento de obrigação legal de manter o
  prontuário (art. 11, II, "a"; Lei nº 13.787/2018).
- Cadastro, agenda e financeiro: execução do contrato de prestação de serviços e cumprimento
  de obrigação legal (art. 7º, V e II).
- Fotos clínicas e compartilhamento com o médico que indicou você: somente com o seu
  consentimento específico, que você pode recusar ou retirar a qualquer momento (art. 11, I).
  Veja os termos de consentimento no portal.

4. Com quem compartilhamos
- Médico ou parceiro que indicou você: só se você der consentimento específico, e apenas
  consultas, condições e avaliações dos últimos 24 meses. Sem consentimento, ele só sabe que
  você foi atendido(a). Você pode retirar o consentimento a qualquer momento pelo portal ou
  pedindo à equipe.
- Prestadores que ajudam a operar o sistema (operadores): provedor de servidor e de cópia de
  segurança (Hetzner, Alemanha); serviço de envio de e-mail (Resend), que recebe seu e-mail e
  nome para convites e lembretes; e, somente se a clínica ativar a agenda do Google, o Google
  Agenda, que recebe apenas as iniciais do paciente, o horário e um link para a consulta.
- Autoridades: quando houver obrigação legal, ordem judicial ou pedido de autoridade de saúde.
- Não vendemos seus dados nem os usamos para publicidade.

5. Transferência internacional
Seus dados ficam em servidor na Alemanha (União Europeia). A transferência tem como base a
decisão de adequação entre o Brasil e a União Europeia (LGPD, art. 33, I), com as cláusulas-
padrão contratuais da ANPD como garantia de reserva. A cópia de segurança é cifrada antes de
sair do servidor. Os prestadores com sede fora da União Europeia (serviço de e-mail e, se
ativado, Google Agenda) recebem somente os dados descritos acima e só são usados com os
mecanismos do art. 33 da LGPD.

6. Por quanto tempo guardamos
- Prontuário e fotos clínicas: ${RETENTION_YEARS.clinicalRecord} anos após o último atendimento (Lei nº 13.787/2018); depois,
  os dados são anonimizados.
- Registros de acesso e de alterações: ${RETENTION_YEARS.auditTrail} anos; depois, anonimizados.
- Lista de espera e contas inativas: ${RETENTION_YEARS.waitlist} anos; depois, anonimizadas.
- Faturas e recibos: pelo prazo fiscal; valores e datas permanecem, e os dados pessoais são
  anonimizados junto com o cadastro.
- Cópias de segurança: 30 dias.
Anonimizar é remover o que identifica você, de modo que o dado não possa mais ser ligado à sua
pessoa.

7. Seus direitos (LGPD, art. 18)
Você pode, a qualquer momento: confirmar que tratamos seus dados; acessar e baixar uma cópia
(seção "Meus dados" do portal); pedir correção de dados incompletos ou desatualizados; pedir
anonimização ou eliminação de dados desnecessários ou tratados fora da lei; saber com quem
compartilhamos; retirar consentimentos; e reclamar à Autoridade Nacional de Proteção de Dados
(ANPD). Os pedidos de correção e eliminação são analisados pela clínica e respondidos em até 15
dias. Alguns dados não podem ser eliminados antes do prazo legal (por exemplo, o prontuário, de
guarda obrigatória por 20 anos); nesse caso explicamos o motivo.

8. Como protegemos
Acesso por conta pessoal, com perfis de permissão; dados clínicos cifrados no servidor; conexão
protegida; metadados das fotos (como localização) removidos; registro de quem acessa o
prontuário; cada clínica enxerga apenas os seus próprios dados.

9. Crianças, adolescentes e pessoas sob cuidado
Os dados de menores de 18 anos e de pessoas que não podem decidir por si são tratados no
melhor interesse delas, com o consentimento de um dos pais ou do responsável legal quando for
necessário. O paciente menor não tem acesso próprio ao portal: quem acessa é o pai, a mãe ou o
responsável legal, em nome dele, e o aceite dos termos fica registrado em nome de quem assinou.
Pelo menor, o representante também baixa a cópia dos dados, pede correção e autoriza ou revoga
o compartilhamento com o médico que o indicou; o pedido de eliminação é feito diretamente à
clínica. Quando o paciente faz 18 anos, a clínica é avisada para passar o acesso a ele. Os
aceites dados pelo representante valem até 90 dias depois dos 18 anos; depois disso, o
paciente precisa aceitar em nome próprio para que voltem a valer.

10. Mudanças neste aviso
Quando este aviso mudar de forma relevante, avisaremos pelo portal ou pelo e-mail que você
cadastrou. A versão em vigor é sempre a publicada no portal e em /privacidade.`;
