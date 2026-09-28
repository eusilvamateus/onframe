# Integracao com Mercado Livre

## Finalidade

O OnFrame usa um servico local para autenticar contas, acessar a API do Mercado
Livre e devolver dados normalizados para a extensao. O contexto da pagina nunca
recebe tokens da conta.

## Sistemas externos

- `https://connect.onblide.com` atua como broker da autorizacao e da troca
  ou renovacao de tokens. A base pode ser alterada com
  `ONBLIDE_CONNECT_BASE_URL`.
- `https://api.mercadolibre.com` fornece itens, descricoes,
  caracteristicas, imagens, precos e promocoes.

## Autenticacao

1. A extensao solicita `POST /auth/start` ao servico local.
2. O servico cria `state`, `code_verifier` e o desafio PKCE
   `S256`, e pede ao broker a URL de autorizacao.
3. O navegador conclui a autorizacao do Mercado Livre e retorna para o callback
   local `/auth/mercadolivre/callback`.
4. O servico valida o estado pendente, troca o codigo pelo token por meio do
   broker e consulta `/users/me` para completar o perfil da conta.
5. O token e o perfil sao armazenados localmente; a extensao recebe apenas os
   dados necessarios para operar a conta.

Estados de autorizacao pendentes expiram em dez minutos. O servico renova o
access token quando ele esta ausente ou faltam menos de cinco minutos para a
expiracao.

## Contas e propriedade do anuncio

O armazenamento suporta varias contas conectadas. Uma conta pode ser desativada
sem ser removida. Quando a requisicao informa `owner_user_id`, o servico usa
essa conta; caso contrario, testa as contas habilitadas e seleciona aquela que
comprovar ser dona do anuncio. Contas desativadas nao podem editar anuncios.

## Segredos e armazenamento

A instalacao normal define `ML_TOKEN_STORE_PATH` para
`.onframe/tokens.json` dentro da pasta do OnFrame. O arquivo e cifrado
com `AES-256-GCM`. O bootstrap gera e guarda um
`ONBLIDE_TOKEN_SECRET` local em `.env` quando ele ainda nao existe.

Nao versione `.env`, tokens, `ONBLIDE_TOKEN_SECRET` ou arquivos em
`.onframe/`. A configuracao de exemplo e
[.env.example](../../.env.example); ela nao contem segredos.

## Acesso remoto em transicao

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

O refresh token do Mercado Livre e rotativo e de uso unico. As futuras rotas
remotas que consumirem a API renovarao a credencial somente quando necessario,
gravando atomica e imediatamente o novo refresh token retornado pela API.
Enquanto essas rotas nao forem migradas, as operacoes de anuncios continuam
usando `127.0.0.1`.

## Contratos e fronteiras

- A extensao acessa somente o servico local em `127.0.0.1`.
- A tela de opcoes tambem pode acessar `onframe.onblide.com` pelo `background`
  para vincular e administrar a sessao remota; os modulos injetados nao usam
  esse bearer.
- Requisicoes com `Origin` precisam vir da extensao autorizada pelo
  `manifest.json`, salvo `GET /health` e o callback de autorizacao.
- O servico expõe rotas por dominio para itens, descricao, caracteristicas,
  fotos, precificacao, promocoes e operacoes em massa.
- `GET /seller-promotions/items/{itemId}` informa participacoes; o
  `sale_price` identifica a oferta que determina o preco publico. As
  regras de apresentacao ficam em [Estados de promocoes](../product/promocoes.md).

## Falhas e recuperacao

Erros de autenticacao invalidam a operacao e orientam a pessoa usuaria a
conectar novamente. Se nenhuma conta habilitada for dona do anuncio, a edicao e
recusada. Diagnostique o processo e os logs conforme
[Servico local](../operations/servico-local.md).

## Configuracao

| Variavel | Finalidade |
| --- | --- |
| `ML_SERVICE_PORT` | Porta do servico local; padrao `4765`. |
| `ONBLIDE_CONNECT_BASE_URL` | Base do broker de autenticacao. |
| `ONBLIDE_TOKEN_SECRET` | Segredo local usado para cifrar tokens. |
| `ML_TOKEN_STORE_PATH` | Caminho local do banco cifrado de contas. |
| `ONFRAME_ALLOWED_ORIGINS` | Lista opcional de origens permitidas, separadas por virgula. |
