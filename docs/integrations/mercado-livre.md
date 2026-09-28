# Integracao com Mercado Livre

## Finalidade

O caminho principal do OnFrame e o Worker em `onframe.onblide.com`: ele guarda
as credenciais das contas por workspace, chama a API do Mercado Livre e devolve
os contratos normalizados para a extensao. O contexto da pagina nunca recebe
tokens da conta, nem o bearer da extensao.

## Sistemas externos

- `https://api.mercadolibre.com` fornece itens, descricoes,
  caracteristicas, imagens, precos e promocoes.

## Autenticacao

1. A pessoa autenticada no Cloudflare Access abre `/connect` e gera um codigo
   de uso unico, valido por dez minutos.
2. A extensao troca o codigo por um bearer de sessao via
   `POST /v1/extension-sessions`; esse bearer fica apenas no `background`.
3. A pessoa administradora inicia `POST /v1/mercadolivre/oauth/start`. O
   Worker gera `state`, `code_verifier` e o desafio PKCE `S256`.
4. O Mercado Livre retorna para
   `https://onframe.onblide.com/oauth/mercadolivre/callback`. O Worker valida
   o estado, troca o codigo por tokens e consulta `/users/me`.
5. O Worker associa a conta ao workspace. A extensao recebe somente dados de
   operacao e nunca um token do Mercado Livre.

## Contas e propriedade do anuncio

O workspace suporta varias contas conectadas. Uma conta pode ser desativada sem
ser removida. Quando a requisicao informa `owner_user_id`, o Worker usa essa
conta; caso contrario, testa as contas habilitadas e seleciona aquela que
comprovar ser dona do anuncio. Contas desativadas nao podem editar anuncios.

## Segredos e armazenamento

O Worker em `onframe.onblide.com` vincula uma instalacao da extensao a um
workspace por um codigo temporario protegido pelo Cloudflare Access. O bearer
emitido nessa troca fica no `background` da extensao e serve apenas para a API
do OnFrame.

Para contas remotas, a extensao pede `POST /v1/mercadolivre/oauth/start` ao
Worker. Ele cria `state` de uso unico e um `code_verifier` PKCE, ambos validos
por dez minutos. Apenas o hash do `state` e armazenado; o `code_verifier` e
cifrado antes de ser gravado no D1.

O Mercado Livre retorna para
`https://onframe.onblide.com/oauth/mercadolivre/callback`, que precisa estar
registrado exatamente assim no aplicativo do Mercado Livre. O Worker troca o
codigo por tokens em `POST https://api.mercadolibre.com/oauth/token`, consulta
`GET https://api.mercadolibre.com/users/me` com o access token no header e
associa a conta ao workspace.

Os tokens sao cifrados por AES-GCM com uma chave `secret_key` do Worker antes
de entrar em `seller_credentials`. `MELI_CLIENT_ID` e `MELI_CLIENT_SECRET`
sao secrets do Worker, e `MELI_TOKEN_CIPHER_KEY` e a chave AES-GCM. Nenhum
desses valores, nem access token ou refresh token, e devolvido para a
extensao ou registrado em logs.

Com uma sessao remota valida, o `background` encaminha todos os contratos da
extensao iniciados em `/api/` para `/v1/api/` no Worker. O Worker preserva as
regras normalizadas de itens, fotos, descricao, caracteristicas, precos,
promocoes e acoes em massa e chama a API do Mercado Livre em nome da conta do
workspace. O contexto da pagina continua sem bearer da sessao e sem token do
Mercado Livre.

O refresh token do Mercado Livre e rotativo e de uso unico. Antes de renova-lo,
o Worker obtem um lock temporario por credencial no D1. A requisicao que detem
o lock grava imediatamente o novo access token e refresh token cifrados; as
demais esperam essa atualizacao em vez de reutilizar o refresh token antigo.

Instalacoes ainda nao vinculadas podem usar o armazenamento local de
compatibilidade em `.onframe/tokens.json`, cifrado com `AES-256-GCM`. Nunca
versione `.env`, tokens, `ONBLIDE_TOKEN_SECRET` ou arquivos em `.onframe/`.

## Contratos e fronteiras

- A extensao vinculada acessa `onframe.onblide.com` somente pelo `background`.
  Os modulos injetados nao recebem o bearer remoto.
- Sem vinculacao remota, a extensao mantem o servico local em `127.0.0.1` como
  caminho de compatibilidade.
- Requisicoes com `Origin` precisam vir da extensao autorizada pelo
  `manifest.json`, salvo `GET /health` e o callback de autorizacao.
- O servico expõe rotas por dominio para itens, descricao, caracteristicas,
  fotos, precificacao, promocoes e operacoes em massa.
- `GET /seller-promotions/items/{itemId}` informa participacoes; o
  `sale_price` identifica a oferta que determina o preco publico. As
  regras de apresentacao ficam em [Estados de promocoes](../product/promocoes.md).

## Falhas e recuperacao

Erros de autenticacao remota removem a sessao da extensao e orientam a pessoa
usuaria a vincular novamente. Se nenhuma conta habilitada for dona do anuncio,
a edicao e recusada. O Worker registra a operacao no historico de auditoria do
workspace. O diagnostico do [Servico local](../operations/servico-local.md) se
aplica apenas ao caminho de compatibilidade.

## Configuracao

| Variavel | Finalidade |
| --- | --- |
| `MELI_CLIENT_ID` | Secret do Worker com o identificador do aplicativo. |
| `MELI_CLIENT_SECRET` | Secret do Worker para a troca e renovacao de tokens. |
| `MELI_TOKEN_CIPHER_KEY` | Chave `secret_key` AES-GCM do Worker. |
| `MELI_REDIRECT_URI` | Callback OAuth remoto registrado no aplicativo. |
| `ML_SERVICE_PORT` | Porta do servico local de compatibilidade; padrao `4765`. |
| `ONBLIDE_TOKEN_SECRET` | Segredo do armazenamento local de compatibilidade. |
