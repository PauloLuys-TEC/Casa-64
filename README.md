# Casa 64

Escola de xadrez com 40 aberturas e 40 defesas, treino guiado no tabuleiro e tempo de prática por conta.

## Rodar no computador

Use Node.js 24 e execute `node scripts/local.mjs`. Abra http://127.0.0.1:4173. A edição local funciona sem dependências externas e guarda os dados em SQLite. Veja [o guia local](README-LOCAL.md).

## Conectar o Supabase na hospedagem

1. Crie ou selecione um projeto Supabase. Aplique [a migração SQL](supabase/migrations/20261124000000_casa64.sql) pelo SQL Editor ou pela CLI.
2. Configure `SUPABASE_URL` com o endereço HTTPS do projeto e `SUPABASE_SECRET_KEY` com a chave secreta nas variáveis protegidas da hospedagem. As duas variáveis são lidas pelo Worker.
3. Instale as dependências com `npm ci`, compile com `npm run build` e publique o Worker com os assets gerados. No Sites, configure as variáveis no painel do projeto antes da publicação.

O login da Casa 64 continua por usuário e senha. O servidor usa scrypt com sal por usuário, guarda o hash do token de sessão e exige autenticação para gravar o tempo. As tabelas do Supabase ficam em um esquema privado. Somente o papel `service_role` pode chamar a função que o Worker usa para acessar essas tabelas por HTTPS.

Mantenha a chave secreta no servidor. O banco local e o banco hospedado guardam dados separados.
