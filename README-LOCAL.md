# Casa 64 no seu computador

Use o Node.js 24 ou mais recente. Extraia a pasta completa do projeto, abra um terminal nela e execute

```sh
node scripts/local.mjs
```

Abra [a escola local](http://127.0.0.1:4173), escolha **Criar conta** e depois selecione **Aberturas** ou **Defesas**. Use sempre o mesmo endereço para manter sua sessão. O cadastro, as 80 lições e o registro de tempo funcionam sem conexão com a internet. O lançador usa apenas recursos incluídos no Node.js.

Mantenha o terminal aberto enquanto estuda. Pressione **Ctrl+C** para encerrar. Para mudar a porta no PowerShell, execute `$env:PORT = '4174'` antes de iniciar o servidor e use a porta escolhida no navegador.

## Onde ficam os dados

Contas e tempos de estudo ficam em `.sites-runtime/local/casa64.sqlite`. Para fazer backup, encerre o servidor e copie a pasta `.sites-runtime/local` inteira. Guarde essa cópia em local privado.

O lançador atende apenas neste computador. A hospedagem privada pelo Sites usa o controle de acesso da plataforma e um banco próprio. As contas e o progresso da versão local ficam separados dos dados da versão hospedada.
