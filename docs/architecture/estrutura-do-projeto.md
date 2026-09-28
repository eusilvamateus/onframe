# Estrutura do projeto

## Objetivo

O OnFrame permite que vendedores do Mercado Livre gerenciem anuncios a partir
da pagina publica do produto. A arquitetura separa o codigo executado pelo
navegador das operacoes autenticadas. Quando a extensao esta vinculada a um
workspace, essas operacoes sao executadas pelo Worker remoto centralizado.

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

### Worker remoto (`cloudflare/`)

- O Worker em `onframe.onblide.com` concentra a identidade do workspace e as
  sessoes da extensao em D1.
- A pagina protegida `/connect` emite um codigo temporario; a extensao o troca
  por um bearer de sessao por `POST /v1/extension-sessions`.
- O bearer fica restrito ao `background` da extensao e valida
  `GET` e `DELETE /v1/extension-session`. A revogacao e persistida no D1.
- Com uma sessao valida, `POST /v1/mercadolivre/oauth/start` inicia a
  autorizacao e `GET /v1/accounts` lista as contas do workspace.
- O callback publico `/oauth/mercadolivre/callback` troca o codigo OAuth no
  servidor, consulta o perfil e cifra o par de tokens antes de grava-lo no D1.
- As requisicoes de dominio da extensao usam `/v1/api/*`, preservando os
  contratos de itens, fotos, descricao, caracteristicas, precos, promocoes e
  operacoes em massa sem expor token ao navegador.
- O refresh token e serializado por conta no D1 antes de ser rotacionado pelo
  Mercado Livre.

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
2. O modulo envia o contrato `/api/*` ao `background` da extensao.
3. Com uma sessao remota vinculada, o `background` o encaminha ao Worker; ele
   seleciona a conta do workspace, usa a credencial cifrada e normaliza a
   resposta do Mercado Livre.
4. A extensao atualiza a interface com o resultado, sem expor credenciais ao
   contexto da pagina.

Instalacoes que ainda nao foram vinculadas mantem o servico local como
compatibilidade temporaria. Uma extensao vinculada nao depende do processo
local para os contratos `/api/*`.

## Vinculacao remota

1. A pessoa autenticada no Cloudflare Access abre `/connect` e recebe um
   codigo de uso unico, valido por dez minutos.
2. A tela de opcoes envia esse codigo ao `background` da extensao.
3. O `background` troca o codigo por um bearer e o mantem fora da pagina e dos
   modulos injetados.
4. O Worker associa a sessao ao usuario e ao workspace; a extensao pode
   consultar esse contexto e revogar a propria sessao.

## Contratos e fronteiras

- A extensao nao chama a API autenticada do Mercado Livre diretamente.
- Tokens e outros segredos pertencem ao Worker e ao D1 cifrado quando a sessao
  remota esta vinculada; eles nao devem ser versionados nem enviados para o
  contexto da pagina.
- O bearer remoto identifica a extensao e o workspace, mas nao e um token do
  Mercado Livre. As credenciais dessa API ficam somente no Worker e no D1
  cifrado; elas nunca sao devolvidas para a extensao.
- `scripts/bootstrap/` e um contrato distribuido publicamente; seus nomes e
  comportamentos devem permanecer compativeis.
- A pagina de atualizacao e uma tela interna da extensao. Ela aciona o
  protocolo local `onframe-updater://` e nao depende de uma pagina HTTP servida
  pelo processo local.

## Referencias relacionadas

- [Estados de promocoes](../product/promocoes.md)
