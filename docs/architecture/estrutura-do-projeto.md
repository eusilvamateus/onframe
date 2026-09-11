# Estrutura do projeto

## Objetivo

O OnFrame permite que vendedores do Mercado Livre gerenciem anuncios a partir
da pagina publica do produto. A arquitetura separa o codigo executado pelo
navegador das operacoes autenticadas, que dependem de um servico local.

## Componentes envolvidos

### Extensao (`extension/`)

- `core/` concentra deteccao de paginas, registro de modulos, helpers e o shell
  que coordena a interface injetada.
- `modules/` implementa os dominios de fotos, descricao, caracteristicas e
  comercio.
- `ui/` contem popup, opcoes e as telas de acao abertas pela extensao.
- `styles/` concentra fundamentos, componentes e estilos das telas nativas.
- `assets/`, `fonts/` e `vendor/` armazenam recursos estaticos e bibliotecas
  vendorizadas.

### Servico local (`service/`)

- `server.js` inicia o processo local.
- `src/app.js` compoe a API HTTP usada pela extensao.
- `src/routes/` organiza os contratos por dominio.
- Os modulos de `src/` acessam o Mercado Livre, armazenam credenciais locais e
  aplicam regras de negocio, incluindo precificacao e promocoes.

### Scripts (`scripts/`)

- `bootstrap/` e o contrato publico de instalacao, inicio, parada, verificacao,
  atualizacao e remocao no Windows e macOS.
- `release/` valida versao, prepara notas e monta o pacote de distribuicao.

### Testes (`test/`)

Os testes Node cobrem os modelos da extensao, a API do servico e os contratos
dos scripts e telas que precisam permanecer estaveis.

## Fluxo principal

1. A extensao reconhece uma pagina de anuncio e injeta somente o modulo
   aplicavel.
2. O modulo chama a API HTTP do servico local para ler ou alterar dados do
   anuncio.
3. O servico usa as credenciais locais da conta conectada para chamar a API do
   Mercado Livre e normaliza a resposta para a extensao.
4. A extensao atualiza a interface com o resultado, sem expor credenciais ao
   contexto da pagina.

## Contratos e fronteiras

- A extensao nao chama a API autenticada do Mercado Livre diretamente.
- Tokens e outros segredos pertencem ao servico local e nao devem ser
  versionados nem enviados para o contexto da pagina.
- `scripts/bootstrap/` e um contrato distribuido publicamente; seus nomes e
  comportamentos devem permanecer compativeis.
- A pagina de atualizacao e uma tela interna da extensao. Ela aciona o
  protocolo local `onframe-updater://` e nao depende de uma pagina HTTP servida
  pelo processo local.

## Referencias relacionadas

- [Estados de promocoes](../product/promocoes.md)
