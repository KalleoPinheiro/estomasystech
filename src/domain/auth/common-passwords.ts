/**
 * Senhas comuns recusadas pela política da equipe (#291). Lista embutida, sem
 * chamada externa (decisão do dono, 2026-10-11): só entradas com 10 ou mais
 * caracteres — as menores já caem no tamanho mínimo. Reúne as mais frequentes
 * das listas públicas de vazamentos (sequências de teclado, `password…`,
 * `iloveyou…`) e variações em português (`senha…`, `mudar…`, nomes de clínica e
 * de times). Tudo em minúsculas: a comparação ignora maiúsculas.
 */
const LIST = `
0123456789 1234567890 0987654321 9876543210 12345678910 123456789a 123456789q
1234567890a 1234567890q a123456789 q123456789 1111111111 0000000000 2222222222
1212121212 1122334455 1234512345 1234567891 1234554321 1029384756 1q2w3e4r5t
1q2w3e4r5t6y 1qaz2wsx3edc qwertyuiop qwertyuiop1 qwerty1234 qwerty12345
qwerty123456 1234qwerty 123qweasd 123qweasdzxc qweasdzxc123 zaq12wsxcde
zxcvbnm123 asdfghjkl1 asdfghjkl123 abcdefghij abc1234567 abcd123456
abcde12345 abcdef1234 aaaaaaaaaa password12 password123 password1234
password12345 passw0rd123 p@ssw0rd123 p@ssword123 mypassword passwordpassword
administrator admin12345 admin123456 admin@1234 administrador iloveyou12
iloveyou123 sunshine123 football123 baseball123 basketball superman123
princess123 starwars123 trustno1234 welcome123 welcome1234 changeme123
letmein123 qwerty@123 monkey12345 dragon12345 master12345 shadow12345
michael123 jennifer123 charlie123 whatever123 computer123 internet123
senha12345 senha123456 senha1234567 senhasenha senha@1234 senha@12345
minhasenha minhasenha1 minhasenha123 novasenha123 mudar12345 mudar123456
mudarsenha trocarsenha trocar1234 alterar123 acesso1234 acesso12345
entrar1234 brasil1234 brasil12345 brasil2024 brasil2025 brasil2026
flamengo123 flamengo1234 corinthians palmeiras123 saopaulo123 vasco12345
gremio12345 cruzeiro123 internacional fluminense botafogo123 santos12345
clinica123 clinica1234 clinica12345 vittaflow vittaflow1 vittaflow123 estomasystech estomasystech1 estomasystech123
vitta12345 estomaterapia enfermagem enfermeira123 enfermeiro123
atendimento recepcao123 recepcao1234 consultorio consultorio1 paciente123
saude12345 jesuscristo jesus12345 deusefiel deuseamor deusefiel1
deuseamor1 amorzinho1 teamo12345 eusouforte familia123 felicidade
batatinha123 mudarsenha1 1234567890senha senha1234567890
`;

export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(
  LIST.split(/\s+/).filter((entry) => entry.length >= 10),
);
